import type { RouteHandler } from '@hono/zod-openapi'
import { Effect, Match } from 'effect'

import type { getDocsRoute } from '../routes'
import * as DocsUseCase from '../usecases/index.js'

/**
 * `GET /docs` handler. The documentation of the last schema that parsed: models, operations and
 * client API types.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DocsUseCase
 *   C->>H: GET /docs
 *   H->>U: readDocs()
 *   U-->>H: Docs
 *   H-->>C: 200 Docs
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const getDocsRouteHandler: RouteHandler<typeof getDocsRoute> = (c) =>
  Effect.runPromise(
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
