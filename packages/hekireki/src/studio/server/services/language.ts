import {
  format,
  lint,
  text_document_completion as textDocumentCompletion,
} from '@prisma/prisma-schema-wasm'
import { Effect } from 'effect'
import * as z from 'zod'

import { PRISMA_FILE_URI } from '../constants/index.js'
import { makeSnippetText } from '../domain/index.js'
import { FormatError } from '../errors/index.js'

// What prisma-schema-wasm hands back as JSON strings.
const FormatResult = z.array(z.tuple([z.string(), z.string()])).meta({
  description: 'The formatted documents as [uri, text] pairs',
  example: [['file:///schema.prisma', 'model User {\n  id Int @id\n}\n']],
})

const LintEntry = z
  .object({
    file_name: z.string().meta({
      description: 'The file the diagnostic belongs to.',
      example: 'prisma/schema.prisma',
    }),
    start: z.number().meta({ description: 'Start offset.', example: 19 }),
    end: z.number().meta({ description: 'End offset.', example: 23 }),
    text: z.string().meta({
      description: 'The message.',
      example:
        'Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.',
    }),
    is_warning: z
      .boolean()
      .optional()
      .meta({ description: 'Whether it is a warning rather than an error.', example: false }),
  })
  .meta({ description: 'One diagnostic as the language server reports it' })

const CompletionItem = z
  .object({
    label: z
      .string()
      .meta({ description: 'What the completion list shows.', example: 'postgresql' }),
    detail: z
      .string()
      .optional()
      .meta({ description: 'A short kind, when given.', example: 'provider' }),
    documentation: z
      .union([
        z.string(),
        z.object({
          value: z
            .string()
            .meta({ description: 'Markdown text.', example: 'The PostgreSQL provider' }),
        }),
      ])
      .optional()
      .meta({ description: 'Plain or markup documentation, when given.' }),
    insertText: z.string().optional().meta({
      description: 'The snippet to insert, when it differs from the label.',
      example: '"postgresql"',
    }),
  })
  .meta({ description: 'One completion as the language server offers it' })

// An item of another shape becomes null and is skipped.
const CompletionList = z
  .object({
    items: z
      // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
      .array(z.union([CompletionItem, z.null()]).catch(null))
      .meta({ description: 'The offered items.' }),
  })
  .meta({ description: 'The completion list as the language server returns it' })

const FormatSchemaInput = z
  .object({
    text: z
      .string()
      .meta({ description: 'The schema text.', example: 'model User {\n  id Int @id\n}\n' }),
  })
  .readonly()
  .meta({
    description: 'Schema text to format',
    example: { text: 'model User {\n  id Int @id\n}\n' },
  })

/** Formats schema text with the Prisma formatter shipped in prisma-schema-wasm. */
export function formatSchema(
  input: z.infer<typeof FormatSchemaInput>,
): Effect.Effect<string, FormatError> {
  return Effect.gen(function* () {
    const result = yield* Effect.try({
      try: () =>
        FormatResult.parse(
          JSON.parse(
            format(
              JSON.stringify([[PRISMA_FILE_URI, input.text]]),
              JSON.stringify({
                textDocument: { uri: PRISMA_FILE_URI },
                options: { tabSize: 2, insertSpaces: true },
              }),
            ),
          ),
        ),
      catch: (e) => new FormatError({ cause: e instanceof Error ? e.message : String(e) }),
    })
    const content = result[0]?.[1]
    if (content === undefined) {
      return yield* new FormatError({ cause: 'The Prisma formatter returned no document.' })
    }
    return content
  })
}

const LintSchemaInput = z
  .object({
    files: z
      .array(
        z
          .object({
            path: z
              .string()
              .meta({ description: 'The file path.', example: 'prisma/schema.prisma' }),
            content: z
              .string()
              .meta({ description: 'The file text.', example: 'model User {\n  id Int @id\n}\n' }),
          })
          .readonly(),
      )
      .readonly()
      .meta({ description: 'Every schema file, validated together.' }),
    path: z.string().meta({
      description: 'The file whose diagnostics are returned.',
      example: 'prisma/schema.prisma',
    }),
  })
  .readonly()
  .meta({ description: 'All schema files and the one whose diagnostics are wanted' })

/** Validates the files together and returns the diagnostics of one file with string offsets. */
export function lintSchema(input: z.infer<typeof LintSchemaInput>) {
  return Effect.sync(() => {
    try {
      // An entry of another shape becomes null and is skipped; the file's own diagnostics stay.
      const result = z
        // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
        .array(z.union([LintEntry, z.null()]).catch(null))
        .safeParse(JSON.parse(lint(JSON.stringify(input.files.map((f) => [f.path, f.content])))))
      if (!result.success) return []
      return result.data.flatMap((entry) =>
        entry === null || entry.file_name !== input.path
          ? []
          : [
              {
                from: entry.start,
                to: entry.end,
                message: entry.text,
                severity: entry.is_warning === true ? ('warning' as const) : ('error' as const),
              },
            ],
      )
    } catch {
      return []
    }
  })
}

const CompleteSchemaInput = z
  .object({
    text: z
      .string()
      .meta({ description: 'The schema text.', example: 'datasource db {\n  provider = \n}\n' }),
    line: z.number().int().min(0).meta({ description: '0-based line of the cursor.', example: 1 }),
    character: z
      .number()
      .int()
      .min(0)
      .meta({ description: '0-based column of the cursor.', example: 13 }),
  })
  .readonly()
  .meta({
    description: 'Schema text and a 0-based LSP position',
    example: { text: '', line: 0, character: 0 },
  })

/** Completions the Prisma language server offers at the position (referential actions, datasource keys, ...). */
export function completeSchema(input: z.infer<typeof CompleteSchemaInput>) {
  return Effect.sync(() => {
    try {
      const result = CompletionList.safeParse(
        JSON.parse(
          textDocumentCompletion(
            JSON.stringify([[PRISMA_FILE_URI, input.text]]),
            JSON.stringify({
              textDocument: { uri: PRISMA_FILE_URI },
              position: { line: input.line, character: input.character },
            }),
          ),
        ),
      )
      if (!result.success) return []
      return result.data.items.flatMap((item) =>
        item === null
          ? []
          : [
              {
                label: item.label,
                detail: item.detail ?? null,
                documentation:
                  item.documentation === undefined
                    ? null
                    : typeof item.documentation === 'string'
                      ? item.documentation
                      : item.documentation.value,
                insertText: makeSnippetText({ text: item.insertText ?? item.label }),
              },
            ],
      )
    } catch {
      return []
    }
  })
}
