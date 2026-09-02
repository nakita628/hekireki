import path from 'node:path'

import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import { Effect } from 'effect'

import { isDirectory } from '../../file/index.js'
import { createStudioApp } from './app.js'
import { RELOAD_DEBOUNCE_MS, STUDIO_HOSTNAME } from './constants/index.js'
import { SchemaLoadError, ServerListenError } from './errors/index.js'
import {
  connectDatabase,
  createStudioState,
  disconnectedDbState,
  watchSchema,
} from './services/index.js'

/** Listens on loopback until the scope closes; a port already in use fails with ServerListenError. */
export function listen(input: {
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
      server.once('error', (e: NodeJS.ErrnoException) => {
        resume(
          Effect.fail(
            new ServerListenError({ port: input.port, code: e.code ?? null, message: e.message }),
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
  /** `false` serves the schema alone (docs mode): no database is looked up or opened. */
  readonly database?: boolean
}) {
  return Effect.gen(function* () {
    const directory = yield* isDirectory(options.schemaPath).pipe(
      Effect.mapError(
        (e) =>
          new SchemaLoadError({
            message: `Schema not found: ${options.schemaPath}\n   ${e.message}`,
          }),
      ),
    )
    const state = createStudioState({ schemaPath: options.schemaPath })
    const snapshot = yield* state.reload()
    const watchDir = directory ? options.schemaPath : path.dirname(options.schemaPath)
    const db =
      options.database === false
        ? disconnectedDbState('Docs mode: the database is not opened.')
        : yield* connectDatabase({
            explicitUrl: options.databaseUrl,
            schemaProvider: snapshot.schema?.provider ?? null,
            cwd: process.cwd(),
            schemaDir: watchDir,
            env: process.env,
          })
    yield* Effect.addFinalizer(() => Effect.promise(() => db.close()))
    yield* watchSchema({ state, dir: watchDir, debounceMs: RELOAD_DEBOUNCE_MS })
    const app = createStudioApp(state, options.staticDir, db)
    const server = yield* listen({ fetch: app.fetch, port: options.port })
    return { snapshot, database: db.status(), server }
  })
}
