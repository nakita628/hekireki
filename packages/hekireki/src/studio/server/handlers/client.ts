import type { RouteHandler } from '@hono/zod-openapi'
import { Effect, Match } from 'effect'

import type {
  getClientRoute,
  postClientAnalyzeRoute,
  postClientCheckRoute,
  postClientCompleteDetailRoute,
  postClientCompleteRoute,
  postClientFormatRoute,
  postClientHoverRoute,
  postClientPreviewRoute,
  postClientRunRoute,
  postClientSignatureRoute,
} from '../routes'
import * as ClientUseCase from '../usecases/index.js'

/**
 * `GET /client` handler. Load the project's Prisma Client, the first time it is asked for, and say
 * whether it could.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   C->>H: GET /client
 *   H->>U: readClientStatus()
 *   U-->>H: ClientStatus
 *   H-->>C: 200 ClientStatus
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const getClientRouteHandler: RouteHandler<typeof getClientRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(ClientUseCase.readClientStatus(), {
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

/**
 * `POST /client/analyze` handler. Read the query against the schema's models, without running it:
 * its calls and its problems.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   C->>H: POST /client/analyze
 *   H->>U: analyzeClientQuery()
 *   U-->>H: ClientAnalysis
 *   H-->>C: 200 ClientAnalysis
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const postClientAnalyzeRouteHandler: RouteHandler<typeof postClientAnalyzeRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(ClientUseCase.analyzeClientQuery({ query: data.query }), {
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
}

/**
 * `POST /client/run` handler. Run the query through the project's Prisma Client and return its
 * result with the SQL it sent.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   C->>H: POST /client/run
 *   H->>U: runClientQuery()
 *   U-->>H: ClientResult
 *   H-->>C: 200 ClientResult
 *   Note over H: on failure, Match.tag: InvalidInputError -> 422 / ClientQueryError -> 422 / ClientUnavailableError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postClientRunRouteHandler: RouteHandler<typeof postClientRunRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(ClientUseCase.runClientQuery({ query: data.query }), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('InvalidInputError', ({ field, message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: message,
                  instance: c.req.path,
                  errors: [{ field, message }],
                },
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('ClientQueryError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: message,
                  instance: c.req.path,
                  errors: [{ field: 'query', message }],
                },
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('ClientUnavailableError', ({ reason }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: reason,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
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
}

/**
 * `POST /client/complete` handler. The completions TypeScript offers at a position, against the
 * client's types.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   C->>H: POST /client/complete
 *   H->>U: completeClientQuery()
 *   U-->>H: ClientCompletions
 *   H-->>C: 200 ClientCompletions
 *   Note over H: on failure, Match.tag: ClientUnavailableError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postClientCompleteRouteHandler: RouteHandler<typeof postClientCompleteRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(
      ClientUseCase.completeClientQuery({ query: data.query, offset: data.offset }),
      {
        onSuccess: (value) => Effect.succeed(c.json(value, 200)),
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tag('ClientUnavailableError', ({ reason }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/service-unavailable' as const,
                    title: 'Service Unavailable' as const,
                    status: 503 as const,
                    detail: reason,
                    instance: c.req.path,
                  },
                  503,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
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
      },
    ),
  )
}

/**
 * `POST /client/complete/detail` handler. The type and documentation of one completion item.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   C->>H: POST /client/complete/detail
 *   H->>U: detailClientCompletion()
 *   U-->>H: ClientCompletionDetail
 *   H-->>C: 200 ClientCompletionDetail
 *   Note over H: on failure, Match.tag: ClientUnavailableError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postClientCompleteDetailRouteHandler: RouteHandler<
  typeof postClientCompleteDetailRoute
> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(
      ClientUseCase.detailClientCompletion({
        query: data.query,
        offset: data.offset,
        name: data.name,
      }),
      {
        onSuccess: (value) => Effect.succeed(c.json(value, 200)),
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tag('ClientUnavailableError', ({ reason }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/service-unavailable' as const,
                    title: 'Service Unavailable' as const,
                    status: 503 as const,
                    detail: reason,
                    instance: c.req.path,
                  },
                  503,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
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
      },
    ),
  )
}

/**
 * `POST /client/hover` handler. What TypeScript says about the symbol at a position.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   C->>H: POST /client/hover
 *   H->>U: hoverClientQuery()
 *   U-->>H: ClientHover
 *   H-->>C: 200 ClientHover
 *   Note over H: on failure, Match.tag: ClientUnavailableError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postClientHoverRouteHandler: RouteHandler<typeof postClientHoverRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(ClientUseCase.hoverClientQuery({ query: data.query, offset: data.offset }), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('ClientUnavailableError', ({ reason }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: reason,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
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
}

/**
 * `POST /client/signature` handler. The signatures of the call the cursor is inside.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   C->>H: POST /client/signature
 *   H->>U: signatureClientQuery()
 *   U-->>H: ClientSignatureHelp
 *   H-->>C: 200 ClientSignatureHelp
 *   Note over H: on failure, Match.tag: ClientUnavailableError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postClientSignatureRouteHandler: RouteHandler<typeof postClientSignatureRoute> = (
  c,
) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(
      ClientUseCase.signatureClientQuery({ query: data.query, offset: data.offset }),
      {
        onSuccess: (value) => Effect.succeed(c.json(value, 200)),
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tag('ClientUnavailableError', ({ reason }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/service-unavailable' as const,
                    title: 'Service Unavailable' as const,
                    status: 503 as const,
                    detail: reason,
                    instance: c.req.path,
                  },
                  503,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
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
      },
    ),
  )
}

/**
 * `POST /client/check` handler. What TypeScript finds wrong with the query, checked against the
 * client's types.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   C->>H: POST /client/check
 *   H->>U: checkClientQuery()
 *   U-->>H: ClientTypeDiagnostics
 *   H-->>C: 200 ClientTypeDiagnostics
 *   Note over H: on failure, Match.tag: ClientUnavailableError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postClientCheckRouteHandler: RouteHandler<typeof postClientCheckRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(ClientUseCase.checkClientQuery({ query: data.query }), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('ClientUnavailableError', ({ reason }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: reason,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
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
}

/**
 * `POST /client/format` handler. The query laid out as the TypeScript formatter writes it; a query
 * that does not parse is reported on `query`.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   C->>H: POST /client/format
 *   H->>U: formatClientQuery()
 *   U-->>H: ClientFormatted
 *   H-->>C: 200 ClientFormatted
 *   Note over H: on failure, Match.tag: FormatError -> 422 / ContractViolationError -> 500
 * ```
 */
export const postClientFormatRouteHandler: RouteHandler<typeof postClientFormatRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(ClientUseCase.formatClientQuery({ query: data.query }), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('FormatError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: message,
                  instance: c.req.path,
                  errors: [{ field: 'query', message }],
                },
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
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
}

/**
 * `POST /client/preview` handler. Run a query that only reads to show the SQL it sends while it is
 * typed; a write is refused on `query`.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   C->>H: POST /client/preview
 *   H->>U: previewClientQuery()
 *   U-->>H: ClientPreview
 *   H-->>C: 200 ClientPreview
 *   Note over H: on failure, Match.tag: InvalidInputError -> 422 / ClientQueryError -> 422 / ClientUnavailableError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postClientPreviewRouteHandler: RouteHandler<typeof postClientPreviewRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(ClientUseCase.previewClientQuery({ query: data.query }), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('InvalidInputError', ({ field, message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: message,
                  instance: c.req.path,
                  errors: [{ field, message }],
                },
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('ClientQueryError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: message,
                  instance: c.req.path,
                  errors: [{ field: 'query', message }],
                },
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('ClientUnavailableError', ({ reason }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: reason,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
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
}
