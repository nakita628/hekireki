import type { RouteHandler } from '@hono/zod-openapi'
import { Effect, Match } from 'effect'

import type {
  deleteDbRowsModelNameRoute,
  getDbCountsRoute,
  getDbRoute,
  getDbRowsModelNameRoute,
  patchDbRowsModelNameRoute,
  postDbAnalyzeRoute,
  postDbExplainRoute,
  postDbRowsModelNameRoute,
  postDbSqlRoute,
} from '../routes'
import * as DatabaseUseCase from '../usecases/index.js'

/**
 * `GET /db` handler. The database connection status.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   C->>H: GET /db
 *   H->>U: readDbStatus()
 *   U-->>H: DbStatus
 *   H-->>C: 200 DbStatus
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const getDbRouteHandler: RouteHandler<typeof getDbRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(DatabaseUseCase.readDbStatus(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('ContractViolationError', ({ message }) =>
            Effect.logError('contract violation', message).pipe(
              Effect.as(
                c.json(
                  {
                    type: '/problems/internal-server-error',
                    title: 'Internal Server Error',
                    status: 500,
                    detail: 'An unexpected error occurred.',
                    instance: c.req.path,
                  } as const,
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
 * `GET /db/counts` handler. Row count of every model that has a table; a model whose count fails is
 * left out.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   C->>H: GET /db/counts
 *   H->>U: readCounts()
 *   U-->>H: Counts
 *   H-->>C: 200 Counts
 *   Note over H: on failure, Match.tag: DatabaseUnavailableError -> 503 / ContractViolationError -> 500
 * ```
 */
export const getDbCountsRouteHandler: RouteHandler<typeof getDbCountsRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(DatabaseUseCase.readCounts(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('DatabaseUnavailableError', ({ reason }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: reason,
                  instance: c.req.path,
                } as const,
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
                    type: '/problems/internal-server-error',
                    title: 'Internal Server Error',
                    status: 500,
                    detail: 'An unexpected error occurred.',
                    instance: c.req.path,
                  } as const,
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
 * `GET /db/rows/{modelName}` handler. One page of a model's rows, keyed by field name, ordered by
 * the key fields.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   C->>H: GET /db/rows/{modelName}
 *   H->>U: readRows()
 *   U-->>H: Rows
 *   H-->>C: 200 Rows
 *   Note over H: on failure, Match.tag: UnknownModelError -> 404 / DatabaseUnavailableError -> 503 / DatabaseError -> 503 / ContractViolationError -> 500
 * ```
 */
export const getDbRowsModelNameRouteHandler: RouteHandler<typeof getDbRowsModelNameRoute> = (c) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('query') }
  return Effect.runPromise(
    Effect.matchEffect(DatabaseUseCase.readRows(data), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('UnknownModelError', ({ model }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/not-found',
                  title: 'Not Found',
                  status: 404,
                  detail: `Unknown model "${model}".`,
                  instance: c.req.path,
                } as const,
                404,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('DatabaseUnavailableError', ({ reason }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: reason,
                  instance: c.req.path,
                } as const,
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
                    type: '/problems/service-unavailable',
                    title: 'Service Unavailable',
                    status: 503,
                    detail: cause,
                    instance: c.req.path,
                  } as const,
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
                    type: '/problems/internal-server-error',
                    title: 'Internal Server Error',
                    status: 500,
                    detail: 'An unexpected error occurred.',
                    instance: c.req.path,
                  } as const,
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
 * `POST /db/rows/{modelName}` handler. Insert one row; field names are translated to columns and
 * values to the driver's representation.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   C->>H: POST /db/rows/{modelName}
 *   H->>U: insertRow()
 *   U-->>H: Affected
 *   H-->>C: 200 Affected
 *   Note over H: on failure, Match.tag: UnknownModelError -> 404 / DatabaseUnavailableError -> 503 / DatabaseError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postDbRowsModelNameRouteHandler: RouteHandler<typeof postDbRowsModelNameRoute> = (
  c,
) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  return Effect.runPromise(
    Effect.matchEffect(
      DatabaseUseCase.insertRow({ modelName: data.modelName, values: data.values }),
      {
        onSuccess: (value) => Effect.succeed(c.json(value, 200)),
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tag('UnknownModelError', ({ model }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/not-found',
                    title: 'Not Found',
                    status: 404,
                    detail: `Unknown model "${model}".`,
                    instance: c.req.path,
                  } as const,
                  404,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('DatabaseUnavailableError', ({ reason }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/service-unavailable',
                    title: 'Service Unavailable',
                    status: 503,
                    detail: reason,
                    instance: c.req.path,
                  } as const,
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
                      type: '/problems/service-unavailable',
                      title: 'Service Unavailable',
                      status: 503,
                      detail: cause,
                      instance: c.req.path,
                    } as const,
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
                      type: '/problems/internal-server-error',
                      title: 'Internal Server Error',
                      status: 500,
                      detail: 'An unexpected error occurred.',
                      instance: c.req.path,
                    } as const,
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
 * `PATCH /db/rows/{modelName}` handler. Update the row identified by `where`; both parts must name
 * at least one field.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   C->>H: PATCH /db/rows/{modelName}
 *   H->>U: updateRow()
 *   U-->>H: Affected
 *   H-->>C: 200 Affected
 *   Note over H: on failure, Match.tag: UnknownModelError -> 404 / InvalidInputError -> 422 / DatabaseUnavailableError -> 503 / DatabaseError -> 503 / ContractViolationError -> 500
 * ```
 */
export const patchDbRowsModelNameRouteHandler: RouteHandler<typeof patchDbRowsModelNameRoute> = (
  c,
) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  return Effect.runPromise(
    Effect.matchEffect(
      DatabaseUseCase.updateRow({
        modelName: data.modelName,
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
                    type: '/problems/not-found',
                    title: 'Not Found',
                    status: 404,
                    detail: `Unknown model "${model}".`,
                    instance: c.req.path,
                  } as const,
                  404,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('InvalidInputError', ({ field, message }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/validation-failed',
                    title: 'Validation Failed',
                    status: 422,
                    detail: `${field} ${message}.`,
                    instance: c.req.path,
                    errors: [{ field, message }],
                  } as const,
                  422,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('DatabaseUnavailableError', ({ reason }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/service-unavailable',
                    title: 'Service Unavailable',
                    status: 503,
                    detail: reason,
                    instance: c.req.path,
                  } as const,
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
                      type: '/problems/service-unavailable',
                      title: 'Service Unavailable',
                      status: 503,
                      detail: cause,
                      instance: c.req.path,
                    } as const,
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
                      type: '/problems/internal-server-error',
                      title: 'Internal Server Error',
                      status: 500,
                      detail: 'An unexpected error occurred.',
                      instance: c.req.path,
                    } as const,
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
 * `DELETE /db/rows/{modelName}` handler. Delete the row identified by `where`.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   C->>H: DELETE /db/rows/{modelName}
 *   H->>U: deleteRow()
 *   U-->>H: Affected
 *   H-->>C: 200 Affected
 *   Note over H: on failure, Match.tag: UnknownModelError -> 404 / InvalidInputError -> 422 / DatabaseUnavailableError -> 503 / DatabaseError -> 503 / ContractViolationError -> 500
 * ```
 */
export const deleteDbRowsModelNameRouteHandler: RouteHandler<typeof deleteDbRowsModelNameRoute> = (
  c,
) => {
  const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  return Effect.runPromise(
    Effect.matchEffect(
      DatabaseUseCase.deleteRow({ modelName: data.modelName, where: data.where }),
      {
        onSuccess: (value) => Effect.succeed(c.json(value, 200)),
        onFailure: (error) =>
          Match.value(error).pipe(
            Match.tag('UnknownModelError', ({ model }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/not-found',
                    title: 'Not Found',
                    status: 404,
                    detail: `Unknown model "${model}".`,
                    instance: c.req.path,
                  } as const,
                  404,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('InvalidInputError', ({ field, message }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/validation-failed',
                    title: 'Validation Failed',
                    status: 422,
                    detail: `${field} ${message}.`,
                    instance: c.req.path,
                    errors: [{ field, message }],
                  } as const,
                  422,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
            Match.tag('DatabaseUnavailableError', ({ reason }) =>
              Effect.succeed(
                c.json(
                  {
                    type: '/problems/service-unavailable',
                    title: 'Service Unavailable',
                    status: 503,
                    detail: reason,
                    instance: c.req.path,
                  } as const,
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
                      type: '/problems/service-unavailable',
                      title: 'Service Unavailable',
                      status: 503,
                      detail: cause,
                      instance: c.req.path,
                    } as const,
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
                      type: '/problems/internal-server-error',
                      title: 'Internal Server Error',
                      status: 500,
                      detail: 'An unexpected error occurred.',
                      instance: c.req.path,
                    } as const,
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
 * `POST /db/sql` handler. Run the statements one by one and return the rows of the last, or its
 * affected count for a write, with the wall time of the whole.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   C->>H: POST /db/sql
 *   H->>U: runSql()
 *   U-->>H: SqlResult
 *   H-->>C: 200 SqlResult
 *   Note over H: on failure, Match.tag: InvalidInputError -> 422 / DatabaseUnavailableError -> 503 / DatabaseError -> 422 / ContractViolationError -> 500
 * ```
 */
export const postDbSqlRouteHandler: RouteHandler<typeof postDbSqlRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(DatabaseUseCase.runSql({ sql: data.sql, params: data.params ?? [] }), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('InvalidInputError', ({ field, message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed',
                  title: 'Validation Failed',
                  status: 422,
                  detail: `${field} ${message}.`,
                  instance: c.req.path,
                  errors: [{ field, message }],
                } as const,
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('DatabaseUnavailableError', ({ reason }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: reason,
                  instance: c.req.path,
                } as const,
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('DatabaseError', ({ cause }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed',
                  title: 'Validation Failed',
                  status: 422,
                  detail: cause,
                  instance: c.req.path,
                  errors: [{ field: 'sql', message: cause }],
                } as const,
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
                    type: '/problems/internal-server-error',
                    title: 'Internal Server Error',
                    status: 500,
                    detail: 'An unexpected error occurred.',
                    instance: c.req.path,
                  } as const,
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
 * `POST /db/analyze` handler. Analyze the statements against the Prisma schema's tables: data flow,
 * lineage, row type, parameters and problems.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   C->>H: POST /db/analyze
 *   H->>U: analyzeSql()
 *   U-->>H: Analysis
 *   H-->>C: 200 Analysis
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const postDbAnalyzeRouteHandler: RouteHandler<typeof postDbAnalyzeRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(DatabaseUseCase.analyzeSql({ sql: data.sql }), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('ContractViolationError', ({ message }) =>
            Effect.logError('contract violation', message).pipe(
              Effect.as(
                c.json(
                  {
                    type: '/problems/internal-server-error',
                    title: 'Internal Server Error',
                    status: 500,
                    detail: 'An unexpected error occurred.',
                    instance: c.req.path,
                  } as const,
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
 * `POST /db/explain` handler. The execution plan the database chooses for the first statement of
 * the text.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   C->>H: POST /db/explain
 *   H->>U: explainSql()
 *   U-->>H: Plan
 *   H-->>C: 200 Plan
 *   Note over H: on failure, Match.tag: InvalidInputError -> 422 / DatabaseUnavailableError -> 503 / DatabaseError -> 422 / ContractViolationError -> 500
 * ```
 */
export const postDbExplainRouteHandler: RouteHandler<typeof postDbExplainRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(DatabaseUseCase.explainSql({ sql: data.sql, params: data.params ?? [] }), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('InvalidInputError', ({ field, message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed',
                  title: 'Validation Failed',
                  status: 422,
                  detail: `${field} ${message}.`,
                  instance: c.req.path,
                  errors: [{ field, message }],
                } as const,
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('DatabaseUnavailableError', ({ reason }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: reason,
                  instance: c.req.path,
                } as const,
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('DatabaseError', ({ cause }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed',
                  title: 'Validation Failed',
                  status: 422,
                  detail: cause,
                  instance: c.req.path,
                  errors: [{ field: 'sql', message: cause }],
                } as const,
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
                    type: '/problems/internal-server-error',
                    title: 'Internal Server Error',
                    status: 500,
                    detail: 'An unexpected error occurred.',
                    instance: c.req.path,
                  } as const,
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
