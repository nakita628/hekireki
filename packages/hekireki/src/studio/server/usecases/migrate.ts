import path from 'node:path'

import { layer as nodeFileSystemLayer } from '@effect/platform-node/NodeFileSystem'
import { Effect } from 'effect'
import * as z from 'zod'

import { removePath } from '../../../file/index.js'
import { createBackup, listBackups, restoreBackup } from '../../../migrate/adapter/backup.js'
import {
  applyPendingMigrations,
  applyStatements,
  baselineCandidates,
  baselineMigrations,
  markMigrationApplied,
  markMigrationRolledBack,
  migrationDiff,
  migrationStatus,
} from '../../../migrate/adapter/commands.js'
import {
  DECISIONS_FILE,
  readDecisions,
  writeDecisions,
} from '../../../migrate/adapter/decisions-file.js'
import { readMigrationsList, writeMigration } from '../../../migrate/adapter/migrations-dir.js'
import { countTables, rehearseMigration } from '../../../migrate/adapter/rehearse.js'
import { checkOpened } from '../../../migrate/check.js'
import { migrationName, withLockfile } from '../../../migrate/domain/history.js'
import { makePlan } from '../../../migrate/domain/plan.js'
import {
  MigrateConfigError,
  MigrateDatabaseError,
  MigrationNotFoundError,
} from '../../../migrate/errors.js'
import * as DatabaseService from '../services/index.js'
import * as StudioService from '../services/index.js'
import * as MigrateService from '../services/index.js'

/** Where the migrations are, the schema they are for and the connection they run on. */
function place() {
  return Effect.gen(function* () {
    const { state, db, cwd, migratePaths } = StudioService.studio()
    const driver = yield* db.driver
    const { schemaDir, migrationsDir } = yield* migratePaths.resolve()
    const snapshot = state.snapshot()
    return {
      driver,
      // The URL as found, password and all: what the check opens its own read-only connection
      // to, so it reads the database Studio is on rather than resolving one of its own.
      url: db.target?.url ?? null,
      cwd,
      schemaDir,
      migrationsDir,
      schemaPath: state.schemaPath,
      files: snapshot.files,
      // For a migrations directory with no lock file to say it.
      provider: snapshot.schema?.provider ?? driver.dialect,
    }
  })
}

/** The migrations directory as Prisma Migrate reads it. */
function migrationsOf(at: { readonly migrationsDir: string; readonly provider: string }) {
  return Effect.gen(function* () {
    return withLockfile(yield* readMigrationsList(at.migrationsDir), at.provider)
  })
}

/** Which schema engine the place runs on, not started yet. */
function engineOf(at: Effect.Success<ReturnType<typeof place>>) {
  return MigrateService.findMigrateEngine({
    files: at.files,
    driver: at.driver,
    url: at.url,
    schemaDir: at.schemaDir,
    cwd: at.cwd,
    openShadow: () =>
      DatabaseService.openShadowDatabase({ url: at.url ?? '', driver: at.driver, cwd: at.cwd }),
  })
}

/** The place, its migrations and the engine started on it: what a command to the engine needs. */
function session() {
  return Effect.gen(function* () {
    const at = yield* place()
    const found = yield* engineOf(at)
    const [migrations, engine] = yield* Effect.all([migrationsOf(at), found.open()], {
      concurrency: 2,
    })
    return { ...at, migrations, engine }
  })
}

/** The migration history of a session's database against its migrations directory. */
function statusOf(opened: Effect.Success<ReturnType<typeof session>>) {
  return Effect.gen(function* () {
    const status = yield* migrationStatus({
      engine: opened.engine,
      driver: opened.driver,
      migrations: opened.migrations,
      files: opened.files,
      configDir: opened.schemaDir,
    })
    return { ...status, migrationsDir: opened.migrationsDir }
  })
}

/**
 * The migration history of the database against the migrations directory, and whether the
 * database has drifted from the schema.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant A as migrate adapter (commands)
 *   H->>U: readMigrateStatus()
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>A: migrationStatus({ engine, driver, migrations, files, configDir })
 *   alt MigrateEngineError
 *     U-->>H: the failure
 *   else status
 *     A-->>U: applied, pending, failed, drift
 *     U-->>H: status, migrationsDir
 *   end
 * ```
 *
 * @returns what has been applied, what is pending, what went wrong and whether it has drifted
 */
export function readMigrateStatus() {
  return Effect.gen(function* () {
    const opened = yield* session()
    return yield* statusOf(opened)
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

/**
 * The migration that would take the database to the schema, as Prisma Migrate would write it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant A as migrate adapter (commands)
 *   H->>U: readMigrateDiff()
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>A: migrationDiff({ engine, files, configDir })
 *   alt MigrateEngineError
 *     U-->>H: the failure
 *   else diff
 *     A-->>U: sql, drift
 *     U-->>H: sql, drift
 *   end
 * ```
 *
 * @returns the SQL, and whether there was anything to write
 */
export function readMigrateDiff() {
  return Effect.gen(function* () {
    const at = yield* place()
    const engine = yield* (yield* engineOf(at)).open()
    const diff = yield* migrationDiff({ engine, files: at.files, configDir: at.schemaDir })
    return diff
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

const PlanMigrationInput = z
  .object({
    name: z
      .string()
      .optional()
      .meta({ description: 'What to call the migration.', example: 'profile' }),
    decisions: z
      .array(
        z.object({
          kind: z.string().meta({ description: 'The check it answers.', example: 'not-null' }),
          modelName: z.string().meta({ description: 'The model.', example: 'User' }),
          field: z.string().meta({ description: 'The field or relation.', example: 'name' }),
          choice: z.string().meta({ description: 'What to do.', example: 'value' }),
          value: z
            .string()
            .optional()
            .meta({ description: 'The value a choice needs.', example: 'unknown' }),
        }),
      )
      .readonly()
      .optional()
      .meta({
        description:
          'Every decision to plan with, in place of the ones kept; the kept ones when left out.',
      }),
    batch: z.number().int().min(1).optional().meta({
      description: 'The most rows one statement of a fix changes; all at once when left out.',
      example: 10_000,
    }),
  })
  .readonly()
  .meta({ description: 'The name to propose for the migration, and the decisions made for it' })

/**
 * The migration laid out as steps that can be run one at a time.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant A as migrate adapter (commands, decisions-file)
 *   participant K as checkOpened
 *   participant P as migrate domain (makePlan, migrationName)
 *   H->>U: planMigration({ name, decisions, batch })
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>A: migrationDiff({ engine, files, configDir })
 *   alt MigrateEngineError
 *     U-->>H: the failure
 *   end
 *   opt no decisions in the request
 *     U->>A: readDecisions(decisionsPath)
 *     alt MigrateConfigError (the file does not read)
 *       U-->>H: the failure
 *     end
 *   end
 *   U->>K: checkOpened({ driver, url, schemaPath, decisions, setAside, files })
 *   Note over K: on the connection Studio holds, not a second one
 *   alt MigrateDatabaseError or MigrateConfigError
 *     U-->>H: the failure
 *   else report
 *     K-->>U: checks, fixes, previews
 *     U->>P: makePlan(report, diff.sql, batch)
 *     U->>P: migrationName({ at, name })
 *     Note over U: no drift: a note that there is nothing to migrate
 *     U-->>H: name, steps, previews, notes
 *   end
 * ```
 *
 * @param input - the name to propose for it
 * @returns the steps, the name and what the person running them needs to know
 */
export function planMigration(input: z.infer<typeof PlanMigrationInput>) {
  return Effect.gen(function* () {
    const opened = yield* place()
    const engine = yield* (yield* engineOf(opened)).open()
    const diff = yield* migrationDiff({ engine, files: opened.files, configDir: opened.schemaDir })
    // What the rows of the database say about the migration, and the fixes the decisions give
    // for them. It runs on the connection Studio already holds: a second one would read a
    // database of its own, and SQLite would refuse it while this one is open.
    // The decisions this request carries are the ones being tried; without them, the ones kept.
    const decisionsPath = path.join(opened.schemaDir, DECISIONS_FILE)
    const decisions = input.decisions ?? (yield* readDecisions(decisionsPath))
    const report = yield* checkOpened({
      driver: opened.driver,
      url: opened.url ?? '',
      schemaPath: opened.schemaPath,
      decisionsPath,
      decisions,
      setAside: true,
      files: opened.files,
      timeout: null,
      readOnly: false,
    })
    const plan = makePlan(report, diff.sql, input.batch ?? null)
    return {
      name: migrationName({ at: new Date(), name: input.name ?? 'migration' }),
      ...plan,
      // Each fixed model as the fixes will leave it, read from the database as it is now.
      previews: report.previews.map((preview) => ({
        modelName: preview.model,
        sql: preview.sql,
      })),
      notes: diff.drift
        ? plan.notes
        : ['The database already matches the schema: there is nothing to migrate.'],
    }
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

const ApplyStatementsInput = z
  .object({
    statements: z
      .array(z.string())
      .readonly()
      .meta({
        description: 'The statements, in the order they must run.',
        example: ['ALTER TABLE "User" ADD COLUMN "name" TEXT'],
      }),
  })
  .readonly()
  .meta({ description: 'The statements of one step of a plan' })

/**
 * Runs the statements one at a time, stopping at the first the database refuses.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant A as migrate adapter (commands)
 *   H->>U: applyMigrationStatements({ statements })
 *   U->>S: studio().db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>A: applyStatements({ driver, statements })
 *   loop each statement, until one is refused
 *     A->>D: executeRaw({ sql, params })
 *   end
 *   A-->>U: results, failedAt, ok
 *   U-->>H: results, failedAt, ok
 * ```
 *
 * @param input - the statements, in the order they must run
 * @returns one result per statement attempted, and where it stopped
 */
export function applyMigrationStatements(input: z.infer<typeof ApplyStatementsInput>) {
  return Effect.gen(function* () {
    const db = StudioService.studio().db
    const driver = yield* db.driver
    const applied = yield* applyStatements({ driver, statements: input.statements })
    return applied
  })
}

const CreateMigrationInput = z
  .object({
    name: z.string().meta({ description: 'What to call it.', example: 'profile' }),
    sql: z.string().meta({
      description: 'The statements to write.',
      example: 'ALTER TABLE "User" ADD COLUMN "name" TEXT;\n',
    }),
  })
  .readonly()
  .meta({ description: 'A migration to write to the migrations directory' })

/**
 * Writes a migration.sql to the migrations directory, so Prisma Migrate owns it from now on.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant P as migrate domain (migrationName)
 *   participant A as migrate adapter (migrations-dir)
 *   H->>U: createMigration({ name, sql })
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>P: migrationName({ at, name })
 *   U->>A: writeMigration({ baseDir, name, sql, provider })
 *   alt PlatformError (the directory or file cannot be written)
 *     U-->>H: the failure
 *   else written
 *     A-->>U: file
 *     U-->>H: name, file
 *   end
 * ```
 *
 * @param input - what to call it and the statements to write
 * @returns the name it was written under and the file
 */
export function createMigration(input: z.infer<typeof CreateMigrationInput>) {
  return Effect.gen(function* () {
    const opened = yield* place()
    const name = migrationName({ at: new Date(), name: input.name })
    const written = yield* writeMigration({
      baseDir: opened.migrationsDir,
      name,
      sql: input.sql,
      provider: opened.driver.dialect,
    })
    return { name, file: written.file }
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

const MarkAppliedInput = z
  .object({
    name: z.string().meta({
      description: 'The directory name of the migration.',
      example: '20260201000000_profile',
    }),
  })
  .readonly()
  .meta({ description: 'A migration whose statements have already been run' })

/**
 * Records a migration as applied without running it, for one run a step at a time.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant A as migrate adapter (commands)
 *   H->>U: recordMigrationApplied({ name })
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>A: markMigrationApplied({ engine, driver, migrations, name })
 *   alt MigrateConfigError or MigrateEngineError
 *     U-->>H: the failure
 *   end
 *   Note over U: readMigrateStatus(), its own session and migrationStatus
 *   U->>A: migrationStatus({ engine, driver, migrations, files, configDir })
 *   U-->>H: the history as it is now
 * ```
 *
 * @param input - the directory name of the migration
 * @returns the history as it is once it is recorded
 */
export function recordMigrationApplied(input: z.infer<typeof MarkAppliedInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
    yield* markMigrationApplied({
      engine: opened.engine,
      driver: opened.driver,
      migrations: opened.migrations,
      name: input.name,
    })
    // The migrations directory is as it was: only the database moved.
    return yield* statusOf(opened)
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

/**
 * Applies every migration the database has not run yet, as `prisma migrate deploy` does.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant A as migrate adapter (commands)
 *   H->>U: deployMigrations()
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>A: applyPendingMigrations({ engine, migrations })
 *   alt MigrateEngineError
 *     U-->>H: the failure
 *   else deployed
 *     A-->>U: the migrations that ran
 *     U-->>H: the migrations that ran
 *   end
 * ```
 *
 * @returns the migrations that ran
 */
export function deployMigrations() {
  return Effect.gen(function* () {
    const opened = yield* session()
    const deployed = yield* applyPendingMigrations({
      engine: opened.engine,
      migrations: opened.migrations,
    })
    return deployed
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

/**
 * Records a migration as rolled back, for one that failed and left the database as it was.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant A as migrate adapter (commands)
 *   H->>U: recordMigrationRolledBack({ name })
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>A: markMigrationRolledBack({ engine, name })
 *   alt MigrateEngineError
 *     U-->>H: the failure
 *   end
 *   Note over U: readMigrateStatus(), its own session and migrationStatus
 *   U->>A: migrationStatus({ engine, driver, migrations, files, configDir })
 *   U-->>H: the history as it is now
 * ```
 *
 * @param input - the directory name of the migration that failed
 * @returns the history as it is once it is recorded
 */
export function recordMigrationRolledBack(input: z.infer<typeof MarkAppliedInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
    yield* markMigrationRolledBack({ engine: opened.engine, name: input.name })
    // The migrations directory is as it was: only the database moved.
    return yield* statusOf(opened)
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

/**
 * What has been decided on the page about the checks, as Studio kept it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant A as migrate adapter (decisions-file)
 *   H->>U: readMigrationDecisions()
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>A: readDecisions(schemaDir/DECISIONS_FILE)
 *   alt MigrateConfigError (the file does not read)
 *     U-->>H: the failure
 *   else decisions
 *     A-->>U: decisions, value null where a choice needs none
 *     Note over U: a null value left out, as the wire has it
 *     U-->>H: file, decisions
 *   end
 * ```
 *
 * @returns the decisions and the file they are kept in
 */
export function readMigrationDecisions() {
  return Effect.gen(function* () {
    const opened = yield* place()
    const decisions = yield* readDecisions(path.join(opened.schemaDir, DECISIONS_FILE))
    // The file keeps a value a choice does not need as null; the wire leaves it out.
    return {
      file: path.join(opened.schemaDir, DECISIONS_FILE),
      decisions: decisions.map((decision) =>
        decision.value === null
          ? {
              kind: decision.kind,
              modelName: decision.modelName,
              field: decision.field,
              choice: decision.choice,
            }
          : {
              kind: decision.kind,
              modelName: decision.modelName,
              field: decision.field,
              choice: decision.choice,
              value: decision.value,
            },
      ),
    }
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

const WriteDecisionsInput = z
  .object({
    decisions: z
      .array(
        z.object({
          kind: z.string().meta({ description: 'The check it answers.', example: 'not-null' }),
          modelName: z.string().meta({ description: 'The model.', example: 'User' }),
          field: z.string().meta({ description: 'The field or relation.', example: 'name' }),
          choice: z.string().meta({ description: 'What to do.', example: 'value' }),
          value: z
            .string()
            .optional()
            .meta({ description: 'The value a choice needs.', example: 'unknown' }),
        }),
      )
      .readonly()
      .meta({ description: 'All of them: what is left out is forgotten.' }),
  })
  .readonly()
  .meta({ description: 'The decisions to keep' })

/**
 * Keeps the decisions beside the schema, so the page opens on the same ones and makes the same
 * plan, and `hekireki migrate check` and `plan` read the same ones.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant A as migrate adapter (decisions-file)
 *   H->>U: writeMigrationDecisions({ decisions })
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>A: writeDecisions({ file, decisions })
 *   Note over A: parses each decision before it is written
 *   alt MigrateConfigError
 *     U-->>H: the failure
 *   else file
 *     A-->>U: file
 *     U-->>H: file, decisions
 *   end
 * ```
 *
 * @param input - all the decisions to keep
 * @returns the decisions and the file they were written to
 */
export function writeMigrationDecisions(input: z.infer<typeof WriteDecisionsInput>) {
  return Effect.gen(function* () {
    const opened = yield* place()
    const file = yield* writeDecisions({
      file: path.join(opened.schemaDir, DECISIONS_FILE),
      decisions: input.decisions,
    })
    return { file, decisions: input.decisions }
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

/**
 * Which migrations the database already matches: for a database with tables and no history,
 * each migration and those before it replayed into a shadow database and compared with it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant A as migrate adapter (commands)
 *   H->>U: readMigrateBaseline()
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>A: baselineCandidates({ engine, migrations, files, configDir })
 *   Note over A: each migration and those before it replayed into a shadow database
 *   alt MigrateEngineError
 *     U-->>H: the failure
 *   else candidates
 *     A-->>U: every migration, with whether the database matches it
 *     U-->>H: candidates
 *   end
 * ```
 *
 * @returns every migration, oldest first, with whether the database matches it
 */
export function readMigrateBaseline() {
  return Effect.gen(function* () {
    const opened = yield* session()
    const candidates = yield* baselineCandidates({
      engine: opened.engine,
      migrations: opened.migrations,
      files: opened.files,
      configDir: opened.schemaDir,
    })
    return { candidates }
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

/**
 * Baselines the database at a migration: that one and every one before it recorded as applied
 * without running them, once the database is checked to match them.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant A as migrate adapter (commands)
 *   H->>U: baselineDatabase({ name })
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>A: baselineMigrations({ engine, driver, migrations, files, configDir, name })
 *   alt MigrateConfigError (no such migration, or the database does not match)
 *     U-->>H: the failure
 *   else MigrateEngineError
 *     U-->>H: the failure
 *   end
 *   Note over A: that migration and every one before it marked applied
 *   Note over U: readMigrateStatus(), its own session and migrationStatus
 *   U->>A: migrationStatus({ engine, driver, migrations, files, configDir })
 *   U-->>H: the history as it is now
 * ```
 *
 * @param input - the directory name of the last migration the database already has
 * @returns the history as it is once they are recorded
 */
export function baselineDatabase(input: z.infer<typeof MarkAppliedInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
    yield* baselineMigrations({
      engine: opened.engine,
      driver: opened.driver,
      migrations: opened.migrations,
      files: opened.files,
      configDir: opened.schemaDir,
      name: input.name,
    })
    // The migrations directory is as it was: only the database moved.
    return yield* statusOf(opened)
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

const ReadMigrationFileInput = z
  .object({
    migrationName: z.string().meta({
      description: 'The directory name of the migration.',
      example: '20260201000000_profile',
    }),
  })
  .readonly()
  .meta({ description: 'The migration whose migration.sql to read' })

/**
 * What one migration of the directory runs: its migration.sql, as the migrations list read it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   H->>U: readMigrationFile({ migrationName })
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   Note over U: the directory of that name in migrations
 *   alt no such directory, or its migration.sql did not read
 *     U-->>H: MigrationNotFoundError
 *   else found
 *     U-->>H: name, file, sql
 *   end
 * ```
 *
 * @param input - the directory name of the migration
 * @returns the name, the file and the SQL it holds
 */
export function readMigrationFile(input: z.infer<typeof ReadMigrationFileInput>) {
  return Effect.gen(function* () {
    const opened = yield* place()
    const migrations = yield* migrationsOf(opened)
    const directory = migrations.migrationDirectories.find(
      (one) => one.path === input.migrationName,
    )
    if (directory?.migrationFile.content.tag !== 'ok') {
      return yield* new MigrationNotFoundError({
        name: input.migrationName,
        baseDir: opened.migrationsDir,
      })
    }
    return {
      name: directory.path,
      file: path.join(opened.migrationsDir, directory.path, directory.migrationFile.path),
      sql: directory.migrationFile.content.value,
    }
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

const RehearseInput = z
  .object({
    steps: z
      .array(z.array(z.string()).readonly())
      .readonly()
      .meta({ description: "Each step's statements, in the order they run." }),
  })
  .readonly()
  .meta({ description: 'The steps of a plan, to rehearse' })

/**
 * The migration run for real and taken back: on SQLite on a copy of the file, on PostgreSQL in a
 * transaction that is rolled back whatever happens.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant R as rehearseMigration
 *   H->>U: rehearse({ steps })
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>R: rehearseMigration({ driver, steps, files, configDir, compareWith, openCopy })
 *   alt SQLite or MySQL
 *     R->>D: openSqliteCopy / openMysqlCopy, through openCopy
 *   else PostgreSQL
 *     Note over R: a transaction rolled back whatever happens
 *   end
 *   loop each step
 *     R->>D: the step's statements
 *   end
 *   alt DatabaseError
 *     Note over U: as MigrateDatabaseError
 *     U-->>H: MigrateDatabaseError
 *   else MigrateEngineError
 *     U-->>H: the failure
 *   else rehearsal
 *     R-->>U: each step, rows before and after, whether it then matches the schema
 *     U-->>H: rehearsal
 *   end
 * ```
 *
 * @param input - each step's statements, in the order they run
 * @returns how each step went, the rows of each table before and after, and whether the database
 *   then matches the schema
 */
export function rehearse(input: z.infer<typeof RehearseInput>) {
  return Effect.gen(function* () {
    const opened = yield* place()
    const { rehearsalEngine } = yield* engineOf(opened)
    const rehearsal = yield* rehearseMigration({
      driver: opened.driver,
      steps: input.steps,
      files: opened.files,
      configDir: opened.schemaDir,
      compareWith: rehearsalEngine,
      openCopy: () =>
        opened.driver.dialect === 'mysql'
          ? DatabaseService.openMysqlCopy({
              url: opened.url ?? '',
              driver: opened.driver,
              cwd: opened.cwd,
            })
          : DatabaseService.openSqliteCopy({ driver: opened.driver, cwd: opened.cwd }),
    }).pipe(
      Effect.catchTag('DatabaseError', (error) =>
        Effect.fail(new MigrateDatabaseError({ message: error.cause })),
      ),
    )
    return rehearsal
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

/**
 * The rows of every table of the database now, to set a run against.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant R as countTables
 *   H->>U: readTableCounts()
 *   U->>S: studio().db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>R: countTables(driver)
 *   alt DatabaseError
 *     Note over U: as MigrateDatabaseError
 *     U-->>H: MigrateDatabaseError
 *   else counted
 *     R-->>U: each table and its rows
 *     U-->>H: tables, before null, after the rows
 *   end
 * ```
 *
 * @returns each table with its rows as `after`
 */
export function readTableCounts() {
  return Effect.gen(function* () {
    const db = StudioService.studio().db
    const driver = yield* db.driver
    const counted = yield* countTables(driver).pipe(
      Effect.catchTag('DatabaseError', (error) =>
        Effect.fail(new MigrateDatabaseError({ message: error.cause })),
      ),
    )
    return {
      tables: counted.map((one) => ({ table: one.table, before: null, after: one.rows })),
    }
  })
}

/**
 * The backups taken before migrations, newest first.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant B as migrate adapter (backup)
 *   H->>U: readBackups()
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>B: listBackups({ driver, schemaDir })
 *   Note over B: a directory or catalogue that does not read lists none
 *   B-->>U: each backup, newest first
 *   U-->>H: backups
 * ```
 *
 * @returns each backup, and whether Studio can restore it
 */
export function readBackups() {
  return Effect.gen(function* () {
    const opened = yield* place()
    const backups = yield* listBackups({ driver: opened.driver, schemaDir: opened.schemaDir })
    return { backups }
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

/**
 * Takes a backup of the database as it is now.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant B as migrate adapter (backup)
 *   H->>U: takeBackup()
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>B: createBackup({ driver, schemaDir })
 *   alt DatabaseError
 *     U-->>H: MigrateDatabaseError
 *   else PlatformError
 *     U-->>H: MigrateConfigError
 *   end
 *   B-->>U: taken
 *   U->>B: listBackups({ driver, schemaDir })
 *   B-->>U: backups
 *   Note over U: the one taken, else it with no size and not restorable
 *   U-->>H: the backup
 * ```
 *
 * @returns the backup, and whether Studio can restore it
 */
export function takeBackup() {
  return Effect.gen(function* () {
    const opened = yield* place()
    const taken = yield* createBackup({ driver: opened.driver, schemaDir: opened.schemaDir })
    const backups = yield* listBackups({ driver: opened.driver, schemaDir: opened.schemaDir })
    return (
      backups.find((one) => one.name === taken.name) ?? { ...taken, size: null, restorable: false }
    )
  }).pipe(
    Effect.catchTags({
      DatabaseError: (error) => Effect.fail(new MigrateDatabaseError({ message: error.cause })),
      PlatformError: (error) => Effect.fail(new MigrateConfigError({ message: error.message })),
    }),
    Effect.provide(nodeFileSystemLayer),
  )
}

const RestoreInput = z
  .object({
    name: z
      .string()
      .meta({ description: "The backup's name.", example: 'backup_20260917101500123' }),
    migration: z.string().optional().meta({
      description: 'The migration the run the backup undoes wrote.',
      example: '20260917101530_profile',
    }),
  })
  .readonly()
  .meta({ description: 'A backup to restore, and the migration the restore undoes' })

/**
 * Puts the database back as a backup has it, and removes the migration the run it undoes wrote,
 * so the directory and the database agree again.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as MigrateService
 *   participant B as migrate adapter (backup)
 *   participant F as file (removePath)
 *   participant A as migrate adapter (commands)
 *   H->>U: restoreFromBackup({ name, migration })
 *   U->>S: studio() state, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: openMigrateSession({ schemaPath, files, driver, url, openShadow })
 *   alt MigrateConfigError (no native engine for MySQL or a PostgreSQL schema)
 *     U-->>H: the failure
 *   end
 *   M-->>U: engine, migrations, migrationsDir, schemaDir
 *   U->>B: restoreBackup({ driver, schemaDir, name })
 *   alt MigrateConfigError, or PlatformError as MigrateConfigError
 *     U-->>H: the failure
 *   end
 *   opt migration names a migration's own directory
 *     U->>F: removePath(migrationsDir/migration)
 *     alt PlatformError
 *       U-->>H: MigrateConfigError
 *     end
 *   end
 *   Note over U: readMigrateStatus(), its own session and migrationStatus
 *   U->>A: migrationStatus({ engine, driver, migrations, files, configDir })
 *   U-->>H: the history as it is now
 * ```
 *
 * @param input - the backup, and the migration to remove
 * @returns the history as it is once restored
 */
export function restoreFromBackup(input: z.infer<typeof RestoreInput>) {
  return Effect.gen(function* () {
    const opened = yield* place()
    yield* restoreBackup({ driver: opened.driver, schemaDir: opened.schemaDir, name: input.name })
    // Only a migration's own directory name: nothing else of the directory is ever removed.
    if (input.migration !== undefined && /^\d{14}_[\w-]+$/u.test(input.migration)) {
      yield* removePath(path.join(opened.migrationsDir, input.migration))
    }
    return yield* readMigrateStatus()
  }).pipe(
    Effect.catchTag('PlatformError', (error) =>
      Effect.fail(new MigrateConfigError({ message: error.message })),
    ),
    Effect.provide(nodeFileSystemLayer),
  )
}
