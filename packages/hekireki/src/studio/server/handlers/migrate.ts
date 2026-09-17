import type { RouteHandler } from '@hono/zod-openapi'
import { Effect, Match } from 'effect'

import type {
  getMigrateBackupsRoute,
  getMigrateBaselineRoute,
  getMigrateDecisionsRoute,
  getMigrateDiffRoute,
  getMigrateMigrationsMigrationNameRoute,
  getMigrateRoute,
  getMigrateTablesRoute,
  postMigrateApplyRoute,
  postMigrateBackupsRestoreRoute,
  postMigrateBackupsRoute,
  postMigrateBaselineRoute,
  postMigrateDeployRoute,
  postMigrateMigrationsAppliedRoute,
  postMigrateMigrationsRolledBackRoute,
  postMigrateMigrationsRoute,
  postMigratePlanRoute,
  postMigrateRehearseRoute,
  putMigrateDecisionsRoute,
} from '../routes'
import * as RuntimeService from '../services/index.js'
import * as MigrateUseCase from '../usecases/index.js'

export const getMigrateRouteHandler: RouteHandler<typeof getMigrateRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.readMigrateStatus(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
                  instance: c.req.path,
                },
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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

export const getMigrateDiffRouteHandler: RouteHandler<typeof getMigrateDiffRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.readMigrateDiff(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
                  instance: c.req.path,
                },
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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

export const postMigratePlanRouteHandler: RouteHandler<typeof postMigratePlanRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.planMigration(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          // The fixes of hekireki.config.ts do not fit the schema and the database: the person
          // writing them is the one who can put it right, so what it says reaches them.
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: 'The migration could not be planned.',
                  instance: c.req.path,
                  errors: [{ field: 'config', message }],
                },
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('MigrateDatabaseError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
                  instance: c.req.path,
                },
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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

export const postMigrateApplyRouteHandler: RouteHandler<typeof postMigrateApplyRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.applyMigrationStatements(c.req.valid('json')), {
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

export const postMigrateMigrationsRouteHandler: RouteHandler<typeof postMigrateMigrationsRoute> = (
  c,
) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.createMigration(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
                  instance: c.req.path,
                },
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: 'The migration could not be written.',
                  instance: c.req.path,
                  errors: [{ field: 'name', message: String(failure) }],
                },
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

export const postMigrateMigrationsAppliedRouteHandler: RouteHandler<
  typeof postMigrateMigrationsAppliedRoute
> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.recordMigrationApplied(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
                  instance: c.req.path,
                },
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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

export const postMigrateMigrationsRolledBackRouteHandler: RouteHandler<
  typeof postMigrateMigrationsRolledBackRoute
> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.recordMigrationRolledBack(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
                  instance: c.req.path,
                },
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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

export const postMigrateDeployRouteHandler: RouteHandler<typeof postMigrateDeployRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.deployMigrations(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
                  instance: c.req.path,
                },
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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

export const getMigrateDecisionsRouteHandler: RouteHandler<typeof getMigrateDecisionsRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.readMigrationDecisions(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
                  instance: c.req.path,
                },
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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

export const putMigrateDecisionsRouteHandler: RouteHandler<typeof putMigrateDecisionsRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.writeMigrationDecisions(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
                  instance: c.req.path,
                },
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: 'The decisions could not be kept.',
                  instance: c.req.path,
                  errors: [{ field: 'decisions', message: String(failure) }],
                },
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

export const getMigrateBaselineRouteHandler: RouteHandler<typeof getMigrateBaselineRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.readMigrateBaseline(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
                  instance: c.req.path,
                },
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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

export const postMigrateBaselineRouteHandler: RouteHandler<typeof postMigrateBaselineRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.baselineDatabase(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          // The database does not match the migrations, or there is no such migration: the one
          // who asked is the one who can put it right, so what it says reaches them.
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: 'The database could not be baselined.',
                  instance: c.req.path,
                  errors: [{ field: 'name', message }],
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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

export const getMigrateMigrationsMigrationNameRouteHandler: RouteHandler<
  typeof getMigrateMigrationsMigrationNameRoute
> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.readMigrationFile(c.req.valid('param')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrationNotFoundError', ({ name, baseDir }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/not-found' as const,
                  title: 'Not Found' as const,
                  status: 404 as const,
                  detail: `There is no migration ${name} in ${baseDir}.`,
                  instance: c.req.path,
                },
                404,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
                  instance: c.req.path,
                },
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail: message,
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

export const postMigrateRehearseRouteHandler: RouteHandler<typeof postMigrateRehearseRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.rehearse(c.req.valid('json')), {
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
          // The database or the schema engine refused: what it said reaches the page.
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail:
                    'reason' in failure && typeof failure.reason === 'string'
                      ? failure.reason
                      : failure.message,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

export const getMigrateTablesRouteHandler: RouteHandler<typeof getMigrateTablesRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.readTableCounts(), {
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
          // The database or the schema engine refused: what it said reaches the page.
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail:
                    'reason' in failure && typeof failure.reason === 'string'
                      ? failure.reason
                      : failure.message,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

export const getMigrateBackupsRouteHandler: RouteHandler<typeof getMigrateBackupsRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.readBackups(), {
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
          // The database or the schema engine refused: what it said reaches the page.
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail:
                    'reason' in failure && typeof failure.reason === 'string'
                      ? failure.reason
                      : failure.message,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

export const postMigrateBackupsRouteHandler: RouteHandler<typeof postMigrateBackupsRoute> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.takeBackup(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: 'The backup could not be taken.',
                  instance: c.req.path,
                  errors: [{ field: 'backup', message }],
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
          // The database or the schema engine refused: what it said reaches the page.
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail:
                    'reason' in failure && typeof failure.reason === 'string'
                      ? failure.reason
                      : failure.message,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

export const postMigrateBackupsRestoreRouteHandler: RouteHandler<
  typeof postMigrateBackupsRestoreRoute
> = (c) =>
  RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(MigrateUseCase.restoreFromBackup(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: 'The backup could not be restored.',
                  instance: c.req.path,
                  errors: [{ field: 'name', message }],
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
          // The database or the schema engine refused: what it said reaches the page.
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable' as const,
                  title: 'Service Unavailable' as const,
                  status: 503 as const,
                  detail:
                    'reason' in failure && typeof failure.reason === 'string'
                      ? failure.reason
                      : failure.message,
                  instance: c.req.path,
                },
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )
