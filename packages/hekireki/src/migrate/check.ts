import path from 'node:path'

import { Effect } from 'effect'
import type * as z from 'zod'

import { isDirectory } from '../file/index.js'
import { readConfigUrl } from '../seed/load-config.js'
import { withTypeScriptImports } from '../seed/resolve.js'
import { dialectOf, parseSchema, readSchemaFiles, schemaText } from '../seed/schema.js'
import type { SchemaFile } from '../seed/schema.js'
import { connectDatabase } from '../studio/server/services/database.js'
import type { Driver } from '../studio/server/services/database.js'
import { DECISIONS_FILE, readDecisions } from './adapter/decisions-file.js'
import { introspectDatabase } from './adapter/introspect.js'
import { adviseChecks, storedValues } from './domain/advice.js'
import { fieldOf, makeChecks } from './domain/checks.js'
import { Decisions, decisionSubject, makeDecisionModels } from './domain/decisions.js'
import { readOnlyStatements, timeoutStatements } from './domain/session.js'
import { makeExpectedTables } from './domain/tables.js'
import { MigrateConfigError, MigrateDatabaseError } from './errors.js'

/** The number a `COUNT(*)` came back as: a string from pg (it is a bigint), a number elsewhere. */
function countOf(rows: readonly Readonly<Record<string, unknown>>[]) {
  const value = Number(rows[0]?.count)
  return Number.isFinite(value) ? value : null
}

/** A check with its count: what the report calls it. */
function statusOf(
  check: { readonly severity: string; readonly guaranteed: boolean },
  count: number | null,
) {
  if (check.guaranteed) return 'guaranteed' as const
  if (count === null) return 'failed' as const
  if (count === 0) return 'passed' as const
  return check.severity === 'blocking' ? ('blocking' as const) : ('warning' as const)
}

function checkProgram(input: {
  readonly schemaPath: string
  readonly url: string | null
  /** `--decisions`; `.hekireki/migrate.json` beside the schema when null. */
  readonly decisions: string | null
  /** `--timeout`, in milliseconds. */
  readonly timeout: number | null
  readonly cwd: string
  readonly env: Readonly<Record<string, string | undefined>>
}) {
  return Effect.gen(function* () {
    const files = yield* readSchemaFiles(input.schemaPath).pipe(
      Effect.mapError((error) => new MigrateConfigError({ message: error.message })),
    )
    const schema = yield* parseSchema(files).pipe(
      Effect.mapError((error) => new MigrateConfigError({ message: error.message })),
    )
    const directory = yield* isDirectory(input.schemaPath).pipe(Effect.orElseSucceed(() => false))
    const schemaDir = directory ? input.schemaPath : path.dirname(input.schemaPath)
    // The decisions made on the Migrate page of `hekireki studio`: they decide what is counted,
    // so a file that does not read stops here.
    const decisionsPath =
      input.decisions === null
        ? path.join(path.resolve(input.cwd, schemaDir), DECISIONS_FILE)
        : path.resolve(input.cwd, input.decisions)
    const decisions = yield* readDecisions(decisionsPath)
    // The `url` of hekireki.config.ts, as `hekireki studio` and `hekireki seed` read it.
    const configUrl = yield* readConfigUrl(input.cwd).pipe(
      Effect.mapError((error) => new MigrateConfigError({ message: error.message })),
    )
    const db = yield* connectDatabase({
      explicitUrl: input.url,
      configUrl,
      configError: null,
      schemaText: schemaText(files),
      schemaProvider: schema.provider,
      cwd: input.cwd,
      schemaDir,
      env: input.env,
    })
    yield* Effect.addFinalizer(() => db.close)
    if (db.target === null) {
      return yield* new MigrateDatabaseError({
        message: db.status.error ?? 'No database connected.',
      })
    }
    const dialect = db.target.dialect
    const provider = dialectOf(schema.provider)
    if (provider !== null && provider !== dialect) {
      return yield* new MigrateDatabaseError({
        message: `The schema is written for ${schema.provider ?? provider}, but the database URL points at ${dialect}.\n   Pass --url with the database the schema migrates.`,
      })
    }
    const driver = yield* db.driver
    return yield* checkOpened({
      driver,
      url: db.status.url ?? '',
      schemaPath: input.schemaPath,
      decisionsPath,
      decisions,
      setAside: false,
      files,
      timeout: input.timeout,
      readOnly: true,
    })
  })
}

/**
 * The check itself, against a connection that is already open: what the schema asks of the rows
 * the database holds now, and the fixes of the decisions counted against them. Every statement it
 * sends is a SELECT.
 *
 * `readOnly` sets the connection so nothing run on it can write, whatever it says. That is for a
 * connection of the check's own; Studio shares one with the rest of its pages and must not be
 * left that way, and has nothing to guard against, because the check only reads.
 *
 * @param input - the open connection, the schema, the fixes and how long a query may run
 * @returns the report `summarize`, `checkBanner`, `checkJson` and `makePlan` read
 */
export function checkOpened(input: {
  readonly driver: Driver
  readonly url: string
  readonly schemaPath: string
  /** Where the decisions were read from, for what the report says about them. */
  readonly decisionsPath: string
  /** As the file or the wire has them: they are read through `Decisions` before anything else. */
  readonly decisions: z.input<typeof Decisions>
  /**
   * Whether a decision that no longer fits (a field the schema has lost since it was made) is set
   * aside and reported rather than refused. Studio shows those to be taken out; the command line,
   * which has no one to ask, refuses them.
   */
  readonly setAside: boolean
  readonly files: readonly SchemaFile[]
  readonly timeout: number | null
  readonly readOnly: boolean
}) {
  return Effect.gen(function* () {
    const { driver } = input
    // A kind there is no check of, or a choice the check does not offer, stops here rather than
    // reaching a fix.
    const result = Decisions.safeParse(input.decisions)
    if (!result.success) {
      return yield* new MigrateConfigError({
        message: `The decisions in ${input.decisionsPath} do not read: ${result.error.issues
          .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
          .join('; ')}`,
      })
    }
    const decisions = result.data
    const schema = yield* parseSchema(input.files).pipe(
      Effect.mapError((error) => new MigrateConfigError({ message: error.message })),
    )
    const dialect = driver.dialect
    const run = (statements: readonly string[]) =>
      Effect.forEach(statements, (sql) => driver.query({ sql, params: [] })).pipe(
        Effect.mapError(
          (error) =>
            new MigrateDatabaseError({ message: `Cannot prepare the connection: ${error.cause}` }),
        ),
      )
    if (input.readOnly) yield* run(readOnlyStatements(dialect))
    const schemas = [
      ...new Set(
        schema.datamodel.models.flatMap((model) => (model.schema === null ? [] : [model.schema])),
      ),
    ]
    const introspected = yield* introspectDatabase({ driver, dialect, schemas }).pipe(
      Effect.mapError(
        (error) =>
          new MigrateDatabaseError({
            message: `Cannot read the tables of the database: ${error.cause}`,
          }),
      ),
    )
    yield* run(timeoutStatements(dialect, introspected.mariadb, input.timeout))
    const expected = makeExpectedTables(schema.datamodel)
    const cockroach = schema.provider === 'cockroachdb'
    const checksWith = (kept: z.infer<typeof Decisions>) =>
      makeChecks({
        dialect,
        expected,
        actual: introspected.tables,
        defaultSchema: introspected.defaultSchema,
        mariadb: introspected.mariadb,
        cockroach,
        fixes: makeDecisionModels(kept),
      })
    const tried = checksWith(decisions)
    // Each error names what it is about before its first colon: `User.hekireki: ...`, or the model.
    const setAside = input.setAside
      ? decisions.flatMap((decision) => {
          const reasons = tried.errors.filter((error) => {
            const about = error.slice(0, error.indexOf(': '))
            return about === decisionSubject(decision) || about === decision.modelName
          })
          return reasons.length === 0 ? [] : [{ decision, reasons }]
        })
      : []
    const planned =
      setAside.length === 0
        ? tried
        : checksWith(
            decisions.filter((decision) => !setAside.some((one) => one.decision === decision)),
          )
    if (planned.errors.length > 0) {
      return yield* new MigrateConfigError({
        message: `The decisions in ${input.decisionsPath} do not fit the schema and the database:\n   ${planned.errors.join('\n   ')}\n   Decide them again on the Migrate page of hekireki studio.`,
      })
    }
    // What a person needs to read each check by, and the decision most likely to fit it. The
    // values an enum column stores now say which of them the new enum loses.
    const stored = new Map(
      yield* Effect.forEach(
        planned.checks.filter((check) => check.kind === 'enum' && !check.guaranteed),
        (check) => {
          const table = expected.find((t) => t.model === check.model)
          const column = table?.columns.find((c) => c.field === fieldOf(check))
          if (table === undefined || column === undefined) return Effect.succeed([])
          return driver.query(storedValues(dialect, table, column.column)).pipe(
            Effect.match({
              onFailure: () => [],
              onSuccess: (read) => [
                [check.subject, read.rows.map((row) => String(row.value))] as const,
              ],
            }),
          )
        },
      ).pipe(Effect.map((entries) => entries.flat())),
    )
    const advice = adviseChecks({
      dialect,
      cockroach,
      expected,
      actual: introspected.tables,
      checks: planned.checks,
      stored,
    })
    const fixes = yield* Effect.forEach(planned.fixes, (fix) =>
      driver.query(fix.count).pipe(
        Effect.match({
          onFailure: (error) => ({ ...fix, rows: null, error: error.cause }),
          onSuccess: (counted) => ({ ...fix, rows: countOf(counted.rows), error: null }),
        }),
      ),
    )
    // One query at a time: the check reads, and a production database should feel it as little as it can.
    const results = yield* Effect.forEach(planned.checks, (check, index) => {
      const { facts, suggestion, candidates, destinations } = advice[index] ?? {
        facts: {},
        suggestion: null,
        candidates: [],
        destinations: [],
      }
      return check.guaranteed
        ? Effect.succeed({
            ...check,
            status: statusOf(check, 0),
            count: 0,
            error: null,
            facts,
            suggestion,
            candidates,
            destinations,
          })
        : driver.query(check.statement).pipe(
            Effect.match({
              onFailure: (error) => ({
                ...check,
                status: statusOf(check, null),
                count: null,
                error: error.cause,
                facts,
                suggestion,
                candidates,
                destinations,
              }),
              onSuccess: (counted) => {
                const count = countOf(counted.rows)
                return {
                  ...check,
                  status: statusOf(check, count),
                  count,
                  error: count === null ? 'The count query returned no number.' : null,
                  facts,
                  suggestion,
                  candidates,
                  destinations,
                }
              },
            }),
          )
    })
    return {
      schemaPath: path.resolve(input.schemaPath),
      decisionsPath: input.decisionsPath,
      /** The decisions set aside because they no longer fit, each with why. */
      unfit: setAside.map(({ decision, reasons }) => ({
        kind: decision.kind,
        modelName: decision.modelName,
        field: decision.field,
        choice: decision.choice,
        value: decision.value,
        reasons,
      })),
      database: {
        dialect,
        url: input.url,
        mariadb: introspected.mariadb,
        cockroach,
      },
      added: planned.added,
      /** The tables with triggers or CHECK constraints: what the schema does not describe, for the plan to say what a migration does to it. */
      unmanaged: introspected.tables.flatMap((table) =>
        table.triggers.length + table.checks.length === 0
          ? []
          : [{ table: table.table, triggers: table.triggers, checks: table.checks }],
      ),
      fixes,
      previews: planned.previews,
      rewrite: {
        ...planned.rewrite,
        /** Whether a column is nullable now, for the moment MySQL's ENUM is widened in the migration. */
        nullable: (
          table: { readonly schema: string | null; readonly table: string },
          column: string,
        ) =>
          introspected.tables
            .find(
              (t) =>
                t.table === table.table && (table.schema === null || t.schema === table.schema),
            )
            ?.columns.find((c) => c.name === column)?.nullable ?? true,
      },
      results,
    }
  })
}

/**
 * `hekireki migrate check`: the schema as it is about to be migrated, against the rows the
 * database holds now. Every query is a `SELECT`; nothing is written.
 */
export function runMigrateCheck(input: Parameters<typeof checkProgram>[0]) {
  return withTypeScriptImports(
    Effect.scoped(checkProgram(input)).pipe(
      Effect.catchTag('DatabaseUnavailableError', (error) =>
        Effect.fail(new MigrateDatabaseError({ message: error.reason })),
      ),
    ),
  )
}
