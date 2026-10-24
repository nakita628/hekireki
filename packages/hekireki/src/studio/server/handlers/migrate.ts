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
import * as MigrateUseCase from '../usecases/index.js'

/**
 * `GET /migrate` handler. The migration history of the database against the migrations directory,
 * and whether the database has drifted from the schema. Reads only.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: GET /migrate
 *   H->>U: readMigrateStatus()
 *   U-->>H: MigrateStatus
 *   H-->>C: 200 MigrateStatus
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 503 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const getMigrateRouteHandler: RouteHandler<typeof getMigrateRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.readMigrateStatus(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
                  instance: c.req.path,
                } as const,
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
 * `GET /migrate/diff` handler. The migration that would take the database to the schema, as Prisma
 * Migrate would write it. Reads the database; writes nothing to it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: GET /migrate/diff
 *   H->>U: readMigrateDiff()
 *   U-->>H: MigrateDiff
 *   H-->>C: 200 MigrateDiff
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 503 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const getMigrateDiffRouteHandler: RouteHandler<typeof getMigrateDiffRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.readMigrateDiff(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
                  instance: c.req.path,
                } as const,
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
 * `POST /migrate/plan` handler. The migration laid out as steps that can be run one at a time, the
 * statements that change rows before the ones that change the schema.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: POST /migrate/plan
 *   H->>U: planMigration()
 *   U-->>H: MigratePlan
 *   H-->>C: 200 MigratePlan
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 422 / MigrateDatabaseError -> 503 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postMigratePlanRouteHandler: RouteHandler<typeof postMigratePlanRoute> = (c) =>
  Effect.runPromise(
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
                  type: '/problems/validation-failed',
                  title: 'Validation Failed',
                  status: 422,
                  detail: 'The migration could not be planned.',
                  instance: c.req.path,
                  errors: [{ field: 'config', message }],
                } as const,
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('MigrateDatabaseError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
                  instance: c.req.path,
                } as const,
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
 * `POST /migrate/apply` handler. Runs the statements one at a time and stops at the first the
 * database refuses. What ran stays run: none of the three databases undoes a DDL statement already
 * done.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: POST /migrate/apply
 *   H->>U: applyMigrationStatements()
 *   U-->>H: ApplyResult
 *   H-->>C: 200 ApplyResult
 *   Note over H: on failure, Match.tag: DatabaseUnavailableError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postMigrateApplyRouteHandler: RouteHandler<typeof postMigrateApplyRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.applyMigrationStatements(c.req.valid('json')), {
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
 * `POST /migrate/migrations` handler. Writes a migration.sql to the migrations directory, so Prisma
 * Migrate owns it from now on.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: POST /migrate/migrations
 *   H->>U: createMigration()
 *   U-->>H: CreatedMigration
 *   H-->>C: 200 CreatedMigration
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 503 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postMigrateMigrationsRouteHandler: RouteHandler<typeof postMigrateMigrationsRoute> = (
  c,
) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.createMigration(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
                  instance: c.req.path,
                } as const,
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed',
                  title: 'Validation Failed',
                  status: 422,
                  detail: 'The migration could not be written.',
                  instance: c.req.path,
                  errors: [{ field: 'name', message: String(failure) }],
                } as const,
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

/**
 * `POST /migrate/migrations/applied` handler. Records a migration as applied without running it,
 * for one whose statements were run a step at a time. The database must have been migrated at least
 * once.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: POST /migrate/migrations/applied
 *   H->>U: recordMigrationApplied()
 *   U-->>H: MigrateStatus
 *   H-->>C: 200 MigrateStatus
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 503 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postMigrateMigrationsAppliedRouteHandler: RouteHandler<
  typeof postMigrateMigrationsAppliedRoute
> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.recordMigrationApplied(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
                  instance: c.req.path,
                } as const,
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
 * `POST /migrate/migrations/rolled-back` handler. Records a migration as rolled back, for one that
 * failed and left the database as it was. It stops counting as failed, which a database has to have
 * before anything else reaches it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: POST /migrate/migrations/rolled-back
 *   H->>U: recordMigrationRolledBack()
 *   U-->>H: MigrateStatus
 *   H-->>C: 200 MigrateStatus
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 503 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postMigrateMigrationsRolledBackRouteHandler: RouteHandler<
  typeof postMigrateMigrationsRolledBackRoute
> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.recordMigrationRolledBack(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
                  instance: c.req.path,
                } as const,
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
 * `POST /migrate/deploy` handler. Applies every migration the database has not run yet, as `prisma
 * migrate deploy` does.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: POST /migrate/deploy
 *   H->>U: deployMigrations()
 *   U-->>H: Deployed
 *   H-->>C: 200 Deployed
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 503 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postMigrateDeployRouteHandler: RouteHandler<typeof postMigrateDeployRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.deployMigrations(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
                  instance: c.req.path,
                } as const,
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
 * `GET /migrate/decisions` handler. What has been decided on the page about the checks, as Studio
 * kept it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: GET /migrate/decisions
 *   H->>U: readMigrationDecisions()
 *   U-->>H: MigrationDecisions
 *   H-->>C: 200 MigrationDecisions
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 503 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const getMigrateDecisionsRouteHandler: RouteHandler<typeof getMigrateDecisionsRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.readMigrationDecisions(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
                  instance: c.req.path,
                } as const,
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
 * `PUT /migrate/decisions` handler. Keeps the decisions, so the same plan is made the next time the
 * page is opened, and by `hekireki migrate check` and `hekireki migrate plan` from the command
 * line.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: PUT /migrate/decisions
 *   H->>U: writeMigrationDecisions()
 *   U-->>H: MigrationDecisions
 *   H-->>C: 200 MigrationDecisions
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 503 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const putMigrateDecisionsRouteHandler: RouteHandler<typeof putMigrateDecisionsRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.writeMigrationDecisions(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
                  instance: c.req.path,
                } as const,
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed',
                  title: 'Validation Failed',
                  status: 422,
                  detail: 'The decisions could not be kept.',
                  instance: c.req.path,
                  errors: [{ field: 'decisions', message: String(failure) }],
                } as const,
                422,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

/**
 * `GET /migrate/baseline` handler. Which migrations the database already matches, for a database
 * with tables and no history: each migration and those before it replayed into a shadow database
 * and compared with it. Reads the database; writes nothing to it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: GET /migrate/baseline
 *   H->>U: readMigrateBaseline()
 *   U-->>H: MigrateBaseline
 *   H-->>C: 200 MigrateBaseline
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 503 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const getMigrateBaselineRouteHandler: RouteHandler<typeof getMigrateBaselineRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.readMigrateBaseline(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
                  instance: c.req.path,
                } as const,
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
 * `POST /migrate/baseline` handler. Baselines the database: records the migration named and every
 * one before it as applied, without running them. Refused when the database does not match them.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: POST /migrate/baseline
 *   H->>U: baselineDatabase()
 *   U-->>H: MigrateStatus
 *   H-->>C: 200 MigrateStatus
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 422 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const postMigrateBaselineRouteHandler: RouteHandler<typeof postMigrateBaselineRoute> = (c) =>
  Effect.runPromise(
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
                  type: '/problems/validation-failed',
                  title: 'Validation Failed',
                  status: 422,
                  detail: 'The database could not be baselined.',
                  instance: c.req.path,
                  errors: [{ field: 'name', message }],
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
 * `GET /migrate/migrations/{migrationName}` handler. The migration.sql of one migration of the
 * directory; 404 when the directory holds none of that name.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: GET /migrate/migrations/{migrationName}
 *   H->>U: readMigrationFile()
 *   U-->>H: MigrationFile
 *   H-->>C: 200 MigrationFile
 *   Note over H: on failure, Match.tag: MigrationNotFoundError -> 404 / MigrateConfigError -> 503 / DatabaseUnavailableError -> 503 / MigrateEngineError -> 503 / ContractViolationError -> 500
 * ```
 */
export const getMigrateMigrationsMigrationNameRouteHandler: RouteHandler<
  typeof getMigrateMigrationsMigrationNameRoute
> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.readMigrationFile(c.req.valid('param')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrationNotFoundError', ({ name, baseDir }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/not-found',
                  title: 'Not Found',
                  status: 404,
                  detail: `There is no migration ${name} in ${baseDir}.`,
                  instance: c.req.path,
                } as const,
                404,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
                  instance: c.req.path,
                } as const,
                503,
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
          Match.tag('MigrateEngineError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail: message,
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
 * `POST /migrate/rehearse` handler. The migration run for real and taken back, to see before it
 * runs whether it goes through, what it does to the rows of each table, and whether the database
 * then matches the schema.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: POST /migrate/rehearse
 *   H->>U: rehearse()
 *   U-->>H: Rehearsal
 *   H-->>C: 200 Rehearsal
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const postMigrateRehearseRouteHandler: RouteHandler<typeof postMigrateRehearseRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.rehearse(c.req.valid('json')), {
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
          // The database or the schema engine refused: what it said reaches the page.
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail:
                    'reason' in failure && typeof failure.reason === 'string'
                      ? failure.reason
                      : failure.message,
                  instance: c.req.path,
                } as const,
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

/**
 * `GET /migrate/tables` handler. The rows of every table of the database now, to compare a run
 * with.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: GET /migrate/tables
 *   H->>U: readTableCounts()
 *   U-->>H: TableCounts
 *   H-->>C: 200 TableCounts
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const getMigrateTablesRouteHandler: RouteHandler<typeof getMigrateTablesRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.readTableCounts(), {
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
          // The database or the schema engine refused: what it said reaches the page.
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail:
                    'reason' in failure && typeof failure.reason === 'string'
                      ? failure.reason
                      : failure.message,
                  instance: c.req.path,
                } as const,
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

/**
 * `GET /migrate/backups` handler. The backups taken before migrations, newest first.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: GET /migrate/backups
 *   H->>U: readBackups()
 *   U-->>H: Backups
 *   H-->>C: 200 Backups
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const getMigrateBackupsRouteHandler: RouteHandler<typeof getMigrateBackupsRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.readBackups(), {
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
          // The database or the schema engine refused: what it said reaches the page.
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail:
                    'reason' in failure && typeof failure.reason === 'string'
                      ? failure.reason
                      : failure.message,
                  instance: c.req.path,
                } as const,
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

/**
 * `POST /migrate/backups` handler. Takes a backup of the database as it is now.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: POST /migrate/backups
 *   H->>U: takeBackup()
 *   U-->>H: Backup
 *   H-->>C: 200 Backup
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 422 / ContractViolationError -> 500
 * ```
 */
export const postMigrateBackupsRouteHandler: RouteHandler<typeof postMigrateBackupsRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.takeBackup(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed',
                  title: 'Validation Failed',
                  status: 422,
                  detail: 'The backup could not be taken.',
                  instance: c.req.path,
                  errors: [{ field: 'backup', message }],
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
          // The database or the schema engine refused: what it said reaches the page.
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail:
                    'reason' in failure && typeof failure.reason === 'string'
                      ? failure.reason
                      : failure.message,
                  instance: c.req.path,
                } as const,
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )

/**
 * `POST /migrate/backups/restore` handler. Puts the database back as a backup has it (SQLite), and
 * removes from the directory the migration the run it undoes wrote.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as MigrateUseCase
 *   C->>H: POST /migrate/backups/restore
 *   H->>U: restoreFromBackup()
 *   U-->>H: MigrateStatus
 *   H-->>C: 200 MigrateStatus
 *   Note over H: on failure, Match.tag: MigrateConfigError -> 422 / ContractViolationError -> 500
 * ```
 */
export const postMigrateBackupsRestoreRouteHandler: RouteHandler<
  typeof postMigrateBackupsRestoreRoute
> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(MigrateUseCase.restoreFromBackup(c.req.valid('json')), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('MigrateConfigError', ({ message }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed',
                  title: 'Validation Failed',
                  status: 422,
                  detail: 'The backup could not be restored.',
                  instance: c.req.path,
                  errors: [{ field: 'name', message }],
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
          // The database or the schema engine refused: what it said reaches the page.
          Match.orElse((failure) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/service-unavailable',
                  title: 'Service Unavailable',
                  status: 503,
                  detail:
                    'reason' in failure && typeof failure.reason === 'string'
                      ? failure.reason
                      : failure.message,
                  instance: c.req.path,
                } as const,
                503,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
        ),
    }),
  )
