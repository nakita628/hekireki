import type { RouteHandler } from '@hono/zod-openapi'
import { Effect, Match } from 'effect'

import type {
  deleteDbRowsModelNameRoute,
  getDbCountsRoute,
  getDbRoute,
  getDbRowsModelNameRoute,
  patchDbRowsModelNameRoute,
  postDbRowsModelNameRoute,
  postDbSqlRoute,
} from '../routes'
import * as RuntimeService from '../services/index.js'
import * as DatabaseUseCase from '../usecases/index.js'

export const getDbRouteHandler: RouteHandler<typeof getDbRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(DatabaseUseCase.readDbStatus(), {
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

export const getDbCountsRouteHandler: RouteHandler<typeof getDbCountsRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(DatabaseUseCase.readCounts(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('DatabaseUnavailableError', ({ reason }) =>
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

export const getDbRowsModelNameRouteHandler: RouteHandler<typeof getDbRowsModelNameRoute> = (c) => {
  const param = c.req.valid('param')
  const query = c.req.valid('query')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(
      DatabaseUseCase.readRows({
        modelName: param.modelName,
        skip: query.skip,
        take: query.take,
        search: query.search,
      }),
      {
        onSuccess: (value) => Effect.succeed(c.json(value, 200)),
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tag('UnknownModelError', ({ model }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/not-found' as const,
                    title: 'Not Found' as const,
                    status: 404 as const,
                    detail: `Unknown model "${model}".`,
                    instance: c.req.path,
                  },
                  404,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('DatabaseUnavailableError', ({ reason }) =>
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
            Match.tag('DatabaseError', ({ cause }) =>
              Effect.logError('database error', cause).pipe(
                Effect.as(
                  c.json(
                    {
                      type: '/problems/service-unavailable' as const,
                      title: 'Service Unavailable' as const,
                      status: 503 as const,
                      detail: cause,
                      instance: c.req.path,
                    },
                    503,
                    { 'Content-Type': 'application/problem+json' },
                  ),
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

export const postDbRowsModelNameRouteHandler: RouteHandler<typeof postDbRowsModelNameRoute> = (
  c,
) => {
  const param = c.req.valid('param')
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(
      DatabaseUseCase.insertRow({ modelName: param.modelName, values: data.values }),
      {
        onSuccess: (value) => Effect.succeed(c.json(value, 200)),
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tag('UnknownModelError', ({ model }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/not-found' as const,
                    title: 'Not Found' as const,
                    status: 404 as const,
                    detail: `Unknown model "${model}".`,
                    instance: c.req.path,
                  },
                  404,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('DatabaseUnavailableError', ({ reason }) =>
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
            Match.tag('DatabaseError', ({ cause }) =>
              Effect.logError('database error', cause).pipe(
                Effect.as(
                  c.json(
                    {
                      type: '/problems/service-unavailable' as const,
                      title: 'Service Unavailable' as const,
                      status: 503 as const,
                      detail: cause,
                      instance: c.req.path,
                    },
                    503,
                    { 'Content-Type': 'application/problem+json' },
                  ),
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

export const patchDbRowsModelNameRouteHandler: RouteHandler<typeof patchDbRowsModelNameRoute> = (
  c,
) => {
  const param = c.req.valid('param')
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(
      DatabaseUseCase.updateRow({
        modelName: param.modelName,
        where: data.where,
        values: data.values,
      }),
      {
        onSuccess: (value) => Effect.succeed(c.json(value, 200)),
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tag('UnknownModelError', ({ model }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/not-found' as const,
                    title: 'Not Found' as const,
                    status: 404 as const,
                    detail: `Unknown model "${model}".`,
                    instance: c.req.path,
                  },
                  404,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('InvalidInputError', ({ field, message }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/validation-failed' as const,
                    title: 'Validation Failed' as const,
                    status: 422 as const,
                    detail: `${field} ${message}.`,
                    instance: c.req.path,
                    errors: [{ field, message }],
                  },
                  422,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('DatabaseUnavailableError', ({ reason }) =>
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
            Match.tag('DatabaseError', ({ cause }) =>
              Effect.logError('database error', cause).pipe(
                Effect.as(
                  c.json(
                    {
                      type: '/problems/service-unavailable' as const,
                      title: 'Service Unavailable' as const,
                      status: 503 as const,
                      detail: cause,
                      instance: c.req.path,
                    },
                    503,
                    { 'Content-Type': 'application/problem+json' },
                  ),
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

export const deleteDbRowsModelNameRouteHandler: RouteHandler<typeof deleteDbRowsModelNameRoute> = (
  c,
) => {
  const param = c.req.valid('param')
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(
      DatabaseUseCase.deleteRow({ modelName: param.modelName, where: data.where }),
      {
        onSuccess: (value) => Effect.succeed(c.json(value, 200)),
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tag('UnknownModelError', ({ model }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/not-found' as const,
                    title: 'Not Found' as const,
                    status: 404 as const,
                    detail: `Unknown model "${model}".`,
                    instance: c.req.path,
                  },
                  404,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('InvalidInputError', ({ field, message }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/validation-failed' as const,
                    title: 'Validation Failed' as const,
                    status: 422 as const,
                    detail: `${field} ${message}.`,
                    instance: c.req.path,
                    errors: [{ field, message }],
                  },
                  422,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('DatabaseUnavailableError', ({ reason }) =>
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
            Match.tag('DatabaseError', ({ cause }) =>
              Effect.logError('database error', cause).pipe(
                Effect.as(
                  c.json(
                    {
                      type: '/problems/service-unavailable' as const,
                      title: 'Service Unavailable' as const,
                      status: 503 as const,
                      detail: cause,
                      instance: c.req.path,
                    },
                    503,
                    { 'Content-Type': 'application/problem+json' },
                  ),
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

export const postDbSqlRouteHandler: RouteHandler<typeof postDbSqlRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(DatabaseUseCase.runSql({ sql: data.sql }), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('DatabaseUnavailableError', ({ reason }) =>
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
          Match.tag('DatabaseError', ({ cause }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: cause,
                  instance: c.req.path,
                  errors: [{ field: 'sql', message: cause }],
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
