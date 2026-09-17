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
