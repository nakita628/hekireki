import { Effect, Ref } from 'effect'
import type { FileSystem } from 'effect'

import { qualifiedName, quoteIdentifier } from '../../sql/index.js'
import type { DatabaseUnavailableError } from '../../studio/server/errors/index.js'
import type { Driver } from '../../studio/server/services/database.js'
import type { MigrateEngineError } from '../errors.js'
import { applyStatements, migrationDiff } from './commands.js'
import type { Engine } from './engine.js'
import { introspectDatabase } from './introspect.js'

/** How long a rehearsal on PostgreSQL waits for a lock, in milliseconds, before it gives up. */
const REHEARSAL_LOCK_TIMEOUT = 5000

/**
 * What a step PostgreSQL cannot rehearse inside a transaction holds: an index made
 * `CONCURRENTLY`, or an enum value added and used in the same transaction. A rehearsal that fails
 * on one says nothing about the real run.
 */
const OUTSIDE_TRANSACTION = /\bCONCURRENTLY\b|\bADD\s+VALUE\b/iu

/**
 * Every table of the database with its rows counted. The migration history is not among them:
 * the introspection leaves Prisma Migrate's own table out.
 */
export function countTables(driver: Driver) {
  return Effect.gen(function* () {
    const introspected = yield* introspectDatabase({
      driver,
      dialect: driver.dialect,
      schemas: [],
    })
    return yield* Effect.forEach(introspected.tables, (table) =>
      driver
        .query({
          sql: `SELECT COUNT(*) AS ${quoteIdentifier(driver.dialect, 'count')} FROM ${qualifiedName(driver.dialect, table)}`,
          params: [],
        })
        .pipe(
          Effect.map((result) => ({
            table: table.table,
            rows: Number(result.rows[0]?.count ?? 0),
          })),
          Effect.orElseSucceed(() => ({ table: table.table, rows: null })),
        ),
    )
  })
}

/**
 * The migration run for real and taken back: every step in order on a database that is this one,
 * then compared with the schema. On SQLite the steps run on a copy of the file, which is removed
 * afterwards; on PostgreSQL they run in a transaction on the connection Studio holds, which is
 * rolled back whatever happens. Nothing of it remains in the database either way.
 *
 * @param input - the open connection, the steps (each its statements in order), the schema files
 *   and the directory paths in them resolve from, and how to open the copy SQLite rehearses on
 * @returns how each step went, each table's rows before and after, and whether the database then
 *   matches the schema, with what still differs
 */
export function rehearseMigration(input: {
  readonly driver: Driver
  readonly steps: readonly (readonly string[])[]
  readonly files: readonly { readonly path: string; readonly content: string }[]
  readonly configDir: string
  /**
   * The engine that reads the database the steps leave, opened on it; null when none can, and
   * what the steps left is not compared with the schema.
   */
  readonly compareWith:
    | ((
        target: Driver & { readonly url?: string },
      ) => Effect.Effect<Engine, MigrateEngineError, FileSystem.FileSystem>)
    | null
  /** A copy to rehearse on, with its URL when it has one of its own. */
  readonly openCopy: () => Effect.Effect<
    Driver & { readonly url?: string },
    DatabaseUnavailableError
  >
}) {
  return Effect.gen(function* () {
    const { driver } = input
    // MySQL commits a DDL statement as it runs: nothing of a transaction would be taken back.
    if (driver.dialect === 'sqlite' || driver.dialect === 'mysql') {
      const copy = yield* input.openCopy()
      return yield* rehearseOn({ ...input, target: copy }).pipe(Effect.ensuring(copy.close))
    }
    // The steps take the locks the real run takes, and hold them until the rollback. Waiting for
    // one behind a long transaction would queue every other query of the table behind the
    // rehearsal, so it gives up instead: a rehearsal must not be what stops the database.
    yield* driver.executeScript(`BEGIN; SET LOCAL lock_timeout = ${REHEARSAL_LOCK_TIMEOUT}`)
    return yield* rehearseOn({ ...input, target: driver }).pipe(
      Effect.ensuring(driver.executeScript('ROLLBACK').pipe(Effect.ignore)),
    )
  })
}

/**
 * The steps run on the database a rehearsal is given — a copy, or a transaction that is rolled
 * back — with the rows of every table counted before and after.
 *
 * @param input - the database to run on, the steps, and the schema to compare the result with
 * @returns how each step went, the rows of each table, and what still differs from the schema
 */
function rehearseOn(input: {
  readonly target: Driver & { readonly url?: string }
  readonly steps: readonly (readonly string[])[]
  readonly files: readonly { readonly path: string; readonly content: string }[]
  readonly configDir: string
  readonly compareWith:
    | ((
        target: Driver & { readonly url?: string },
      ) => Effect.Effect<Engine, MigrateEngineError, FileSystem.FileSystem>)
    | null
}) {
  return Effect.gen(function* () {
    const { target } = input
    const copied = target.dialect === 'sqlite' || target.dialect === 'mysql'
    const before = yield* countTables(target)
    // A step after one that failed is not run: it was written for a database the failure never made.
    const failedYet = yield* Ref.make(false)
    const results = yield* Effect.forEach(input.steps, (statements) =>
      rehearseStep({ target, statements, failedYet }),
    )
    const after = yield* countTables(target)
    const ok = results.every((step) => step.ok)
    // What the schema engine makes of the database the steps left: nothing, when it matches.
    const diff =
      input.compareWith === null
        ? null
        : yield* migrationDiff({
            engine: yield* input.compareWith(target),
            files: input.files,
            configDir: input.configDir,
          })
    return {
      ok,
      steps: results,
      tables: [...new Set([...before, ...after].map((one) => one.table))].map((table) => ({
        table,
        before: before.find((one) => one.table === table)?.rows ?? null,
        after: after.find((one) => one.table === table)?.rows ?? null,
      })),
      /** Null when the engine cannot be asked: the result is not compared with the schema. */
      schemaMatches: diff === null ? null : !diff.drift,
      difference: diff?.drift === true ? diff.sql : '',
      limitations: copied
        ? []
        : [
            ...(input.steps.flat().some((statement) => OUTSIDE_TRANSACTION.test(statement))
              ? ['outside-transaction']
              : []),
            // Not a copy: the tables of the database itself were locked while the steps ran.
            'locks-tables',
          ],
    }
  })
}

/**
 * One step of a rehearsal: its statements run, or nothing when a step before it failed.
 *
 * @param input - the database, the step's statements, and whether a step has failed already
 * @returns whether it ran and went through, the rows it touched, and what failed
 */
function rehearseStep(input: {
  readonly target: Driver
  readonly statements: readonly string[]
  readonly failedYet: Ref.Ref<boolean>
}) {
  return Effect.gen(function* () {
    if (yield* Ref.get(input.failedYet)) {
      return { ran: false, ok: false, affected: null, error: null, statement: null }
    }
    const applied = yield* applyStatements({ driver: input.target, statements: input.statements })
    yield* Ref.set(input.failedYet, !applied.ok)
    const failed = applied.results.find((result) => result.error !== null)
    return {
      ran: true,
      ok: applied.ok,
      affected: applied.results.reduce((sum, result) => sum + (result.affected ?? 0), 0),
      error: failed?.error ?? null,
      statement: failed?.sql ?? null,
    }
  })
}
