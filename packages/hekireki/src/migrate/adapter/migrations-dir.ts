import path from 'node:path'

import { Effect } from 'effect'

import {
  exists,
  fileStamp,
  makeDirectory,
  readDirectory,
  readFile,
  writeFile,
} from '../../file/index.js'
import {
  LOCK_FILE,
  makeMigrationsPath,
  MIGRATION_DIRECTORY,
  MIGRATION_FILE,
} from '../domain/history.js'

/**
 * The migrations directory as the engine takes it: every `<timestamp>_<name>/migration.sql` in
 * order, with the lock file that records which database they were written for. A directory that
 * is not there is an empty history, which is what a project that has never migrated has.
 *
 * @param baseDir - the migrations directory, `prisma/migrations` in a default project
 * @returns the list every history command of the engine is given
 */
export function readMigrationsList(baseDir: string) {
  return Effect.gen(function* () {
    const there = yield* exists(baseDir).pipe(Effect.orElseSucceed(() => false))
    if (!there) {
      return {
        baseDir,
        lockfile: { path: LOCK_FILE, content: null },
        shadowDbInitScript: '',
        migrationDirectories: [],
      }
    }
    const entries = yield* readDirectory(baseDir).pipe(
      Effect.orElseSucceed((): readonly string[] => []),
    )
    const names = entries.filter((name) => MIGRATION_DIRECTORY.test(name)).toSorted()
    const migrationDirectories = yield* Effect.forEach(names, (name) =>
      readFile(path.join(baseDir, name, MIGRATION_FILE)).pipe(
        Effect.match({
          onFailure: (error) => ({
            path: name,
            migrationFile: {
              path: MIGRATION_FILE,
              content: { tag: 'error' as const, value: error.message },
            },
          }),
          onSuccess: (content) => ({
            path: name,
            migrationFile: {
              path: MIGRATION_FILE,
              content: { tag: 'ok' as const, value: content },
            },
          }),
        }),
      ),
    )
    const lock = yield* readFile(path.join(baseDir, LOCK_FILE)).pipe(
      Effect.orElseSucceed(() => null),
    )
    return {
      baseDir,
      lockfile: { path: LOCK_FILE, content: lock },
      shadowDbInitScript: '',
      migrationDirectories,
    }
  })
}

/** The list as the engine's types name it. */
export type MigrationsList = Effect.Success<ReturnType<typeof readMigrationsList>>

/**
 * Where the migrations of a project live, as Prisma Migrate finds them: the `migrations.path` of
 * prisma.config.ts (where Prisma reads it, the working directory, else beside the schema),
 * relative to that file; without one, `migrations` beside the schema.
 *
 * @param input - the working directory, and the directory the schema is in
 * @returns the absolute path of the migrations directory
 */
export function resolveMigrationsDir(input: { readonly cwd: string; readonly schemaDir: string }) {
  return Effect.gen(function* () {
    const found = yield* Effect.firstSuccessOf(
      [...new Set([input.cwd, input.schemaDir])].map((dir) =>
        readFile(path.join(dir, 'prisma.config.ts')).pipe(Effect.map((text) => ({ dir, text }))),
      ),
    ).pipe(Effect.orElseSucceed(() => null))
    const configured = found === null ? null : makeMigrationsPath(found.text)
    return found === null || configured === null
      ? path.join(input.schemaDir, 'migrations')
      : path.resolve(found.dir, configured)
  })
}

/**
 * What the migrations directory holds, in one string that changes whenever it does: each
 * migration's name with when its migration.sql last changed and its size, and the lock file's.
 * Cheap enough to read every second, and a directory that does not exist yet reads as empty.
 *
 * @param baseDir - the migrations directory
 * @returns the stamp to compare with the last one read
 */
export function migrationsStamp(baseDir: string) {
  return Effect.gen(function* () {
    const entries = yield* readDirectory(baseDir).pipe(
      Effect.orElseSucceed((): readonly string[] => []),
    )
    const names = entries.filter((name) => MIGRATION_DIRECTORY.test(name)).toSorted()
    const stamps = yield* Effect.forEach(names, (name) =>
      fileStamp(path.join(baseDir, name, MIGRATION_FILE)).pipe(
        Effect.map((stamp) => `${name}=${stamp ?? ''}`),
      ),
    )
    const lock = yield* fileStamp(path.join(baseDir, LOCK_FILE))
    return [...stamps, `${LOCK_FILE}=${lock ?? ''}`].join('\n')
  })
}

/**
 * Writes `<baseDir>/<name>/migration.sql`, and the lock file beside it when it is not there yet,
 * so the directory is one Prisma Migrate reads as its own.
 *
 * @param input - the migrations directory, the name of the new migration and its statements
 * @returns where the migration was written
 */
export function writeMigration(input: {
  readonly baseDir: string
  readonly name: string
  readonly sql: string
  readonly provider: string
}) {
  return Effect.gen(function* () {
    const directory = path.join(input.baseDir, input.name)
    yield* makeDirectory(directory)
    const lock = path.join(input.baseDir, LOCK_FILE)
    const locked = yield* exists(lock).pipe(Effect.orElseSucceed(() => false))
    if (!locked) yield* writeFile(lock, `provider = "${input.provider}"\n`)
    const file = path.join(directory, MIGRATION_FILE)
    yield* writeFile(file, input.sql)
    return { directory, file }
  })
}
