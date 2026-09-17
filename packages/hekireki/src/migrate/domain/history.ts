import type { Dialect } from '../../database/url.js'
import { placeholder } from '../../sql/index.js'

/** What Prisma Migrate names the file in a migration directory, and the lock beside them. */
export const MIGRATION_FILE = 'migration.sql'
export const LOCK_FILE = 'migration_lock.toml'

/** A migration directory is named `<timestamp>_<name>`; anything else is not one of Prisma's. */
export const MIGRATION_DIRECTORY = /^\d{14}_/u

/**
 * The list with a lock file the engine can read the database from. Prisma Migrate writes
 * `migration_lock.toml` with the first migration; a directory made another way has none, and the
 * engine refuses to replay one without it (`Could not determine the connector`). The provider of
 * the schema's datasource stands in for it, in memory: nothing is written to the directory.
 *
 * @param migrations - the list as read from the directory
 * @param provider - the datasource provider of the schema: `postgresql`, `sqlite`, `cockroachdb`...
 * @returns the list, its lock file given the provider when the directory has none
 */
export function withLockfile<
  M extends { readonly lockfile: { readonly path: string; readonly content: string | null } },
>(migrations: M, provider: string): M {
  return migrations.lockfile.content === null
    ? { ...migrations, lockfile: { ...migrations.lockfile, content: `provider = "${provider}"\n` } }
    : migrations
}

/**
 * The `migrations.path` of a prisma.config.ts, as it is written: a string literal; any other shape
 * is not recognised.
 *
 * @param configText - the text of prisma.config.ts
 * @returns the path as written, relative to the config file, or null when it names none
 */
export function makeMigrationsPath(configText: string) {
  const block = /migrations\s*:\s*\{([^}]*)\}/u.exec(configText)?.[1]
  return block === undefined ? null : (/path\s*:\s*["'`]([^"'`]+)["'`]/u.exec(block)?.[1] ?? null)
}

/** The name Prisma Migrate would give a migration made now: `<UTC timestamp>_<name>`. */
export function migrationName(input: { readonly at: Date; readonly name: string }) {
  const stamp = input.at.toISOString().replaceAll(/[-:T]/gu, '').slice(0, 14)
  const slug = input.name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '_')
    .replaceAll(/^_+|_+$/gu, '')
  return `${stamp}_${slug === '' ? 'migration' : slug}`
}

/**
 * `_prisma_migrations` as the schema engine creates it, character for character: the SQLite and
 * PostgreSQL statements are the ones in `schema-engine-wasm`, the MySQL one what `SHOW CREATE
 * TABLE` gives back for the table `prisma migrate deploy` made. A database being baselined, or
 * migrated by Studio without the engine, has to have it before a migration can be recorded.
 */
export const MIGRATIONS_TABLE_DDL = {
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
  mysql: `CREATE TABLE _prisma_migrations (
    id                      VARCHAR(36) PRIMARY KEY NOT NULL,
    checksum                VARCHAR(64) NOT NULL,
    finished_at             DATETIME(3),
    migration_name          VARCHAR(255) NOT NULL,
    logs                    TEXT,
    rolled_back_at          DATETIME(3),
    started_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    applied_steps_count     INTEGER UNSIGNED NOT NULL DEFAULT 0
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
}

/**
 * The statements that keep `_prisma_migrations` without the schema engine, writing the rows
 * Prisma Migrate itself writes: `prisma migrate deploy` a row started with no steps and finished
 * with one, or left with the error in `logs`; `prisma migrate resolve --applied` a row finished
 * with no steps and empty logs; `--rolled-back` the failed row marked. Placeholders are bound in
 * the order the comments give.
 *
 * @example
 * ```sql
 * -- mysql, `resolved`: id, checksum, migration name
 * INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
 *   VALUES (?, ?, CURRENT_TIMESTAMP(3), ?, '', CURRENT_TIMESTAMP(3), 0)
 * -- postgresql, `rolledBack`: migration name
 * UPDATE _prisma_migrations SET rolled_back_at = now()
 *   WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL
 * ```
 */
export function migrationRecordStatements(dialect: Dialect) {
  const now =
    dialect === 'mysql'
      ? 'CURRENT_TIMESTAMP(3)'
      : dialect === 'postgresql'
        ? 'now()'
        : "(CAST(strftime('%s', 'now') AS INTEGER) * 1000)"
  const at = (index: number) => placeholder(dialect, index)
  return {
    /** id, checksum, migration name: a migration recorded as applied without running it. */
    resolved: `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count) VALUES (${at(1)}, ${at(2)}, ${now}, ${at(3)}, '', ${now}, 0)`,
    /** id, checksum, migration name: a migration about to run. */
    started: `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES (${at(1)}, ${at(2)}, ${at(3)}, ${now}, 0)`,
    /** id: the migration ran to its end. */
    finished: `UPDATE _prisma_migrations SET finished_at = ${now}, applied_steps_count = 1 WHERE id = ${at(1)}`,
    /** logs, id: the migration stopped at an error. */
    failed: `UPDATE _prisma_migrations SET logs = ${at(1)} WHERE id = ${at(2)}`,
    /** migration name: a failed migration taken back. */
    rolledBack: `UPDATE _prisma_migrations SET rolled_back_at = ${now} WHERE migration_name = ${at(1)} AND finished_at IS NULL AND rolled_back_at IS NULL`,
  }
}

/**
 * The migration history read without the schema engine: what the database recorded set against
 * what the migrations directory holds. A row rolled back counts for nothing, as `prisma migrate
 * deploy` runs that migration again. What only the engine can say (whether the database is the
 * schema, and how two histories diverge) is not said: `drift` means there is a migration to run.
 *
 * @param input - the rows of `_prisma_migrations`, whether the table is there, each migration
 *   directory with the checksum of its migration.sql (null when it does not read), and whether
 *   the database has tables of its own
 * @returns the status in the shape the engine's is given
 */
export function makeHistoryStatus(input: {
  readonly present: boolean
  readonly applied: readonly {
    readonly name: string
    readonly checksum: string
    readonly finishedAt: string | null
    readonly rolledBackAt: string | null
  }[]
  readonly directories: readonly { readonly name: string; readonly checksum: string | null }[]
  readonly hasTables: boolean
}) {
  const live = input.applied.filter((row) => row.rolledBackAt === null)
  const recorded = new Set(live.map((row) => row.name))
  const pending = input.directories
    .map((directory) => directory.name)
    .filter((name) => !recorded.has(name))
  return {
    hasMigrationsTable: input.present,
    pending,
    failed: live.filter((row) => row.finishedAt === null).map((row) => row.name),
    edited: live
      .filter((row) => row.finishedAt !== null)
      .filter((row) => {
        const file = input.directories.find((directory) => directory.name === row.name)
        return file !== undefined && file.checksum !== null && file.checksum !== row.checksum
      })
      .map((row) => row.name),
    divergence: null,
    drift: pending.length > 0,
    missingFiles: live
      .map((row) => row.name)
      .filter((name) => !input.directories.some((directory) => directory.name === name)),
    baselineNeeded: live.length === 0 && input.directories.length > 0 && input.hasTables,
  }
}
