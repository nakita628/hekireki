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
import {
  findSchemaEngineBinary,
  openNativeSchemaEngine,
} from '../../../migrate/adapter/native-engine.js'
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
 * The Prisma schema engine on the schema Studio holds now and the database it already has open,
 * where it can be given that connection: not for MySQL, nor a PostgreSQL schema other than public.
 * One engine per command: the datamodel is fixed when the engine is made, and Studio reloads the
 * schema whenever the file changes, so an engine kept between commands would go stale.
 *
 * @param input - the schema path, the files of the snapshot and the open connection
 * @returns the engine, the migrations directory and what it holds
 */
export function openMigrateSession(input: z.infer<typeof OpenMigrateSessionInput>) {
  return Effect.gen(function* () {
    // The wasm engine Studio runs in its own process has no MySQL connector at all, and given a
    // connection rather than a URL it asks PostgreSQL's catalogue for `public` by name, so every
    // table of another schema would read as missing. For those, the native engine the Prisma CLI
    // runs is started on the URL instead, and there is no migrating those without it.
    const namespace = input.url === null ? null : makePostgresSchema({ url: input.url })
    const needsNative =
      input.driver.dialect === 'mysql' ||
      (input.driver.dialect === 'postgresql' && namespace !== null && namespace !== 'public')
    const binary = needsNative ? yield* findSchemaEngineBinary(process.cwd()) : null
    if (needsNative && (binary === null || input.url === null)) {
      return yield* new MigrateConfigError({
        message: `${input.driver.dialect === 'mysql' ? 'MySQL' : `The PostgreSQL schema "${namespace ?? ''}"`} is migrated through Prisma's native schema engine, which was not found: install \`@prisma/engines\` (it comes with \`prisma\`, and has to be allowed to run its install script), or name the binary with PRISMA_SCHEMA_ENGINE_BINARY.`,
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
    const engine =
      binary !== null
        ? openNativeSchemaEngine({
            binary,
            files: input.files,
            url: input.url ?? '',
            cwd: schemaDir,
          })
        : yield* openSchemaEngine({
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
      /**
       * The engine to ask of the database a rehearsal leaves: the wasm engine on the rehearsal's own
       * connection, or the native one on the URL of the copy it ran on. Null where neither can read
       * it: a rehearsal inside a transaction of Studio's connection, which another process cannot see.
       */
      rehearsalEngine:
        binary !== null && input.driver.dialect !== 'mysql'
          ? null
          : binary !== null
            ? (target: DatabaseService.Driver & { readonly url?: string }) =>
                Effect.succeed(
                  openNativeSchemaEngine({
                    binary,
                    files: input.files,
                    url: target.url ?? '',
                    cwd: schemaDir,
                  }),
                )
            : (target: DatabaseService.Driver & { readonly url?: string }) =>
                openSchemaEngine({ files: input.files, adapter: makeSchemaEngineAdapter(target) }),
      migrations,
      migrationsDir,
      schemaDir,
      files: input.files,
      schemaPath: input.schemaPath,
    }
  })
}
