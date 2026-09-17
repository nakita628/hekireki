import { Effect } from 'effect'

import { quoteIdentifier } from '../../sql/index.js'
import type { Driver } from '../../studio/server/services/database.js'
import { MigrateConfigError } from '../errors.js'
import { engineCommand } from './engine.js'
import type { Engine } from './engine.js'
import type { MigrationsList } from './migrations-dir.js'

/** The table Prisma Migrate records what it has applied in. */
const MIGRATIONS_TABLE = '_prisma_migrations'

/**
 * `_prisma_migrations` as the schema engine creates it, character for character (the statements
 * are the ones in `schema-engine-wasm`). The engine creates it when it applies migrations, and not
 * when it only records one as applied, which a database being baselined has to have it for.
 */
const MIGRATIONS_TABLE_DDL = {
  sqlite: `CREATE TABLE "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
);`,
  postgresql: `CREATE TABLE _prisma_migrations (
    id                      VARCHAR(36) PRIMARY KEY NOT NULL,
    checksum                VARCHAR(64) NOT NULL,
    finished_at             TIMESTAMPTZ,
    migration_name          VARCHAR(255) NOT NULL,
    logs                    TEXT,
    rolled_back_at          TIMESTAMPTZ,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count     INTEGER NOT NULL DEFAULT 0
);`,
}

/** Nothing of the schema is left out of a command; `prisma.config.ts` is what excludes a table. */
const NO_FILTER = { externalTables: [], externalEnums: [] }

/** A schema file as every engine command takes it. */
type SchemaFiles = readonly { readonly path: string; readonly content: string }[]

/**
 * The migration that would take the database to the schema: the statements Prisma Migrate would
 * write for it, and whether there are any. Reads the database; writes nothing to it.
 *
 * @param input - the engine, the schema to migrate to, and the directory paths in it resolve from
 * @returns the SQL, empty when the database already matches the schema
 */
export function migrationDiff(input: {
  readonly engine: Engine
  readonly files: SchemaFiles
  readonly configDir: string
}) {
  return Effect.gen(function* () {
    const result = yield* engineCommand(() =>
      input.engine.diff({
        from: { tag: 'schemaDatasource', files: [...input.files], configDir: input.configDir },
        to: { tag: 'schemaDatamodel', files: [...input.files] },
        script: true,
        exitCode: true,
        filters: NO_FILTER,
      }),
    )
    // `--exit-code` says 2 for a diff that is not empty, 0 for one that is.
    return { sql: result.stdout ?? '', drift: result.exitCode === 2 }
  })
}

/** A text column of `_prisma_migrations`. */
function textOf(row: Readonly<Record<string, unknown>>, key: string) {
  const value = row[key]
  return typeof value === 'string' ? value : null
}

/**
 * An instant of `_prisma_migrations`, as an ISO string. PostgreSQL and MySQL hand it back as a
 * date; SQLite has no date type, and Prisma Migrate writes it there as a count of milliseconds.
 */
function instantOf(row: Readonly<Record<string, unknown>>, key: string) {
  const value = row[key]
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' || typeof value === 'bigint') {
    return new Date(Number(value)).toISOString()
  }
  return typeof value === 'string' ? value : null
}

/**
 * What the database has recorded in `_prisma_migrations`, and whether the table is there at all.
 * A database that has never been migrated has no such table, which is not an error.
 */
export function readAppliedMigrations(driver: Driver) {
  const table = quoteIdentifier(driver.dialect, MIGRATIONS_TABLE)
  return driver
    .query({
      sql: `SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, checksum FROM ${table} ORDER BY started_at ASC`,
      params: [],
    })
    .pipe(
      Effect.match({
        onFailure: () => ({ present: false, migrations: [] }),
        onSuccess: (result) => ({
          present: true,
          migrations: result.rows.map((row) => ({
            name: textOf(row, 'migration_name') ?? '',
            startedAt: instantOf(row, 'started_at'),
            finishedAt: instantOf(row, 'finished_at'),
            rolledBackAt: instantOf(row, 'rolled_back_at'),
            appliedStepsCount: Number(row.applied_steps_count ?? 0),
            checksum: textOf(row, 'checksum') ?? '',
          })),
        }),
      }),
    )
}

/**
 * The state of the migration history: what the database has applied, what the directory holds
 * that it has not, what failed or was edited after it ran, and whether the database has drifted
 * from the schema. Reads only.
 *
 * @param input - the engine, the open connection, the migrations directory and the schema
 * @returns the applied migrations, the pending ones and what the engine finds wrong
 */
export function migrationStatus(input: {
  readonly engine: Engine
  readonly driver: Driver
  readonly migrations: MigrationsList
  readonly files: SchemaFiles
  readonly configDir: string
}) {
  return Effect.gen(function* () {
    const applied = yield* readAppliedMigrations(input.driver)
    // The engine refuses to diagnose a database with no `_prisma_migrations` table rather than
    // reporting one; a database that has never been migrated is that, and has no history to read.
    const diagnosed = applied.present
      ? yield* engineCommand(() =>
          input.engine.diagnoseMigrationHistory({
            migrationsList: {
              ...input.migrations,
              migrationDirectories: [...input.migrations.migrationDirectories],
            },
            optInToShadowDatabase: false,
            filters: NO_FILTER,
          }),
        )
      : { editedMigrationNames: [], failedMigrationNames: [], history: null }
    const diff = yield* migrationDiff({
      engine: input.engine,
      files: input.files,
      configDir: input.configDir,
    })
    const appliedNames = new Set(applied.migrations.map((migration) => migration.name))
    const history = diagnosed.history
    // A database with tables and no history is one `prisma migrate deploy` refuses (P3005): the
    // migrations would create what is already there. It has to be baselined first.
    const empty = yield* engineCommand(() =>
      input.engine.diff({
        from: { tag: 'empty' },
        to: { tag: 'schemaDatasource', files: [...input.files], configDir: input.configDir },
        script: false,
        exitCode: true,
        filters: NO_FILTER,
      }),
    )
    return {
      hasMigrationsTable: applied.present,
      applied: applied.migrations,
      pending: input.migrations.migrationDirectories
        .map((directory) => directory.path)
        .filter((name) => !appliedNames.has(name)),
      failed: diagnosed.failedMigrationNames,
      edited: diagnosed.editedMigrationNames,
      /** `databaseIsBehind`, `migrationsDirectoryIsBehind` or `historiesDiverge`; null when in step. */
      divergence: history === null ? null : history.diagnostic,
      drift: diff.drift,
      // Recorded as applied, with no directory left to say what ran: deleted, or never committed.
      missingFiles: applied.migrations
        .map((migration) => migration.name)
        .filter(
          (name) =>
            !input.migrations.migrationDirectories.some((directory) => directory.path === name),
        ),
      baselineNeeded:
        applied.migrations.length === 0 &&
        input.migrations.migrationDirectories.length > 0 &&
        empty.exitCode === 2,
    }
  })
}

/** The migrations list cut after the one named: the history as it stands once that one has run. */
function historyUpTo(migrations: MigrationsList, name: string) {
  const at = migrations.migrationDirectories.findIndex((directory) => directory.path === name)
  return {
    ...migrations,
    migrationDirectories: migrations.migrationDirectories.slice(0, at + 1),
  }
}

/**
 * Whether the database is what the migrations up to each one would make of an empty one: the
 * migrations replayed into a shadow database and compared with the database as it is. A
 * migration the database matches is one it can be baselined at, recorded as applied with every
 * one before it; `difference` is the SQL that would take the replayed history to the database.
 *
 * @param input - the engine (its adapter able to open a shadow database), the migrations
 *   directory, and the schema files and directory the datasource is read from
 * @returns one entry per migration, oldest first
 */
export function baselineCandidates(input: {
  readonly engine: Engine
  readonly migrations: MigrationsList
  readonly files: SchemaFiles
  readonly configDir: string
}) {
  // One at a time: each replay makes and removes a shadow database of its own.
  return Effect.forEach(input.migrations.migrationDirectories, (directory) =>
    engineCommand(() =>
      input.engine.diff({
        from: { tag: 'migrations', ...historyUpTo(input.migrations, directory.path) },
        to: { tag: 'schemaDatasource', files: [...input.files], configDir: input.configDir },
        script: true,
        exitCode: true,
        filters: NO_FILTER,
      }),
    ).pipe(
      Effect.map((result) => ({
        name: directory.path,
        matches: result.exitCode === 0,
        difference: result.exitCode === 0 ? '' : (result.stdout ?? ''),
      })),
    ),
  )
}

/**
 * Baselines the database at a migration: records it and every migration before it as applied
 * without running them, as `prisma migrate resolve --applied` does one at a time. The database is
 * checked against the migrations first, and refused when it does not match them: a history that
 * says a table exists when it does not makes every later migration fail.
 *
 * @param input - the engine, the migrations directory, the schema, and the last migration to record
 * @returns the migrations recorded, oldest first
 */
export function baselineMigrations(input: {
  readonly engine: Engine
  readonly driver: Driver
  readonly migrations: MigrationsList
  readonly files: SchemaFiles
  readonly configDir: string
  readonly name: string
}) {
  return Effect.gen(function* () {
    const history = historyUpTo(input.migrations, input.name)
    if (!history.migrationDirectories.some((directory) => directory.path === input.name)) {
      return yield* new MigrateConfigError({
        message: `There is no migration ${input.name} in ${input.migrations.baseDir}.`,
      })
    }
    const checked = yield* engineCommand(() =>
      input.engine.diff({
        from: { tag: 'migrations', ...history },
        to: { tag: 'schemaDatasource', files: [...input.files], configDir: input.configDir },
        script: true,
        exitCode: true,
        filters: NO_FILTER,
      }),
    )
    if (checked.exitCode !== 0) {
      return yield* new MigrateConfigError({
        message: `The database is not what the migrations up to ${input.name} make: recorded as applied, the migrations after it would fail. What the database has that they do not:\n${checked.stdout ?? ''}`,
      })
    }
    const names = history.migrationDirectories.map((directory) => directory.path)
    yield* Effect.forEach(names, (name) =>
      markMigrationApplied({
        engine: input.engine,
        driver: input.driver,
        migrations: input.migrations,
        name,
      }),
    )
    return names
  })
}

/**
 * Applies every migration of the directory the database has not run yet, as
 * `prisma migrate deploy` does, and records each one in `_prisma_migrations`.
 *
 * @param input - the engine and the migrations directory
 * @returns the names of the migrations that ran
 */
export function applyPendingMigrations(input: {
  readonly engine: Engine
  readonly migrations: MigrationsList
}) {
  return engineCommand(() =>
    input.engine.applyMigrations({
      migrationsList: {
        ...input.migrations,
        migrationDirectories: [...input.migrations.migrationDirectories],
      },
      filters: NO_FILTER,
    }),
  ).pipe(Effect.map((result) => ({ applied: result.appliedMigrationNames })))
}

/** What one statement of a staged apply did, or why the database refused it. */
type StatementResult = {
  readonly sql: string
  readonly affected: number | null
  readonly error: string | null
}

/**
 * Runs the statements one at a time, in order, and stops at the first one the database refuses.
 * This is what applying a migration a step at a time means: what ran stays run, and the report
 * says how far it got, because none of the three databases rolls back a DDL statement already done.
 *
 * @param input - the open connection and the statements, in the order they must run
 * @returns one result per statement attempted, and the index of the one that failed
 */
export function applyStatements(input: {
  readonly driver: Driver
  readonly statements: readonly string[]
}) {
  return Effect.gen(function* () {
    const results = yield* Effect.reduce(
      input.statements,
      (): readonly StatementResult[] => [],
      (done, sql) =>
        done.some((result) => result.error !== null)
          ? Effect.succeed(done)
          : input.driver.executeRaw({ sql, params: [] }).pipe(
              Effect.match({
                onFailure: (error) => [...done, { sql, affected: null, error: error.cause }],
                onSuccess: (affected) => [...done, { sql, affected, error: null }],
              }),
            ),
    )
    const failed = results.findIndex((result) => result.error !== null)
    return { results, failedAt: failed === -1 ? null : failed, ok: failed === -1 }
  })
}

/**
 * Records a migration as applied without running it: for the statements already run a step at a
 * time, and for a baseline. The engine writes the row and does not make the table, which only
 * applying migrations does; so a database that has never been migrated gets `_prisma_migrations`
 * first, as the engine itself would create it.
 *
 * @param input - the engine, the open connection, the migrations directory and the name of the migration
 */
export function markMigrationApplied(input: {
  readonly engine: Engine
  readonly driver: Driver
  readonly migrations: MigrationsList
  readonly name: string
}) {
  return Effect.gen(function* () {
    const applied = yield* readAppliedMigrations(input.driver)
    if (!applied.present) {
      if (input.driver.dialect === 'mysql') {
        return yield* new MigrateConfigError({
          message:
            'Studio cannot record a migration on a MySQL database that has never been migrated: run `prisma migrate resolve --applied`.',
        })
      }
      yield* input.driver.executeScript(MIGRATIONS_TABLE_DDL[input.driver.dialect]).pipe(
        Effect.mapError(
          (error) =>
            new MigrateConfigError({
              message: `_prisma_migrations could not be created: ${error.cause}`,
            }),
        ),
      )
    }
    return yield* engineCommand(() =>
      input.engine.markMigrationApplied({
        migrationName: input.name,
        migrationsList: {
          ...input.migrations,
          migrationDirectories: [...input.migrations.migrationDirectories],
        },
      }),
    )
  })
}

/**
 * Records a migration as rolled back, for one that failed and left the database as it was. It
 * stays in `_prisma_migrations` as what happened, and stops counting as failed, which is what a
 * database has to have before anything else can be applied to it.
 *
 * @param input - the engine and the name of the migration that failed
 */
export function markMigrationRolledBack(input: { readonly engine: Engine; readonly name: string }) {
  return engineCommand(() => input.engine.markMigrationRolledBack({ migrationName: input.name }))
}
