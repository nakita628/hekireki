import type { RouteHandler } from '@hono/zod-openapi'
import { Effect, Match } from 'effect'

import type {
  postPrismaCodeActionsRoute,
  postPrismaCompleteRoute,
  postPrismaDefinitionRoute,
  postPrismaFormatRoute,
  postPrismaHoverRoute,
  postPrismaLintRoute,
  postPrismaReferencesRoute,
  postPrismaRenameRoute,
  postPrismaSymbolsRoute,
} from '../routes'
import * as RuntimeService from '../services/index.js'
import * as PrismaUseCase from '../usecases/index.js'

export const postPrismaFormatRouteHandler: RouteHandler<typeof postPrismaFormatRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(PrismaUseCase.formatText({ text: data.text, path: data.path }), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('FormatError', ({ cause }) =>
            Effect.succeed(
              c.json(
                {
                  type: '/problems/validation-failed' as const,
                  title: 'Validation Failed' as const,
                  status: 422 as const,
                  detail: cause,
                  instance: c.req.path,
                  errors: [{ field: 'text', message: cause }],
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

export const postPrismaLintRouteHandler: RouteHandler<typeof postPrismaLintRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(PrismaUseCase.lintText({ path: data.path, text: data.text }), {
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

export const postPrismaCompleteRouteHandler: RouteHandler<typeof postPrismaCompleteRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(
      PrismaUseCase.completeAt({
        text: data.text,
        path: data.path,
        line: data.line,
        character: data.character,
        triggerCharacter: data.triggerCharacter,
      }),
      {
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
      },
    ),
  )
}

export const postPrismaHoverRouteHandler: RouteHandler<typeof postPrismaHoverRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(
      PrismaUseCase.hoverAt({
        text: data.text,
        path: data.path,
        line: data.line,
        character: data.character,
      }),
      {
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
      },
    ),
  )
}

export const postPrismaDefinitionRouteHandler: RouteHandler<typeof postPrismaDefinitionRoute> = (
  c,
) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(
      PrismaUseCase.defineAt({
        text: data.text,
        path: data.path,
        line: data.line,
        character: data.character,
      }),
      {
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
      },
    ),
  )
}

export const postPrismaRenameRouteHandler: RouteHandler<typeof postPrismaRenameRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(
      PrismaUseCase.renameAt({
        text: data.text,
        path: data.path,
        line: data.line,
        character: data.character,
        newName: data.newName,
      }),
      {
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
      },
    ),
  )
}

export const postPrismaCodeActionsRouteHandler: RouteHandler<typeof postPrismaCodeActionsRoute> = (
  c,
) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(
      PrismaUseCase.codeActionsAt({
        text: data.text,
        path: data.path,
        range: data.range,
        diagnostics: data.diagnostics,
      }),
      {
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
      },
    ),
  )
}

export const postPrismaSymbolsRouteHandler: RouteHandler<typeof postPrismaSymbolsRoute> = (c) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(PrismaUseCase.symbolsOf({ text: data.text, path: data.path }), {
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

export const postPrismaReferencesRouteHandler: RouteHandler<typeof postPrismaReferencesRoute> = (
  c,
) => {
  const data = c.req.valid('json')
  return RuntimeService.studioRuntime().runPromise(
    Effect.matchEffect(
      PrismaUseCase.referencesAt({
        text: data.text,
        path: data.path,
        line: data.line,
        character: data.character,
      }),
      {
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
      },
    ),
  )
}
