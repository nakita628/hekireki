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
import * as PrismaUseCase from '../usecases/index.js'

/**
 * `POST /prisma/format` handler. The edits that lay the text out as the Prisma formatter does.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   C->>H: POST /prisma/format
 *   H->>U: formatText()
 *   U-->>H: Formatted
 *   H-->>C: 200 Formatted
 *   Note over H: on failure, Match.tag: FormatError -> 422 / ContractViolationError -> 500
 * ```
 */
export const postPrismaFormatRouteHandler: RouteHandler<typeof postPrismaFormatRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
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

/**
 * `POST /prisma/lint` handler. Validate the buffer together with the other loaded files and return
 * its diagnostics.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   C->>H: POST /prisma/lint
 *   H->>U: lintText()
 *   U-->>H: Diagnostics
 *   H-->>C: 200 Diagnostics
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const postPrismaLintRouteHandler: RouteHandler<typeof postPrismaLintRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
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

/**
 * `POST /prisma/complete` handler. Completions the Prisma language server offers at a cursor
 * position.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   C->>H: POST /prisma/complete
 *   H->>U: completeAt()
 *   U-->>H: Completions
 *   H-->>C: 200 Completions
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const postPrismaCompleteRouteHandler: RouteHandler<typeof postPrismaCompleteRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
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

/**
 * `POST /prisma/hover` handler. What the Prisma language server says about the symbol at a cursor
 * position.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   C->>H: POST /prisma/hover
 *   H->>U: hoverAt()
 *   U-->>H: Hover
 *   H-->>C: 200 Hover
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const postPrismaHoverRouteHandler: RouteHandler<typeof postPrismaHoverRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
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

/**
 * `POST /prisma/definition` handler. Where the model, enum or type referenced at a cursor position
 * is declared.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   C->>H: POST /prisma/definition
 *   H->>U: defineAt()
 *   U-->>H: Definition
 *   H-->>C: 200 Definition
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const postPrismaDefinitionRouteHandler: RouteHandler<typeof postPrismaDefinitionRoute> = (
  c,
) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
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

/**
 * `POST /prisma/rename` handler. The edits that rename the model or enum at a cursor position
 * everywhere it is used.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   C->>H: POST /prisma/rename
 *   H->>U: renameAt()
 *   U-->>H: Rename
 *   H-->>C: 200 Rename
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const postPrismaRenameRouteHandler: RouteHandler<typeof postPrismaRenameRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
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

/**
 * `POST /prisma/code-actions` handler. The quick fixes the Prisma language server offers for the
 * diagnostics in a range.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   C->>H: POST /prisma/code-actions
 *   H->>U: codeActionsAt()
 *   U-->>H: CodeActions
 *   H-->>C: 200 CodeActions
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const postPrismaCodeActionsRouteHandler: RouteHandler<typeof postPrismaCodeActionsRoute> = (
  c,
) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
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

/**
 * `POST /prisma/symbols` handler. The blocks of the text, as the language server's document outline
 * lists them.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   C->>H: POST /prisma/symbols
 *   H->>U: symbolsOf()
 *   U-->>H: Symbols
 *   H-->>C: 200 Symbols
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const postPrismaSymbolsRouteHandler: RouteHandler<typeof postPrismaSymbolsRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
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

/**
 * `POST /prisma/references` handler. Every place the symbol at a cursor position is used, across
 * the loaded files.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   C->>H: POST /prisma/references
 *   H->>U: referencesAt()
 *   U-->>H: References
 *   H-->>C: 200 References
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * ```
 */
export const postPrismaReferencesRouteHandler: RouteHandler<typeof postPrismaReferencesRoute> = (
  c,
) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
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
