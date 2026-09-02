import { Effect } from 'effect'
import * as z from 'zod'

import { ContractViolationError } from '../errors/index.js'
import { CompletionsSchema, DiagnosticsSchema, FormattedSchema } from '../routes/index.js'
import { completeSchema, formatSchema, lintSchema, StudioStateTag } from '../services/index.js'

const FormatInput = z
  .object({
    text: z.string().brand<'SchemaText'>().meta({
      description: 'The schema text as typed.',
      example: 'model User {\n  id Int @id\n}\n',
    }),
  })
  .readonly()
  .meta({
    description: 'Input for formatting',
    example: { text: 'model User {\n  id Int @id\n}\n' },
  })

/**
 * Formats schema text with the Prisma formatter.
 *
 * @param input - the text
 * @returns the formatted text
 */
export function formatText(input: z.infer<typeof FormatInput>) {
  return Effect.gen(function* () {
    const text = yield* formatSchema({ text: input.text })
    const result = FormattedSchema.safeParse({ text })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

const LintInput = z
  .object({
    path: z.string().min(1).brand<'SchemaFilePath'>().meta({
      description: 'The file path exactly as Studio loaded it.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .brand<'SchemaText'>()
      .meta({ description: 'The text being edited.', example: 'model User {\n  id Nope @id\n}\n' }),
  })
  .readonly()
  .meta({
    description: 'Input for linting',
    example: { path: 'prisma/schema.prisma', text: 'model User {\n  id Nope @id\n}\n' },
  })

/**
 * Diagnostics for the text being edited, validated together with the other loaded files.
 *
 * @param input - the file being edited and its current text
 * @returns diagnostics with string offsets
 */
export function lintText(input: z.infer<typeof LintInput>) {
  return Effect.gen(function* () {
    const state = yield* StudioStateTag
    const files = state.snapshot().files
    const merged = files.some((f) => f.path === input.path)
      ? files.map((f) => (f.path === input.path ? { path: input.path, content: input.text } : f))
      : [...files, { path: input.path, content: input.text }]
    const diagnostics = yield* lintSchema({ files: merged, path: input.path })
    const result = DiagnosticsSchema.safeParse({ diagnostics })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

const CompleteInput = z
  .object({
    text: z
      .string()
      .brand<'SchemaText'>()
      .meta({ description: 'The schema text.', example: 'datasource db {\n  provider = \n}\n' }),
    line: z
      .number()
      .int()
      .min(0)
      .brand<'Line'>()
      .meta({ description: '0-based line of the cursor.', example: 1 }),
    character: z
      .number()
      .int()
      .min(0)
      .brand<'Character'>()
      .meta({ description: '0-based column of the cursor.', example: 13 }),
  })
  .readonly()
  .meta({ description: 'Input for completions', example: { text: '', line: 0, character: 0 } })

/**
 * Completions the Prisma language server offers at the position.
 *
 * @param input - the text and the position
 * @returns completion items
 */
export function completeAt(input: z.infer<typeof CompleteInput>) {
  return Effect.gen(function* () {
    const items = yield* completeSchema(input)
    const result = CompletionsSchema.safeParse({ items })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}
