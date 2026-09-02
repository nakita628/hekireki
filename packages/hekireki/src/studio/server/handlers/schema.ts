import type { RouteHandler } from '@hono/zod-openapi'
import { Effect, Match } from 'effect'
import { streamSSE } from 'hono/streaming'

import { SSE_PING_MS, SSE_POLL_MS } from '../constants/index.js'
import type {
  getSchemaEventsRoute,
  getSchemaRoute,
  postSchemaReloadRoute,
  putSchemaFilesRoute,
} from '../routes'
import { studioRuntime, StudioStateTag } from '../services/index.js'
import { readSnapshot, reloadSnapshot, writeFile } from '../usecases/index.js'

export const getSchemaRouteHandler: RouteHandler<typeof getSchemaRoute> = (c) =>
  studioRuntime().runPromise(
    Effect.matchEffect(readSnapshot(), {
      onSuccess: (snapshot) => Effect.succeed(c.json(snapshot, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('ContractViolationError', (e) =>
            Effect.logError('contract violation', e.message).pipe(
              Effect.as(
                c.json(
                  {
                    type: '/problems/internal-server-error' as const,
                    title: 'Internal Server Error' as const,
                    status: 500 as const,
                    detail: 'An unexpected error occurred.',
                    instance: c.req.path,
                  },
                  500,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
          ),
          Match.exhaustive,
        ),
    }),
  )

export const postSchemaReloadRouteHandler: RouteHandler<typeof postSchemaReloadRoute> = (c) =>
  studioRuntime().runPromise(
    Effect.matchEffect(reloadSnapshot(), {
      onSuccess: (snapshot) => Effect.succeed(c.json(snapshot, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('ContractViolationError', (e) =>
            Effect.logError('contract violation', e.message).pipe(
              Effect.as(
                c.json(
                  {
                    type: '/problems/internal-server-error' as const,
                    title: 'Internal Server Error' as const,
                    status: 500 as const,
                    detail: 'An unexpected error occurred.',
                    instance: c.req.path,
                  },
                  500,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
          ),
          Match.exhaustive,
        ),
    }),
  )

export const putSchemaFilesRouteHandler: RouteHandler<typeof putSchemaFilesRoute> = (c) => {
  const data = c.req.valid('json')
  return studioRuntime().runPromise(
    Effect.matchEffect(writeFile({ path: data.path, content: data.content }), {
      onSuccess: (snapshot) => Effect.succeed(c.json(snapshot, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('UnknownFileError', (e) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/not-found' as const,
                  title: 'Not Found' as const,
                  status: 404 as const,
                  detail: `Unknown schema file "${e.path}". Only the files Studio loaded can be written.`,
                  instance: c.req.path,
                },
                404,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('FileWriteError', (e) =>
            Effect.logError('schema file write failed', e.cause).pipe(
              Effect.as(
                c.json(
                  {
                    type: '/problems/validation-failed' as const,
                    title: 'Validation Failed' as const,
                    status: 422 as const,
                    detail: `Could not write ${e.path}: ${e.cause}`,
                    instance: c.req.path,
                    errors: [{ field: 'path', message: e.cause }],
                  },
                  422,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
          ),
          Match.tag('ContractViolationError', (e) =>
            Effect.logError('contract violation', e.message).pipe(
              Effect.as(
                c.json(
                  {
                    type: '/problems/internal-server-error' as const,
                    title: 'Internal Server Error' as const,
                    status: 500 as const,
                    detail: 'An unexpected error occurred.',
                    instance: c.req.path,
                  },
                  500,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
          ),
          Match.exhaustive,
        ),
    }),
  )
}

// Announces `change` whenever the snapshot's updatedAt moves, whoever triggered the reload.
export const getSchemaEventsRouteHandler: RouteHandler<typeof getSchemaEventsRoute> = (c) =>
  streamSSE(c, async (stream) => {
    const state = studioRuntime().runSync(StudioStateTag)
    const initial = state.snapshot().updatedAt
    await stream.writeSSE({ event: 'ready', data: initial })
    const pump = async (seen: {
      readonly updatedAt: string
      readonly pingedAt: number
    }): Promise<void> => {
      if (stream.aborted) return
      await stream.sleep(SSE_POLL_MS)
      const current = state.snapshot().updatedAt
      if (current !== seen.updatedAt) {
        await stream.writeSSE({ event: 'change', data: current })
        await pump({ updatedAt: current, pingedAt: Date.now() })
        return
      }
      if (Date.now() - seen.pingedAt > SSE_PING_MS) {
        await stream.writeSSE({ event: 'ping', data: '' })
        await pump({ updatedAt: seen.updatedAt, pingedAt: Date.now() })
        return
      }
      await pump(seen)
    }
    await pump({ updatedAt: initial, pingedAt: Date.now() })
  })
