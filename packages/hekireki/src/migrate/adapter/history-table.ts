import { createHash, randomUUID } from 'node:crypto'

import { Effect, Result } from 'effect'

import { splitStatements } from '../../sql/index.js'
import type { Driver } from '../../studio/server/services/database.js'
import {
  MIGRATIONS_TABLE_DDL,
  makeHistoryStatus,
  migrationRecordStatements,
} from '../domain/history.js'
import { MigrateConfigError, MigrateDatabaseError } from '../errors.js'
import { readAppliedMigrations } from './commands.js'
import { introspectDatabase } from './introspect.js'
import type { MigrationsList } from './migrations-dir.js'

// The migration history kept by Studio itself, for a database Prisma's schema engine cannot be
// given a connection to (MySQL and MariaDB, and a PostgreSQL schema other than `public`). What is
// written is what Prisma Migrate writes, row for row, so `prisma migrate status` and `deploy`
// read it as their own.

/** The checksum Prisma Migrate keeps of a migration.sql: SHA-256 of its bytes, in hex. */
function checksumOf(sql: string) {
  return createHash('sha256').update(sql, 'utf8').digest('hex')
}

/**
 * The history as the page shows it, without the engine: the rows of `_prisma_migrations` set
 * against the migrations directory.
 *
 * @param input - the open connection and the migrations directory as read
 * @returns what has been applied, what is pending, what failed or was edited since it ran
 */
export function readHistoryWithoutEngine(input: {
  readonly driver: Driver
  readonly migrations: MigrationsList
}) {
  return Effect.gen(function* () {
    const applied = yield* readAppliedMigrations(input.driver)
    const introspected = yield* introspectDatabase({
      driver: input.driver,
      dialect: input.driver.dialect,
      schemas: [],
    })
    return {
      applied: applied.migrations,
      ...makeHistoryStatus({
        present: applied.present,
        applied: applied.migrations,
        directories: input.migrations.migrationDirectories.map((directory) => ({
          name: directory.path,
          checksum:
            directory.migrationFile.content.tag === 'ok'
              ? checksumOf(directory.migrationFile.content.value)
              : null,
        })),
        hasTables: introspected.tables.length > 0,
      }),
    }
  }).pipe(
    Effect.catchTag('DatabaseError', (error) =>
      Effect.fail(new MigrateDatabaseError({ message: error.cause })),
    ),
  )
}

/** The migration.sql of one migration of the directory, refused when it is not there or does not read. */
function migrationSqlOf(migrations: MigrationsList, name: string) {
  const directory = migrations.migrationDirectories.find((one) => one.path === name)
  return directory?.migrationFile.content.tag === 'ok'
    ? Effect.succeed(directory.migrationFile.content.value)
    : Effect.fail(
        new MigrateConfigError({
          message: `There is no migration ${name} in ${migrations.baseDir} with a migration.sql to read.`,
        }),
      )
}

/** `_prisma_migrations`, made as the engine makes it when the database has never been migrated. */
function ensureHistoryTable(driver: Driver) {
  return Effect.gen(function* () {
    const applied = yield* readAppliedMigrations(driver)
    if (!applied.present) yield* driver.executeScript(MIGRATIONS_TABLE_DDL[driver.dialect])
    return applied
  })
}

/**
 * Records a migration as applied without running it, as `prisma migrate resolve --applied` does:
 * for the steps of a plan already run one at a time.
 *
 * @param input - the open connection, the migrations directory and the migration's name
 */
export function recordAppliedWithoutEngine(input: {
  readonly driver: Driver
  readonly migrations: MigrationsList
  readonly name: string
}) {
  return Effect.gen(function* () {
    const sql = yield* migrationSqlOf(input.migrations, input.name)
    const applied = yield* ensureHistoryTable(input.driver)
    if (applied.migrations.some((row) => row.name === input.name && row.rolledBackAt === null)) {
      return yield* new MigrateConfigError({
        message: `${input.name} is recorded already.`,
      })
    }
    yield* input.driver.executeRaw({
      sql: migrationRecordStatements(input.driver.dialect).resolved,
      params: [randomUUID(), checksumOf(sql), input.name],
    })
    return input.name
  }).pipe(
    Effect.catchTag('DatabaseError', (error) =>
      Effect.fail(new MigrateDatabaseError({ message: error.cause })),
    ),
  )
}

/**
 * Marks a failed migration as rolled back, as `prisma migrate resolve --rolled-back` does.
 *
 * @param input - the open connection and the migration's name
 */
export function recordRolledBackWithoutEngine(input: {
  readonly driver: Driver
  readonly name: string
}) {
  return Effect.gen(function* () {
    const marked = yield* input.driver.executeRaw({
      sql: migrationRecordStatements(input.driver.dialect).rolledBack,
      params: [input.name],
    })
    if (marked === 0) {
      return yield* new MigrateConfigError({
        message: `There is no failed migration ${input.name} to mark as rolled back.`,
      })
    }
    return input.name
  }).pipe(
    Effect.catchTag('DatabaseError', (error) =>
      Effect.fail(new MigrateDatabaseError({ message: error.cause })),
    ),
  )
}

/**
 * One migration of a deploy: recorded as started, its statements run (PostgreSQL takes the file
 * as one script, in the one transaction a script is; MySQL a statement at a time, as it commits
 * each anyway), and recorded as finished, or left with the error in its logs.
 */
function deployOne(input: {
  readonly driver: Driver
  readonly migrations: MigrationsList
  readonly name: string
}) {
  return Effect.gen(function* () {
    const { driver } = input
    const statements = migrationRecordStatements(driver.dialect)
    const sql = yield* migrationSqlOf(input.migrations, input.name)
    const id = randomUUID()
    yield* driver.executeRaw({ sql: statements.started, params: [id, checksumOf(sql), input.name] })
    const ran = yield* (
      driver.dialect === 'mysql'
        ? Effect.forEach(
            splitStatements(sql).filter(
              (statement) => statement.replaceAll(/^\s*--.*$/gmu, '').trim() !== '',
            ),
            (statement) => driver.executeRaw({ sql: statement, params: [] }),
            { discard: true },
          )
        : driver.executeScript(sql)
    ).pipe(Effect.result)
    if (Result.isFailure(ran)) {
      yield* driver
        .executeRaw({ sql: statements.failed, params: [ran.failure.cause, id] })
        .pipe(Effect.ignore)
      return yield* new MigrateDatabaseError({
        message: `${input.name} failed, and nothing after it was applied: ${ran.failure.cause}`,
      })
    }
    yield* driver.executeRaw({ sql: statements.finished, params: [id] })
    return input.name
  })
}

/**
 * Runs every migration the database has not, in order, as `prisma migrate deploy` does, and stops
 * at the first that fails. A failed migration not yet resolved stops it before anything runs, as
 * it stops Prisma.
 *
 * @param input - the open connection and the migrations directory
 * @returns the migrations that ran
 */
export function deployWithoutEngine(input: {
  readonly driver: Driver
  readonly migrations: MigrationsList
}) {
  return Effect.gen(function* () {
    const status = yield* readHistoryWithoutEngine(input)
    const [failed] = status.failed
    if (failed !== undefined) {
      return yield* new MigrateConfigError({
        message: `${failed} failed and has not been resolved: mark it as rolled back, or finish it by hand and record it, before anything else is applied.`,
      })
    }
    yield* ensureHistoryTable(input.driver)
    const applied = yield* Effect.forEach(status.pending, (name) =>
      deployOne({ driver: input.driver, migrations: input.migrations, name }),
    )
    return { applied }
  }).pipe(
    Effect.catchTag('DatabaseError', (error) =>
      Effect.fail(new MigrateDatabaseError({ message: error.cause })),
    ),
  )
}
