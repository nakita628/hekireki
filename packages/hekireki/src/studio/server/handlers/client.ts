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
import * as RuntimeService from '../services/index.js'
import * as ClientUseCase from '../usecases/index.js'

export const getClientRouteHandler: RouteHandler<typeof getClientRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
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

export const postClientAnalyzeRouteHandler: RouteHandler<typeof postClientAnalyzeRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
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

export const postClientRunRouteHandler: RouteHandler<typeof postClientRunRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
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

export const postClientCompleteRouteHandler: RouteHandler<typeof postClientCompleteRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
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

export const postClientCompleteDetailRouteHandler: RouteHandler<
  typeof postClientCompleteDetailRoute
> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
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

export const postClientHoverRouteHandler: RouteHandler<typeof postClientHoverRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
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

export const postClientSignatureRouteHandler: RouteHandler<typeof postClientSignatureRoute> = (
  c,
) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
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

export const postClientCheckRouteHandler: RouteHandler<typeof postClientCheckRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
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

export const postClientFormatRouteHandler: RouteHandler<typeof postClientFormatRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
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

export const postClientPreviewRouteHandler: RouteHandler<typeof postClientPreviewRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
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
