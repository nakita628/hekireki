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
import { studioRuntime } from '../services/index.js'
import {
  deleteRow,
  insertRow,
  readCounts,
  readDbStatus,
  readRows,
  runSql,
  updateRow,
} from '../usecases/index.js'

export const getDbRouteHandler: RouteHandler<typeof getDbRoute> = (c) =>
  studioRuntime().runPromise(
    Effect.matchEffect(readDbStatus(), {
      onSuccess: (status) => Effect.succeed(c.json(status, 200)),
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

export const getDbCountsRouteHandler: RouteHandler<typeof getDbCountsRoute> = (c) =>
  studioRuntime().runPromise(
    Effect.matchEffect(readCounts(), {
      onSuccess: (counts) => Effect.succeed(c.json(counts, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('DatabaseUnavailableError', (e) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: e.reason,
                  instance: c.req.path,
                },
                503,
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

export const getDbRowsModelNameRouteHandler: RouteHandler<typeof getDbRowsModelNameRoute> = (c) => {
  const param = c.req.valid('param')
  const query = c.req.valid('query')
  return studioRuntime().runPromise(
    Effect.matchEffect(
      readRows({
        modelName: param.modelName,
        skip: query.skip,
        take: query.take,
        search: query.search,
      }),
      {
        onSuccess: (rows) => Effect.succeed(c.json(rows, 200)),
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tag('UnknownModelError', (e) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/not-found' as const,
                    title: 'Not Found' as const,
                    status: 404 as const,
                    detail: `Unknown model "${e.model}".`,
                    instance: c.req.path,
                  },
                  404,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('DatabaseUnavailableError', (e) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/service-unavailable' as const,
                    title: 'Service Unavailable' as const,
                    status: 503 as const,
                    detail: e.reason,
                    instance: c.req.path,
                  },
                  503,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('DatabaseError', (e) =>
              Effect.logError('database error', e.cause).pipe(
                Effect.as(
                  c.json(
                    {
                      type: '/problems/service-unavailable' as const,
                      title: 'Service Unavailable' as const,
                      status: 503 as const,
                      detail: e.cause,
                      instance: c.req.path,
                    },
                    503,
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
      },
    ),
  )
}

export const postDbRowsModelNameRouteHandler: RouteHandler<typeof postDbRowsModelNameRoute> = (
  c,
) => {
  const param = c.req.valid('param')
  const data = c.req.valid('json')
  return studioRuntime().runPromise(
    Effect.matchEffect(insertRow({ modelName: param.modelName, values: data.values }), {
      onSuccess: (result) => Effect.succeed(c.json(result, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('UnknownModelError', (e) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/not-found' as const,
                  title: 'Not Found' as const,
                  status: 404 as const,
                  detail: `Unknown model "${e.model}".`,
                  instance: c.req.path,
                },
                404,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('DatabaseUnavailableError', (e) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: e.reason,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('DatabaseError', (e) =>
            Effect.logError('database error', e.cause).pipe(
              Effect.as(
                c.json(
                  {
                    type: '/problems/service-unavailable' as const,
                    title: 'Service Unavailable' as const,
                    status: 503 as const,
                    detail: e.cause,
                    instance: c.req.path,
                  },
                  503,
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

export const patchDbRowsModelNameRouteHandler: RouteHandler<typeof patchDbRowsModelNameRoute> = (
  c,
) => {
  const param = c.req.valid('param')
  const data = c.req.valid('json')
  return studioRuntime().runPromise(
    Effect.matchEffect(
      updateRow({
        modelName: param.modelName,
        where: data.where,
        values: data.values,
      }),
      {
        onSuccess: (result) => Effect.succeed(c.json(result, 200)),
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tag('UnknownModelError', (e) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/not-found' as const,
                    title: 'Not Found' as const,
                    status: 404 as const,
                    detail: `Unknown model "${e.model}".`,
                    instance: c.req.path,
                  },
                  404,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('InvalidInputError', (e) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/validation-failed' as const,
                    title: 'Validation Failed' as const,
                    status: 422 as const,
                    detail: `${e.field} ${e.message}.`,
                    instance: c.req.path,
                    errors: [{ field: e.field, message: e.message }],
                  },
                  422,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('DatabaseUnavailableError', (e) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/service-unavailable' as const,
                    title: 'Service Unavailable' as const,
                    status: 503 as const,
                    detail: e.reason,
                    instance: c.req.path,
                  },
                  503,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('DatabaseError', (e) =>
              Effect.logError('database error', e.cause).pipe(
                Effect.as(
                  c.json(
                    {
                      type: '/problems/service-unavailable' as const,
                      title: 'Service Unavailable' as const,
                      status: 503 as const,
                      detail: e.cause,
                      instance: c.req.path,
                    },
                    503,
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
      },
    ),
  )
}

export const deleteDbRowsModelNameRouteHandler: RouteHandler<typeof deleteDbRowsModelNameRoute> = (
  c,
) => {
  const param = c.req.valid('param')
  const data = c.req.valid('json')
  return studioRuntime().runPromise(
    Effect.matchEffect(deleteRow({ modelName: param.modelName, where: data.where }), {
      onSuccess: (result) => Effect.succeed(c.json(result, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('UnknownModelError', (e) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/not-found' as const,
                  title: 'Not Found' as const,
                  status: 404 as const,
                  detail: `Unknown model "${e.model}".`,
                  instance: c.req.path,
                },
                404,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('InvalidInputError', (e) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: `${e.field} ${e.message}.`,
                  instance: c.req.path,
                  errors: [{ field: e.field, message: e.message }],
                },
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('DatabaseUnavailableError', (e) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: e.reason,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('DatabaseError', (e) =>
            Effect.logError('database error', e.cause).pipe(
              Effect.as(
                c.json(
                  {
                    type: '/problems/service-unavailable' as const,
                    title: 'Service Unavailable' as const,
                    status: 503 as const,
                    detail: e.cause,
                    instance: c.req.path,
                  },
                  503,
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

export const postDbSqlRouteHandler: RouteHandler<typeof postDbSqlRoute> = (c) => {
  const data = c.req.valid('json')
  return studioRuntime().runPromise(
    Effect.matchEffect(runSql({ sql: data.sql }), {
      onSuccess: (result) => Effect.succeed(c.json(result, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('DatabaseUnavailableError', (e) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: e.reason,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('DatabaseError', (e) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: e.cause,
                  instance: c.req.path,
                  errors: [{ field: 'sql', message: e.cause }],
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
