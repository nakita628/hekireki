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
 * TABLE` gives back for the table `prisma migrate deploy` made. A database being baselined has to
 * have it before a migration can be recorded.
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
