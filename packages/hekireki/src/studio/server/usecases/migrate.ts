import path from 'node:path'

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
  readAppliedMigrations,
} from '../../../migrate/adapter/commands.js'
import {
  DECISIONS_FILE,
  readDecisions,
  writeDecisions,
} from '../../../migrate/adapter/decisions-file.js'
import {
  deployWithoutEngine,
  readHistoryWithoutEngine,
  recordAppliedWithoutEngine,
  recordRolledBackWithoutEngine,
} from '../../../migrate/adapter/history-table.js'
import { writeMigration } from '../../../migrate/adapter/migrations-dir.js'
import { countTables, rehearseMigration } from '../../../migrate/adapter/rehearse.js'
import { checkOpened } from '../../../migrate/check.js'
import { migrationName } from '../../../migrate/domain/history.js'
import { makePlan } from '../../../migrate/domain/plan.js'
import {
  MigrateConfigError,
  MigrateDatabaseError,
  MigrationNotFoundError,
} from '../../../migrate/errors.js'
import { ContractViolationError } from '../errors/index.js'
import {
  ApplyResultSchema,
  CreatedMigrationSchema,
  DeployedSchema,
  BackupSchema,
  BackupsSchema,
  MigrateBaselineSchema,
  RehearsalSchema,
  TableCountsSchema,
  MigrateDiffSchema,
  MigrateStatusSchema,
  MigrationFileSchema,
  MigrationDecisionsSchema,
  MigratePlanSchema,
} from '../routes/index.js'
import * as MigrateService from '../services/index.js'
import * as RuntimeService from '../services/index.js'

/** The schema, the database and the engine one command runs against. */
function session() {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const db = yield* RuntimeService.DatabaseTag
    const driver = yield* db.driver
    const opened = yield* MigrateService.openMigrateSession({
      schemaPath: state.schemaPath,
      files: state.snapshot().files,
      driver,
      url: db.target?.url ?? null,
    })
    // The URL as found, password and all: what the check opens its own read-only connection to,
    // so it reads the database Studio is on rather than resolving one of its own.
    return { ...opened, driver, url: db.target?.url ?? null }
  })
}

/**
 * The migration history of the database against the migrations directory, and whether the
 * database has drifted from the schema.
 *
 * @returns what has been applied, what is pending, what went wrong and whether it has drifted
 */
export function readMigrateStatus() {
  return Effect.gen(function* () {
    const opened = yield* session()
    const status =
      opened.engine === null
        ? yield* readHistoryWithoutEngine({ driver: opened.driver, migrations: opened.migrations })
        : yield* migrationStatus({
            engine: opened.engine,
            driver: opened.driver,
            migrations: opened.migrations,
            files: opened.files,
            configDir: opened.schemaDir,
          })
    const result = MigrateStatusSchema.safeParse({
      ...status,
      migrationsDir: opened.migrationsDir,
      withoutEngine: opened.withoutEngine,
    })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * The migration that would take the database to the schema, as Prisma Migrate would write it.
 *
 * @returns the SQL, and whether there was anything to write
 */
export function readMigrateDiff() {
  return Effect.gen(function* () {
    const opened = yield* session()
    if (opened.engine === null) {
      return yield* new MigrateConfigError({
        message: `Studio cannot compare this database with the schema (${opened.withoutEngine === 'mysql' ? 'MySQL' : 'a PostgreSQL schema other than public'}): write the migration with \`prisma migrate dev --create-only\`, and it is planned from the migrations directory.`,
      })
    }
    const diff = yield* migrationDiff({
      engine: opened.engine,
      files: opened.files,
      configDir: opened.schemaDir,
    })
    const result = MigrateDiffSchema.safeParse(diff)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
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
 * @param input - the name to propose for it
 * @returns the steps, the name and what the person running them needs to know
 */
export function planMigration(input: z.infer<typeof PlanMigrationInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
    // Without the engine, the migration is the first the database has not run, as Prisma wrote it
    // to the directory; with it, what the engine writes for the schema.
    const history =
      opened.engine === null
        ? yield* readHistoryWithoutEngine({ driver: opened.driver, migrations: opened.migrations })
        : null
    const [pending = null, ...later] = history?.pending ?? []
    const file =
      pending === null
        ? null
        : opened.migrations.migrationDirectories.find((one) => one.path === pending)
    const diff =
      opened.engine === null
        ? {
            sql: file?.migrationFile.content.tag === 'ok' ? file.migrationFile.content.value : '',
            drift: pending !== null,
          }
        : yield* migrationDiff({
            engine: opened.engine,
            files: opened.files,
            configDir: opened.schemaDir,
          })
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
    const result = MigratePlanSchema.safeParse({
      name: pending ?? migrationName({ at: new Date(), name: input.name ?? 'migration' }),
      migration: pending,
      ...plan,
      // Each fixed model as the fixes will leave it, read from the database as it is now.
      previews: report.previews.map((preview) => ({
        modelName: preview.model,
        sql: preview.sql,
      })),
      notes:
        opened.engine === null
          ? pending === null
            ? [
                `No migration in ${opened.migrationsDir} is waiting to run. Studio cannot compare this database with the schema: write the migration with \`prisma migrate dev --create-only\`, and it is planned here.`,
              ]
            : [
                `The plan is ${pending} from the migrations directory, with the fixes the decisions make written into it. Studio cannot compare this database with the schema, so what the migration does is what Prisma wrote.`,
                ...(later.length === 0
                  ? []
                  : [
                      `${later.length} more after it: each is planned once the one before it has run.`,
                    ]),
                ...plan.notes,
              ]
          : diff.drift
            ? plan.notes
            : ['The database already matches the schema: there is nothing to migrate.'],
    })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
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
 * @param input - the statements, in the order they must run
 * @returns one result per statement attempted, and where it stopped
 */
export function applyMigrationStatements(input: z.infer<typeof ApplyStatementsInput>) {
  return Effect.gen(function* () {
    const db = yield* RuntimeService.DatabaseTag
    const driver = yield* db.driver
    const applied = yield* applyStatements({ driver, statements: input.statements })
    const result = ApplyResultSchema.safeParse(applied)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

const CreateMigrationInput = z
  .object({
    name: z.string().meta({ description: 'What to call it.', example: 'profile' }),
    existing: z.string().optional().meta({
      description:
        'The pending migration of the directory to write over, in place of a new one: the plan was made from it.',
      example: '20260201000000_profile',
    }),
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
 * @param input - what to call it and the statements to write
 * @returns the name it was written under and the file
 */
export function createMigration(input: z.infer<typeof CreateMigrationInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
    if (input.existing !== undefined) {
      // Only a migration the directory holds and the database has not run: one that ran would be
      // recorded with the checksum of a file that is no longer there.
      const applied = yield* readAppliedMigrations(opened.driver)
      const there = opened.migrations.migrationDirectories.some(
        (one) => one.path === input.existing,
      )
      const ran = applied.migrations.some(
        (row) => row.name === input.existing && row.rolledBackAt === null,
      )
      if (!there || ran) {
        return yield* new MigrateConfigError({
          message: `${input.existing} is not a migration of ${opened.migrationsDir} waiting to run.`,
        })
      }
    }
    const name = input.existing ?? migrationName({ at: new Date(), name: input.name })
    const written = yield* writeMigration({
      baseDir: opened.migrationsDir,
      name,
      sql: input.sql,
      provider: opened.driver.dialect,
    })
    const result = CreatedMigrationSchema.safeParse({ name, file: written.file })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
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
 * @param input - the directory name of the migration
 * @returns the history as it is once it is recorded
 */
export function recordMigrationApplied(input: z.infer<typeof MarkAppliedInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
    if (opened.engine === null) {
      yield* recordAppliedWithoutEngine({
        driver: opened.driver,
        migrations: opened.migrations,
        name: input.name,
      })
    } else {
      yield* markMigrationApplied({
        engine: opened.engine,
        driver: opened.driver,
        migrations: opened.migrations,
        name: input.name,
      })
    }
    return yield* readMigrateStatus()
  })
}

/**
 * Applies every migration the database has not run yet, as `prisma migrate deploy` does.
 *
 * @returns the migrations that ran
 */
export function deployMigrations() {
  return Effect.gen(function* () {
    const opened = yield* session()
    const deployed =
      opened.engine === null
        ? yield* deployWithoutEngine({ driver: opened.driver, migrations: opened.migrations })
        : yield* applyPendingMigrations({ engine: opened.engine, migrations: opened.migrations })
    const result = DeployedSchema.safeParse(deployed)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * Records a migration as rolled back, for one that failed and left the database as it was.
 *
 * @param input - the directory name of the migration that failed
 * @returns the history as it is once it is recorded
 */
export function recordMigrationRolledBack(input: z.infer<typeof MarkAppliedInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
    if (opened.engine === null) {
      yield* recordRolledBackWithoutEngine({ driver: opened.driver, name: input.name })
    } else {
      yield* markMigrationRolledBack({ engine: opened.engine, name: input.name })
    }
    return yield* readMigrateStatus()
  })
}

/**
 * What has been decided on the page about the checks, as Studio kept it.
 *
 * @returns the decisions and the file they are kept in
 */
export function readMigrationDecisions() {
  return Effect.gen(function* () {
    const opened = yield* session()
    const decisions = yield* readDecisions(path.join(opened.schemaDir, DECISIONS_FILE))
    // The file keeps a value a choice does not need as null; the wire leaves it out.
    const result = MigrationDecisionsSchema.safeParse({
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
    })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
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
      .meta({ description: 'All of them: what is left out is forgotten.' }),
  })
  .readonly()
  .meta({ description: 'The decisions to keep' })

/**
 * Keeps the decisions beside the schema, so the page opens on the same ones and makes the same
 * plan, and `hekireki migrate check` and `plan` read the same ones.
 *
 * @param input - all the decisions to keep
 * @returns the decisions and the file they were written to
 */
export function writeMigrationDecisions(input: z.infer<typeof WriteDecisionsInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
    const file = yield* writeDecisions({
      file: path.join(opened.schemaDir, DECISIONS_FILE),
      decisions: input.decisions,
    })
    const result = MigrationDecisionsSchema.safeParse({ file, decisions: input.decisions })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * Which migrations the database already matches: for a database with tables and no history,
 * each migration and those before it replayed into a shadow database and compared with it.
 *
 * @returns every migration, oldest first, with whether the database matches it
 */
export function readMigrateBaseline() {
  return Effect.gen(function* () {
    const opened = yield* session()
    if (opened.engine === null) {
      return yield* new MigrateConfigError({
        message: `Studio cannot replay the migrations to compare them with this database: record each migration it already has with \`prisma migrate resolve --applied <name>\`.`,
      })
    }
    const candidates = yield* baselineCandidates({
      engine: opened.engine,
      migrations: opened.migrations,
      files: opened.files,
      configDir: opened.schemaDir,
    })
    const result = MigrateBaselineSchema.safeParse({ candidates })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * Baselines the database at a migration: that one and every one before it recorded as applied
 * without running them, once the database is checked to match them.
 *
 * @param input - the directory name of the last migration the database already has
 * @returns the history as it is once they are recorded
 */
export function baselineDatabase(input: z.infer<typeof MarkAppliedInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
    if (opened.engine === null) {
      return yield* new MigrateConfigError({
        message: `Studio cannot check this database against the migrations before recording them: record each migration it already has with \`prisma migrate resolve --applied <name>\`.`,
      })
    }
    yield* baselineMigrations({
      engine: opened.engine,
      driver: opened.driver,
      migrations: opened.migrations,
      files: opened.files,
      configDir: opened.schemaDir,
      name: input.name,
    })
    return yield* readMigrateStatus()
  })
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
 * @param input - the directory name of the migration
 * @returns the name, the file and the SQL it holds
 */
export function readMigrationFile(input: z.infer<typeof ReadMigrationFileInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
    const directory = opened.migrations.migrationDirectories.find(
      (one) => one.path === input.migrationName,
    )
    if (directory?.migrationFile.content.tag !== 'ok') {
      return yield* new MigrationNotFoundError({
        name: input.migrationName,
        baseDir: opened.migrationsDir,
      })
    }
    const result = MigrationFileSchema.safeParse({
      name: directory.path,
      file: path.join(opened.migrationsDir, directory.path, directory.migrationFile.path),
      sql: directory.migrationFile.content.value,
    })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

const RehearseInput = z
  .object({
    steps: z
      .array(z.array(z.string()))
      .meta({ description: "Each step's statements, in the order they run." }),
  })
  .readonly()
  .meta({ description: 'The steps of a plan, to rehearse' })

/**
 * The migration run for real and taken back: on SQLite on a copy of the file, on PostgreSQL in a
 * transaction that is rolled back whatever happens.
 *
 * @param input - each step's statements, in the order they run
 * @returns how each step went, the rows of each table before and after, and whether the database
 *   then matches the schema
 */
export function rehearse(input: z.infer<typeof RehearseInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
    const rehearsal = yield* rehearseMigration({
      driver: opened.driver,
      steps: input.steps,
      files: opened.files,
      configDir: opened.schemaDir,
      compareWith: opened.rehearsalEngine,
      openCopy: () =>
        opened.driver.dialect === 'mysql'
          ? MigrateService.openMysqlCopy({
              url: opened.url ?? '',
              driver: opened.driver,
              cwd: process.cwd(),
            })
          : MigrateService.openSqliteCopy({ driver: opened.driver, cwd: process.cwd() }),
    }).pipe(
      Effect.catchTag('DatabaseError', (error) =>
        Effect.fail(new MigrateDatabaseError({ message: error.cause })),
      ),
    )
    const result = RehearsalSchema.safeParse(rehearsal)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * The rows of every table of the database now, to set a run against.
 *
 * @returns each table with its rows as `after`
 */
export function readTableCounts() {
  return Effect.gen(function* () {
    const db = yield* RuntimeService.DatabaseTag
    const driver = yield* db.driver
    const counted = yield* countTables(driver).pipe(
      Effect.catchTag('DatabaseError', (error) =>
        Effect.fail(new MigrateDatabaseError({ message: error.cause })),
      ),
    )
    const result = TableCountsSchema.safeParse({
      tables: counted.map((one) => ({ table: one.table, before: null, after: one.rows })),
    })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * The backups taken before migrations, newest first.
 *
 * @returns each backup, and whether Studio can restore it
 */
export function readBackups() {
  return Effect.gen(function* () {
    const opened = yield* session()
    const backups = yield* listBackups({ driver: opened.driver, schemaDir: opened.schemaDir })
    const result = BackupsSchema.safeParse({ backups })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * Takes a backup of the database as it is now.
 *
 * @returns the backup, and whether Studio can restore it
 */
export function takeBackup() {
  return Effect.gen(function* () {
    const opened = yield* session()
    const taken = yield* createBackup({ driver: opened.driver, schemaDir: opened.schemaDir })
    const backups = yield* listBackups({ driver: opened.driver, schemaDir: opened.schemaDir })
    const result = BackupSchema.safeParse(
      backups.find((one) => one.name === taken.name) ?? {
        ...taken,
        size: null,
        restorable: false,
      },
    )
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  }).pipe(
    Effect.catchTags({
      DatabaseError: (error) => Effect.fail(new MigrateDatabaseError({ message: error.cause })),
      PlatformError: (error) => Effect.fail(new MigrateConfigError({ message: error.message })),
    }),
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
 * @param input - the backup, and the migration to remove
 * @returns the history as it is once restored
 */
export function restoreFromBackup(input: z.infer<typeof RestoreInput>) {
  return Effect.gen(function* () {
    const opened = yield* session()
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
  )
}
