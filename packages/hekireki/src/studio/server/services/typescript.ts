import path from 'node:path'

import { Effect, Semaphore } from 'effect'
import * as z from 'zod'

import { clientSource } from '../../../seed/discover.js'
import { parseSchema } from '../../../seed/schema.js'
import type { SchemaFile } from '../../../seed/schema.js'
import { ClientUnavailableError } from '../errors/index.js'
import * as TypescriptHostService from './typescript-host.js'
import * as TypescriptLoadService from './typescript-load.js'

const CreateTypeCheckerInput = z
  .object({
    schemaDir: z.string().meta({
      description: 'Where the generator output resolves from.',
      example: '/app/prisma',
    }),
    cwd: z.string().meta({
      description: 'Where typescript and @prisma/client are resolved from.',
      example: '/app',
    }),
  })
  .readonly()
  .meta({ description: 'The project whose Prisma Client types the editor completes against' })

/**
 * A TypeScript language service over the project, loaded the first time it is asked for: the
 * project's own `typescript` checks a query file that sits beside the generated client and
 * declares `prisma` as its `PrismaClient`. Module resolution, the tsconfig-free compiler
 * options aside, is TypeScript's own over the project's files, so `prisma generate` is picked
 * up by the next request. The query text is swapped in before every question.
 */
export function createTypeChecker(input: z.infer<typeof CreateTypeCheckerInput>) {
  const lock = Semaphore.makeUnsafe(1)
  const holder: {
    loaded: {
      readonly files: readonly SchemaFile[]
      readonly checker: ReturnType<typeof TypescriptHostService.makeChecker>
    } | null
  } = { loaded: null }

  function load(files: readonly SchemaFile[]) {
    return Effect.gen(function* () {
      if (holder.loaded?.files === files) return holder.loaded.checker
      const schema = yield* parseSchema(files).pipe(
        Effect.mapError((error) => new ClientUnavailableError({ reason: error.message })),
      )
      const { source, reason } = clientSource(schema.generators)
      if (source === null) {
        return yield* new ClientUnavailableError({
          reason: `Prisma Client not found: ${reason ?? 'unknown'}.\n   Add a \`prisma-client\` generator to the schema and run \`prisma generate\`.`,
        })
      }
      const typescript = yield* TypescriptLoadService.loadTypeScript(input.cwd)
      const legacy = source === '@prisma/client'
      const dir = legacy ? input.cwd : path.resolve(input.schemaDir, source)
      if (!legacy && !typescript.sys.fileExists(path.join(dir, 'client.ts'))) {
        return yield* new ClientUnavailableError({
          reason: `No client.ts in ${dir}: run \`prisma generate\` so the client is written there.`,
        })
      }
      const checker = TypescriptHostService.makeChecker({
        ts: typescript,
        dir,
        entry: legacy ? source : './client',
        cwd: input.cwd,
      })
      // oxlint-disable-next-line custom/no-mutation -- the service is built once per schema snapshot and kept
      holder.loaded = { files, checker }
      return checker
    }).pipe(Semaphore.withPermit(lock))
  }

  /**
   * Puts the text in place and asks the service about it in one synchronous step: of two
   * requests that arrive together (completion and signature help on the same keystroke), neither
   * can swap its text in between the other's edit and question.
   */
  function ask<T>(
    files: readonly SchemaFile[],
    text: string,
    offset: number,
    question: (
      context: ReturnType<typeof TypescriptHostService.makeChecker> & {
        readonly base: number
        readonly position: number
      },
    ) => T,
  ) {
    return Effect.gen(function* () {
      const loaded = yield* load(files)
      return yield* Effect.sync(() => {
        if (loaded.cell.text !== text) {
          // oxlint-disable-next-line custom/no-mutation -- the edited document is the one mutable cell of the service
          loaded.cell.text = text
          // oxlint-disable-next-line custom/no-mutation -- the version is what tells the service the text changed
          loaded.cell.version += 1
        }
        const base = loaded.preamble.length
        return question({
          ...loaded,
          base,
          position: base + Math.max(0, Math.min(offset, text.length)),
        })
      })
    })
  }

  return {
    /**
     * The version of the TypeScript the service runs on, or why there is no service.
     *
     * @param files - the schema files
     * @returns the version and the reason
     */
    status(files: readonly SchemaFile[]) {
      return load(files).pipe(
        Effect.match({
          onFailure: (error) => ({ typescript: null, typesError: error.reason }),
          onSuccess: (loaded) => ({ typescript: loaded.ts.version, typesError: null }),
        }),
      )
    },
    /**
     * The completions at the offset.
     *
     * @param files - the schema files
     * @param text - the query
     * @param offset - where the cursor is
     * @returns the items TypeScript lists
     */
    complete(files: readonly SchemaFile[], text: string, offset: number) {
      return ask(files, text, offset, ({ service, file, position }) => {
        const found = service.getCompletionsAtPosition(file, position, {
          includeCompletionsWithInsertText: true,
          includeCompletionsForModuleExports: false,
        })
        return (found?.entries ?? []).map((entry) => ({
          label: entry.name,
          kind: entry.kind,
          sortText: entry.sortText,
          insertText: entry.insertText ?? null,
        }))
      })
    },
    /**
     * The type and documentation of one completion.
     *
     * @param files - the schema files
     * @param text - the query
     * @param offset - where the cursor is
     * @param name - the item
     * @returns the signature and the doc comment
     */
    detail(files: readonly SchemaFile[], text: string, offset: number, name: string) {
      return ask(files, text, offset, ({ ts: typescript, service, file, position }) => {
        const found = service.getCompletionEntryDetails(
          file,
          position,
          name,
          undefined,
          undefined,
          undefined,
          undefined,
        )
        if (found === undefined) return { detail: null, documentation: null }
        const documentation = typescript.displayPartsToString(found.documentation)
        return {
          detail: typescript.displayPartsToString(found.displayParts) || null,
          documentation: documentation === '' ? null : documentation,
        }
      })
    },
    /**
     * What TypeScript says about the symbol at the offset.
     *
     * @param files - the schema files
     * @param text - the query
     * @param offset - where the pointer is
     * @returns the type and documentation as Markdown, and the symbol's range
     */
    hover(files: readonly SchemaFile[], text: string, offset: number) {
      return ask(files, text, offset, ({ ts: typescript, service, file, position, base }) => {
        const info = service.getQuickInfoAtPosition(file, position)
        if (info === undefined || info.textSpan.start < base) {
          return { contents: null, range: null }
        }
        const signature = typescript.displayPartsToString(info.displayParts)
        const documentation = typescript.displayPartsToString(info.documentation)
        return {
          contents: [
            `\`\`\`typescript\n${signature}\n\`\`\``,
            ...(documentation === '' ? [] : [documentation]),
          ].join('\n\n'),
          range: {
            start: info.textSpan.start - base,
            end: info.textSpan.start + info.textSpan.length - base,
          },
        }
      })
    },
    /**
     * The signatures of the call the offset is inside.
     *
     * @param files - the schema files
     * @param text - the query
     * @param offset - where the cursor is
     * @returns the overloads and which one and which parameter is active
     */
    signature(files: readonly SchemaFile[], text: string, offset: number) {
      return ask(files, text, offset, ({ ts: typescript, service, file, position }) => {
        const help = service.getSignatureHelpItems(file, position, undefined)
        if (help === undefined) return { signatures: [], activeSignature: 0, activeParameter: 0 }
        return {
          signatures: help.items.map((item) => {
            const parameters = item.parameters.map((parameter) => ({
              label: typescript.displayPartsToString(parameter.displayParts),
              documentation: typescript.displayPartsToString(parameter.documentation) || null,
            }))
            return {
              label: `${typescript.displayPartsToString(item.prefixDisplayParts)}${parameters
                .map((parameter) => parameter.label)
                .join(
                  typescript.displayPartsToString(item.separatorDisplayParts),
                )}${typescript.displayPartsToString(item.suffixDisplayParts)}`,
              documentation: typescript.displayPartsToString(item.documentation) || null,
              parameters,
            }
          }),
          activeSignature: help.selectedItemIndex,
          activeParameter: help.argumentIndex,
        }
      })
    },
    /**
     * What TypeScript finds wrong with the query.
     *
     * @param files - the schema files
     * @param text - the query
     * @returns the problems in the query text, in order of position
     */
    check(files: readonly SchemaFile[], text: string) {
      return ask(files, text, 0, ({ ts: typescript, service, file, base }) => {
        const found = [
          ...service.getSyntacticDiagnostics(file),
          ...service.getSemanticDiagnostics(file),
        ]
        return found
          .flatMap((diagnostic) => {
            const start = diagnostic.start
            if (start === undefined || start < base) return []
            const severity =
              diagnostic.category === typescript.DiagnosticCategory.Error
                ? ('error' as const)
                : diagnostic.category === typescript.DiagnosticCategory.Warning
                  ? ('warning' as const)
                  : ('info' as const)
            return [
              {
                message: typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
                severity,
                range: { start: start - base, end: start + (diagnostic.length ?? 0) - base },
              },
            ]
          })
          .toSorted((a, b) => a.range.start - b.range.start)
      })
    },
  }
}
