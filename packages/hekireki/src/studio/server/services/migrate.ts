import path from 'node:path'

import { Effect } from 'effect'
import * as z from 'zod'

import type { Driver, openShadowDatabase } from '../../../database/driver.js'
import { makePostgresSchema } from '../../../database/url.js'
import { isDirectory } from '../../../file/index.js'
import { makeSchemaEngineAdapter } from '../../../migrate/adapter/engine-adapter.js'
import { openSchemaEngine } from '../../../migrate/adapter/engine.js'
import { resolveMigrationsDir } from '../../../migrate/adapter/migrations-dir.js'
import {
  findSchemaEngineBinary,
  openNativeSchemaEngine,
} from '../../../migrate/adapter/native-engine.js'
import { MigrateConfigError } from '../../../migrate/errors.js'

const CreateMigratePathsInput = z
  .object({
    schemaPath: z
      .string()
      .meta({ description: 'The schema file or directory.', example: 'prisma/schema.prisma' }),
    cwd: z.string().meta({ description: 'Where prisma.config.ts is looked up.', example: '/app' }),
  })
  .readonly()
  .meta({ description: 'The schema whose migrations are looked for, and from where' })

/**
 * Where the schema's directory and its migrations are, found the first time they are asked for
 * and kept: they move only with prisma.config.ts or the schema path, which Studio is restarted
 * for.
 *
 * ```mermaid
 * flowchart LR
 *   schemaPath --> fs[(file system)] --> schemaDir[the schema's directory, resolved]
 *   schemaDir --> config[(prisma.config.ts migrations.path)] --> migrationsDir
 *   schemaDir & migrationsDir --> kept[(kept after the first answer)]
 * ```
 *
 * @param input.schemaPath - the schema file or directory
 * @param input.cwd - where prisma.config.ts is looked up
 * @returns `resolve`, which answers both directories
 */
export function createMigratePaths(input: z.infer<typeof CreateMigratePathsInput>) {
  const holder: { found: { readonly schemaDir: string; readonly migrationsDir: string } | null } = {
    found: null,
  }
  function find() {
    return Effect.gen(function* () {
      if (holder.found !== null) return holder.found
      const directory = yield* isDirectory(input.schemaPath).pipe(
        Effect.catchTag('PlatformError', (error) =>
          Effect.logDebug('cannot tell whether the schema path is a directory', error).pipe(
            Effect.as(false),
          ),
        ),
      )
      // Resolved: the schema path comes from the command line and may be relative, and what is
      // shown and written has to be somewhere a person can find.
      const schemaDir = path.resolve(directory ? input.schemaPath : path.dirname(input.schemaPath))
      // Where Prisma Migrate itself reads and writes them: `migrations.path` of
      // prisma.config.ts, else `migrations` beside the schema.
      const migrationsDir = yield* resolveMigrationsDir({ cwd: input.cwd, schemaDir })
      // oxlint-disable-next-line custom/no-mutation -- the directories are found once and kept
      holder.found = { schemaDir, migrationsDir }
      return holder.found
    })
  }
  return { resolve: find }
}

const FindMigrateEngineInput = z
  .object({
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
      .custom<Driver>((value) => typeof value === 'object' && value !== null)
      .meta({ description: 'The open connection the engine reads and writes through.' }),
    url: z.string().nullable().meta({
      description: 'The URL as found, for the PostgreSQL schema it names.',
      example: 'postgresql://localhost/app?schema=app',
    }),
    schemaDir: z
      .string()
      .meta({ description: 'Where the native engine runs.', example: '/app/prisma' }),
    cwd: z
      .string()
      .meta({ description: 'Where the native engine binary is looked up.', example: '/app' }),
    openShadow: z
      .custom<() => ReturnType<typeof openShadowDatabase>>((value) => typeof value === 'function')
      .meta({ description: 'Opens the shadow database a baseline check replays migrations into.' }),
  })
  .readonly()
  .meta({ description: 'The schema and the database one migration command is run against' })

/**
 * Which Prisma schema engine a command runs on, and how to open it. The wasm engine takes the
 * connection Studio already has open; MySQL, and a PostgreSQL schema other than public, need the
 * native engine the Prisma CLI runs, started on the URL. Nothing is started here: one engine per
 * command, opened by the command that sends it something, since the datamodel is fixed when the
 * engine is made and Studio reloads the schema whenever the file changes.
 *
 * ```mermaid
 * flowchart LR
 *   in[files + open connection + url] --> which{MySQL, or a PostgreSQL schema other than public?}
 *   which -->|yes| binary[(native engine binary)]
 *   binary -->|not found| config[MigrateConfigError]
 *   binary --> native[open: native engine on the URL]
 *   which -->|no| wasm[open: wasm engine on the open connection]
 *   wasm -->|cannot start| engineError[MigrateEngineError]
 *   native & wasm --> out[open + the engine for a rehearsal's database]
 * ```
 *
 * @param input.files - the schema files the engine is made on
 * @param input.driver - the open connection
 * @param input.url - the URL as found, for the PostgreSQL schema it names
 * @param input.schemaDir - where the native engine runs
 * @param input.cwd - where the native engine binary is looked up
 * @param input.openShadow - opens the shadow database a baseline check replays migrations into
 * @returns `open`, which starts the engine, and the engine to ask of a rehearsal's database
 */
export function findMigrateEngine(input: z.infer<typeof FindMigrateEngineInput>) {
  return Effect.gen(function* () {
    // The wasm engine Studio runs in its own process has no MySQL connector at all, and given a
    // connection rather than a URL it asks PostgreSQL's catalogue for `public` by name, so every
    // table of another schema would read as missing.
    const namespace = input.url === null ? null : makePostgresSchema({ url: input.url })
    const needsNative =
      input.driver.dialect === 'mysql' ||
      (input.driver.dialect === 'postgresql' && namespace !== null && namespace !== 'public')
    const binary = needsNative ? yield* findSchemaEngineBinary(input.cwd) : null
    if (needsNative && (binary === null || input.url === null)) {
      return yield* new MigrateConfigError({
        message: `${input.driver.dialect === 'mysql' ? 'MySQL' : `The PostgreSQL schema "${namespace ?? ''}"`} is migrated through Prisma's native schema engine, which was not found: install \`@prisma/engines\` (it comes with \`prisma\`, and has to be allowed to run its install script), or name the binary with PRISMA_SCHEMA_ENGINE_BINARY.`,
      })
    }
    return {
      open: () =>
        binary === null
          ? openSchemaEngine({
              files: input.files,
              // Checking a baseline replays the migrations into a shadow database beside this one.
              adapter: makeSchemaEngineAdapter(input.driver, input.openShadow),
            })
          : Effect.succeed(
              openNativeSchemaEngine({
                binary,
                files: input.files,
                url: input.url ?? '',
                cwd: input.schemaDir,
              }),
            ),
      /**
       * The engine to ask of the database a rehearsal leaves: the wasm engine on the rehearsal's own
       * connection, or the native one on the URL of the copy it ran on. Null where neither can read
       * it: a rehearsal inside a transaction of Studio's connection, which another process cannot see.
       */
      rehearsalEngine:
        binary !== null && input.driver.dialect !== 'mysql'
          ? null
          : binary !== null
            ? (target: Driver & { readonly url?: string }) =>
                Effect.succeed(
                  openNativeSchemaEngine({
                    binary,
                    files: input.files,
                    url: target.url ?? '',
                    cwd: input.schemaDir,
                  }),
                )
            : (target: Driver & { readonly url?: string }) =>
                openSchemaEngine({ files: input.files, adapter: makeSchemaEngineAdapter(target) }),
    }
  })
}
