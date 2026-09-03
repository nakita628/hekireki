import type { RouteHandler } from '@hono/zod-openapi'
import { Effect, Match } from 'effect'

import type { getDocsRoute } from '../routes'
import * as RuntimeService from '../services/index.js'
import * as DocsUseCase from '../usecases/index.js'

export const getDocsRouteHandler: RouteHandler<typeof getDocsRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(DocsUseCase.readDocs(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('ContractViolationError', ({ message }) =>
            Effect.logError('contract violation', message).pipe(
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
