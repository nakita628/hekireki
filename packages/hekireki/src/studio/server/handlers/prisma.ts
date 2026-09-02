import type { RouteHandler } from '@hono/zod-openapi'
import { Effect, Match } from 'effect'

import type { postPrismaCompleteRoute, postPrismaFormatRoute, postPrismaLintRoute } from '../routes'
import { studioRuntime } from '../services/index.js'
import { completeAt, formatText, lintText } from '../usecases/index.js'

export const postPrismaFormatRouteHandler: RouteHandler<typeof postPrismaFormatRoute> = (c) => {
  const data = c.req.valid('json')
  return studioRuntime().runPromise(
    Effect.matchEffect(formatText({ text: data.text }), {
      onSuccess: (formatted) => Effect.succeed(c.json(formatted, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('FormatError', (e) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: e.cause,
                  instance: c.req.path,
                  errors: [{ field: 'text', message: e.cause }],
                },
                422,
                { 'Content-Type': 'application/problem+json' },
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

export const postPrismaLintRouteHandler: RouteHandler<typeof postPrismaLintRoute> = (c) => {
  const data = c.req.valid('json')
  return studioRuntime().runPromise(
    Effect.matchEffect(lintText({ path: data.path, text: data.text }), {
      onSuccess: (result) => Effect.succeed(c.json(result, 200)),
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
}

export const postPrismaCompleteRouteHandler: RouteHandler<typeof postPrismaCompleteRoute> = (c) => {
  const data = c.req.valid('json')
  return studioRuntime().runPromise(
    Effect.matchEffect(
      completeAt({ text: data.text, line: data.line, character: data.character }),
      {
        onSuccess: (result) => Effect.succeed(c.json(result, 200)),
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
      },
    ),
  )
}
