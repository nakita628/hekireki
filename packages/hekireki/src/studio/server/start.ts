import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import { Effect } from 'effect'

import { createStudioApp } from './app.js'
import { STUDIO_HOSTNAME } from './constants/index.js'
import { ServerListenError } from './errors/index.js'
import * as SchemaUseCase from './usecases/index.js'
import * as StudioUseCase from './usecases/index.js'

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

/** Listens, then opens the schema and what Studio serves beside it; everything is released with the scope. */
export function startStudioServer(options: {
  readonly schemaPath: string
  readonly port: number
  readonly staticDir: string
  readonly databaseUrl: string | null
}) {
  return Effect.gen(function* () {
    // The port is taken before anything heavy is loaded, so a port in use is said at once rather
    // than after the schema, the language server and the database; a request that arrives in
    // between waits for the app.
    const app = Promise.withResolvers<ReturnType<typeof createStudioApp>>()
    const server = yield* listen({
      fetch: (request) => app.promise.then((ready) => ready.fetch(request)),
      port: options.port,
    })
    const { state, snapshot, schemaDir } = yield* SchemaUseCase.openSnapshot({
      schemaPath: options.schemaPath,
    })
    const { db, client, typescript } = yield* StudioUseCase.openStudio({
      state,
      snapshot,
      schemaDir,
      databaseUrl: options.databaseUrl,
      cwd: process.cwd(),
    })
    app.resolve(createStudioApp({ state, staticDir: options.staticDir, db, client, typescript }))
    return { snapshot, database: db.status, server }
  })
}
