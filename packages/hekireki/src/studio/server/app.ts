import { serveStatic } from '@hono/node-server/serve-static'
import { Effect } from 'effect'
import { Hono } from 'hono'

import api from './index.js'
import * as ClientService from './services/index.js'
import type * as DatabaseService from './services/index.js'
import type * as StateService from './services/index.js'
import * as StudioService from './services/index.js'
import * as TypescriptService from './services/index.js'
import * as SchemaUseCase from './usecases/index.js'
import * as StudioUseCase from './usecases/index.js'

/** What a request for the page answers when the built client is not where Studio looks for it. */
export function missingAssetsMessage(staticDir: string) {
  return `Hekireki Studio assets were not found in ${staticDir}.\nReinstall hekireki, or run "pnpm build" when working from the repository.`
}

/**
 * The API (under /api, see index.ts) and the built client beside it, serving the given instances.
 * The client routes on the path (`/models/User`, `/docs`, ...), so every path that is neither an
 * asset nor an API route gets index.html. Without a client or a type checker, the use cases get
 * ones that say no database is connected.
 */
export function createStudioApp(input: {
  readonly state: ReturnType<typeof StateService.createStudioState>
  readonly staticDir: string
  readonly db: ReturnType<typeof DatabaseService.disconnectedDatabase>
  readonly client?: ReturnType<typeof ClientService.createProjectClient>
  readonly typescript?: ReturnType<typeof TypescriptService.createTypeChecker>
}) {
  StudioService.configureStudio({
    state: input.state,
    db: input.db,
    client:
      input.client ??
      ClientService.createProjectClient({
        target: null,
        reason: 'No database is connected.',
        schemaDir: '.',
        cwd: '.',
      }),
    typescript:
      input.typescript ?? TypescriptService.createTypeChecker({ schemaDir: '.', cwd: '.' }),
  })
  return (
    new Hono()
      .route('/', api)
      // An API path no route answers is not a page of the client.
      .all('/api/*', (c) => c.notFound())
      .use('/*', serveStatic({ root: input.staticDir }))
      .get('/*', serveStatic({ root: input.staticDir, path: 'index.html' }))
      .get('/*', (c) => c.text(missingAssetsMessage(input.staticDir), 500))
  )
}

/**
 * Opens the schema and what Studio serves beside it (the database, the client, the type checker,
 * the watchers), all held by the surrounding scope, and the app over them.
 */
export function openStudioApp(input: {
  readonly schemaPath: string
  readonly staticDir: string
  readonly databaseUrl: string | null
}) {
  return Effect.gen(function* () {
    const { state, snapshot, schemaDir } = yield* SchemaUseCase.openSnapshot({
      schemaPath: input.schemaPath,
    })
    const { db, client, typescript } = yield* StudioUseCase.openStudio({
      state,
      snapshot,
      schemaDir,
      databaseUrl: input.databaseUrl,
      cwd: process.cwd(),
    })
    const app = createStudioApp({ state, staticDir: input.staticDir, db, client, typescript })
    return { app, snapshot, database: db.status }
  })
}
