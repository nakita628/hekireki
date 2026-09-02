import path from 'node:path'

import { serveStatic } from '@hono/node-server/serve-static'
import { OpenAPIHono } from '@hono/zod-openapi'
import { Effect } from 'effect'
import { createMiddleware } from 'hono/factory'

import { readFile } from '../../file/index.js'
import { isLoopbackHostname } from '../../utils/index.js'
import { FORBIDDEN_HOST_MESSAGE } from './constants/index.js'
import { api } from './index.js'
import { configureRuntime, studioRuntime } from './services/index.js'
import type { createStudioState, disconnectedDbState } from './services/index.js'

// The API is unauthenticated, so a page on another origin must not be able to read it even
// when its DNS name resolves to this machine.
const loopbackOnly = createMiddleware((c, next) =>
  isLoopbackHostname(new URL(c.req.url).hostname)
    ? next()
    : Promise.resolve(c.text(FORBIDDEN_HOST_MESSAGE, 403)),
)

/** The generated API mounted under /api with the problem+json validation hook, error handler and Effect runtime. */
export function createStudioApi(
  state: ReturnType<typeof createStudioState>,
  db: ReturnType<typeof disconnectedDbState>,
) {
  configureRuntime({ state, db })
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            type: '/problems/validation-failed' as const,
            title: 'Validation Failed' as const,
            status: 422 as const,
            detail: 'The request failed validation. See `errors` for the offending fields.',
            instance: c.req.path,
            errors: result.error.issues.map((issue) => ({
              field: issue.path.map(String).join('.'),
              message: issue.message,
            })),
          },
          422,
          { 'Content-Type': 'application/problem+json' },
        )
      }
      return undefined
    },
  })
  app.use('/api/*', loopbackOnly)
  app.onError((error, c) => {
    Effect.runSync(Effect.logError('unhandled error', error))
    return c.json(
      {
        type: '/problems/internal-server-error' as const,
        title: 'Internal Server Error' as const,
        status: 500 as const,
        detail: 'An unexpected error occurred.',
        instance: c.req.path,
      },
      500,
      { 'Content-Type': 'application/problem+json' },
    )
  })
  app.route('/api', api)
  app.doc('/api/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Hekireki Studio API', version: '1.0.0' },
  })
  return app
}

export function missingAssetsMessage(staticDir: string) {
  return `Hekireki Studio assets were not found in ${staticDir}.\nReinstall hekireki, or run "pnpm build" when working from the repository.`
}

/** The API plus the built client. The client routes on the path (`/models/User`, `/docs`, ...), so every path that is neither an asset nor an API route gets index.html. */
export function createStudioApp(
  state: ReturnType<typeof createStudioState>,
  staticDir: string,
  db: ReturnType<typeof disconnectedDbState>,
) {
  const app = createStudioApi(state, db)
  app.use('/*', serveStatic({ root: staticDir }))
  app.get('/*', (c) =>
    c.req.path.startsWith('/api/')
      ? c.notFound()
      : studioRuntime().runPromise(
          Effect.match(readFile(path.join(staticDir, 'index.html')), {
            onSuccess: (html) => c.html(html),
            onFailure: () => c.text(missingAssetsMessage(staticDir), 500),
          }),
        ),
  )
  return app
}
