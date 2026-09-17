import path from 'node:path'

import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import { Effect } from 'effect'

import { isDirectory } from '../../file/index.js'
import { resolveMigrationsDir } from '../../migrate/adapter/migrations-dir.js'
import { readConfigUrl } from '../../seed/load-config.js'
import { withTypeScriptImports } from '../../seed/resolve.js'
import { createStudioApp } from './app.js'
import { MIGRATIONS_POLL_MS, RELOAD_DEBOUNCE_MS, STUDIO_HOSTNAME } from './constants/index.js'
import { SchemaLoadError, ServerListenError } from './errors/index.js'
import * as ClientService from './services/index.js'
import * as DatabaseService from './services/index.js'
import * as StateService from './services/index.js'
import * as WatchService from './services/index.js'

/** Listens on loopback until the scope closes; a port already in use fails with ServerListenError. */
function listen(input: {
  readonly fetch: (request: Request) => Response | Promise<Response>
  readonly port: number
}) {
  return Effect.acquireRelease(
    Effect.callback<ServerType, ServerListenError>((resume) => {
      // Loopback only: the API serves the raw schema and runs SQL without authentication.
      const server = serve({ fetch: input.fetch, port: input.port, hostname: STUDIO_HOSTNAME })
      server.once('listening', () => {
        resume(Effect.succeed(server))
      })
      server.once('error', (error: NodeJS.ErrnoException) => {
        resume(
          Effect.fail(
            new ServerListenError({
              port: input.port,
              code: error.code ?? null,
              message: error.message,
            }),
          ),
        )
      })
    }),
    (server) =>
      Effect.sync(() => {
        server.close()
      }),
  )
}

/** Loads the schema, connects the database, watches the schema directory and listens; everything is released with the scope. */
export function startStudioServer(options: {
  readonly schemaPath: string
  readonly port: number
  readonly staticDir: string
  readonly databaseUrl: string | null
}) {
  return Effect.gen(function* () {
    const directory = yield* isDirectory(options.schemaPath).pipe(
      Effect.mapError(
        (error) =>
          new SchemaLoadError({
            message: `Schema not found: ${options.schemaPath}\n   ${error.message}`,
          }),
      ),
    )
    const state = StateService.createStudioState({ schemaPath: options.schemaPath })
    const snapshot = yield* state.reload()
    const watchDir = directory ? options.schemaPath : path.dirname(options.schemaPath)
    // The `url` of hekireki.config.ts, so the database `hekireki seed` fills is the one Studio
    // opens. A config that does not load is not fatal to Studio: it shows the schema and says why.
    const config = yield* withTypeScriptImports(readConfigUrl(process.cwd())).pipe(
      Effect.match({
        onFailure: (error) => ({ url: null, error: error.message }),
        onSuccess: (url) => ({ url, error: null }),
      }),
    )
    const db = yield* DatabaseService.connectDatabase({
      explicitUrl: options.databaseUrl,
      configUrl: config.url,
      configError: config.error,
      schemaProvider: snapshot.schema?.provider ?? null,
      schemaText: snapshot.files.map((file) => file.content).join('\n'),
      cwd: process.cwd(),
      schemaDir: watchDir,
      env: process.env,
    })
    yield* Effect.addFinalizer(() => db.close)
    const client = ClientService.createProjectClient({
      target: db.target,
      reason: db.status.error,
      schemaDir: watchDir,
      cwd: process.cwd(),
    })
    yield* Effect.addFinalizer(() => client.close)
    yield* WatchService.watchSchema({ state, dir: watchDir, debounceMs: RELOAD_DEBOUNCE_MS })
    // The migrations Prisma Migrate reads, so the Migrate page follows the files as they change.
    const migrationsDir = yield* resolveMigrationsDir({
      cwd: process.cwd(),
      schemaDir: path.resolve(watchDir),
    })
    yield* WatchService.watchMigrations({
      state,
      dir: migrationsDir,
      intervalMs: MIGRATIONS_POLL_MS,
    })
    const app = createStudioApp(state, options.staticDir, db, client)
    const server = yield* listen({ fetch: app.fetch, port: options.port })
    return { snapshot, database: db.status, server }
  })
}
