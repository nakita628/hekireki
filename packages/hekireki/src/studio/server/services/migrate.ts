import path from 'node:path'

import { Effect } from 'effect'
import * as z from 'zod'

import { makePostgresSchema } from '../../../database/url.js'
import { isDirectory } from '../../../file/index.js'
import { makeSchemaEngineAdapter } from '../../../migrate/adapter/engine-adapter.js'
import { openSchemaEngine } from '../../../migrate/adapter/engine.js'
import {
  readMigrationsList,
  resolveMigrationsDir,
} from '../../../migrate/adapter/migrations-dir.js'
import { withLockfile } from '../../../migrate/domain/history.js'
import { MigrateConfigError } from '../../../migrate/errors.js'
import * as DatabaseService from './database.js'

const OpenMigrateSessionInput = z
  .object({
    schemaPath: z
      .string()
      .meta({ description: 'The schema file or directory.', example: 'prisma/schema.prisma' }),
    files: z
      .array(
        z.object({
          path: z
            .string()
            .meta({ description: 'Where the file is.', example: 'prisma/schema.prisma' }),
          content: z
            .string()
            .meta({ description: 'What it holds.', example: 'model User {\n  id Int @id\n}' }),
        }),
      )
      .readonly()
      .meta({ description: 'The schema files of the last snapshot that parsed.' }),
    driver: z
      .custom<DatabaseService.Driver>((value) => typeof value === 'object' && value !== null)
      .meta({ description: 'The open connection the engine reads and writes through.' }),
    url: z.string().nullable().meta({
      description: 'The URL as found, for the PostgreSQL schema it names.',
      example: 'postgresql://localhost/app?schema=app',
    }),
  })
  .readonly()
  .meta({ description: 'The schema and the database one migration command is run against' })

/**
 * The Prisma schema engine on the schema Studio holds now and the database it already has open.
 * One engine per command: the datamodel is fixed when the engine is made, and Studio reloads the
 * schema whenever the file changes, so an engine kept between commands would go stale.
 *
 * @param input - the schema path, the files of the snapshot and the open connection
 * @returns the engine, the migrations directory and what it holds
 */
export function openMigrateSession(input: z.infer<typeof OpenMigrateSessionInput>) {
  return Effect.gen(function* () {
    // Prisma Migrate has no MySQL behind a driver adapter: `sql-schema-connector` panics with
    // `Unsupported adapter provider: Mysql` rather than refusing, and a panic in the engine takes
    // the Studio process with it. Nothing is asked of it for a MySQL database.
    if (input.driver.dialect === 'mysql') {
      return yield* new MigrateConfigError({
        message:
          'Prisma Migrate cannot read a MySQL or MariaDB database through a connection rather than a URL, so Studio cannot migrate one.\n   Migrate from the command line instead: hekireki migrate check, then hekireki migrate plan --migration.',
      })
    }
    // The schema engine is given a driver adapter, not a URL, so it has nothing to read a
    // `?schema=` from and asks the catalogue for `public` by name. A connection pointed at
    // another schema would have every table of it reported as missing, and a migration written
    // to create the lot. It is refused instead.
    const namespace = input.url === null ? null : makePostgresSchema({ url: input.url })
    if (input.driver.dialect === 'postgresql' && namespace !== null && namespace !== 'public') {
      return yield* new MigrateConfigError({
        message: `The database URL points at the schema "${namespace}", and Prisma Migrate reads "public" when it is given a connection rather than a URL.\n   Migrate from the command line for this database: hekireki migrate check --url ...`,
      })
    }
    const directory = yield* isDirectory(input.schemaPath).pipe(Effect.orElseSucceed(() => false))
    // Resolved: the schema path comes from the command line and may be relative, and what is
    // shown and written has to be somewhere a person can find.
    const schemaDir = path.resolve(directory ? input.schemaPath : path.dirname(input.schemaPath))
    // Where Prisma Migrate itself reads and writes them: `migrations.path` of prisma.config.ts,
    // else `migrations` beside the schema.
    const migrationsDir = yield* resolveMigrationsDir({ cwd: process.cwd(), schemaDir })
    // The provider the schema's datasource names, for a directory with no lock file to say it.
    const provider =
      input.files
        .map(
          (file) => /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"([^"]+)"/u.exec(file.content)?.[1],
        )
        .find((found) => found !== undefined) ?? input.driver.dialect
    const migrations = withLockfile(yield* readMigrationsList(migrationsDir), provider)
    const engine = yield* openSchemaEngine({
      files: input.files,
      // Checking a baseline replays the migrations into a shadow database beside this one.
      adapter: makeSchemaEngineAdapter(input.driver, () =>
        DatabaseService.openShadowDatabase({
          url: input.url ?? '',
          driver: input.driver,
          cwd: process.cwd(),
        }),
      ),
    })
    return {
      engine,
      migrations,
      migrationsDir,
      schemaDir,
      files: input.files,
      schemaPath: input.schemaPath,
    }
  })
}
