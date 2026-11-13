import { Effect } from 'effect'
import * as z from 'zod'

import * as StudioService from '../services/index.js'
import * as LanguageService from '../services/index.js'

const WorkspaceOfInput = z
  .object({
    text: z
      .string()
      .brand<'SchemaText'>()
      .meta({ description: 'The schema text.', example: 'datasource db {\n  provider = \n}\n' }),
    path: z.string().min(1).optional().meta({
      description:
        'The file the text belongs to, as Studio loaded it; the first file when omitted.',
      example: 'prisma/schema.prisma',
    }),
  })
  .readonly()
  .meta({ description: 'Input for a request about a text', example: { text: '' } })

// The edited file is the one named, else the first loaded file, else a lone in-memory document.
function workspaceOf(input: z.infer<typeof WorkspaceOfInput>) {
  return Effect.sync(() => {
    const state = StudioService.studio().state
    const files = state.snapshot().files
    const path = input.path ?? files[0]?.path ?? null
    return { files, path, text: input.text }
  })
}

const FormatTextInput = z
  .object({
    text: z
      .string()
      .brand<'SchemaText'>()
      .meta({ description: 'The schema text.', example: 'datasource db {\n  provider = \n}\n' }),
    path: z.string().min(1).optional().meta({
      description:
        'The file the text belongs to, as Studio loaded it; the first file when omitted.',
      example: 'prisma/schema.prisma',
    }),
  })
  .readonly()
  .meta({ description: 'Input for a request about a text', example: { text: '' } })

/**
 * The edits that lay the text out as the Prisma formatter does, together with the other loaded
 * files so relations across files are completed too.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   participant S as StudioService
 *   participant L as LanguageService
 *   H->>U: formatText({ text, path })
 *   U->>S: studio().state
 *   S-->>U: snapshot files
 *   Note over U: the named file, else the first loaded one, with the text in its place
 *   U->>L: formatSchema({ files, path, text })
 *   alt FormatError
 *     U-->>H: the failure
 *   else edits
 *     L-->>U: edits
 *     U-->>H: edits
 *   end
 * ```
 *
 * @param input - the text and its file
 * @returns the edits
 */
export function formatText(input: z.infer<typeof FormatTextInput>) {
  return Effect.gen(function* () {
    const workspace = yield* workspaceOf(input)
    const edits = yield* LanguageService.formatSchema(workspace)
    return { edits }
  })
}

const LintTextInput = z
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
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   participant S as StudioService
 *   participant L as LanguageService
 *   H->>U: lintText({ path, text })
 *   U->>S: studio().state
 *   S-->>U: snapshot files
 *   U->>L: lintSchema({ files, path, text })
 *   alt the language server throws
 *     Note over L: logged, and answered with no diagnostics
 *   end
 *   L-->>U: diagnostics of the file
 *   U-->>H: diagnostics
 * ```
 *
 * @param input - the file being edited and its current text
 * @returns the diagnostics as the language server places them
 */
export function lintText(input: z.infer<typeof LintTextInput>) {
  return Effect.gen(function* () {
    const state = StudioService.studio().state
    const diagnostics = yield* LanguageService.lintSchema({
      files: state.snapshot().files,
      path: input.path,
      text: input.text,
    })
    return { diagnostics }
  })
}

const SymbolsOfInput = z
  .object({
    text: z
      .string()
      .brand<'SchemaText'>()
      .meta({ description: 'The schema text.', example: 'datasource db {\n  provider = \n}\n' }),
    path: z.string().min(1).optional().meta({
      description:
        'The file the text belongs to, as Studio loaded it; the first file when omitted.',
      example: 'prisma/schema.prisma',
    }),
  })
  .readonly()
  .meta({ description: 'Input for a request about a text', example: { text: '' } })

/**
 * The blocks of the text as the language server's document outline lists them.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   participant S as StudioService
 *   participant L as LanguageService
 *   H->>U: symbolsOf({ text, path })
 *   U->>S: studio().state
 *   S-->>U: snapshot files
 *   Note over U: the named file, else the first loaded one, with the text in its place
 *   U->>L: symbolsOfSchema({ files, path, text })
 *   alt the language server throws
 *     Note over L: logged, and answered with nothing
 *   end
 *   L-->>U: symbols
 *   U-->>H: symbols
 * ```
 *
 * @param input - the text and its file
 * @returns the symbols
 */
export function symbolsOf(input: z.infer<typeof SymbolsOfInput>) {
  return Effect.gen(function* () {
    const workspace = yield* workspaceOf(input)
    const symbols = yield* LanguageService.symbolsOfSchema(workspace)
    return { symbols }
  })
}

const CompleteAtInput = z
  .object({
    text: z
      .string()
      .brand<'SchemaText'>()
      .meta({ description: 'The schema text.', example: 'datasource db {\n  provider = \n}\n' }),
    path: z.string().min(1).optional().meta({
      description:
        'The file the text belongs to, as Studio loaded it; the first file when omitted.',
      example: 'prisma/schema.prisma',
    }),
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
    triggerCharacter: z.string().optional().meta({
      description: 'The character that opened the list, when one did rather than typing.',
      example: '@',
    }),
  })
  .readonly()
  .meta({
    description: 'Input for a completion request',
    example: { text: '', line: 0, character: 0, triggerCharacter: '@' },
  })

/**
 * Completions the Prisma language server offers at the position.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   participant S as StudioService
 *   participant L as LanguageService
 *   H->>U: completeAt({ text, path, line, character, triggerCharacter })
 *   U->>S: studio().state
 *   S-->>U: snapshot files
 *   Note over U: the named file, else the first loaded one, with the text in its place
 *   U->>L: completeSchema({ ...workspace, line, character, triggerCharacter })
 *   alt the language server throws
 *     Note over L: logged, and answered with nothing
 *   end
 *   L-->>U: items
 *   U-->>H: items
 * ```
 *
 * @param input - the text, the position and what opened the list
 * @returns completion items
 */
export function completeAt(input: z.infer<typeof CompleteAtInput>) {
  return Effect.gen(function* () {
    const workspace = yield* workspaceOf(input)
    const items = yield* LanguageService.completeSchema({
      ...workspace,
      line: input.line,
      character: input.character,
      triggerCharacter: input.triggerCharacter ?? null,
    })
    return { items }
  })
}

const HoverAtInput = z
  .object({
    text: z
      .string()
      .brand<'SchemaText'>()
      .meta({ description: 'The schema text.', example: 'datasource db {\n  provider = \n}\n' }),
    path: z.string().min(1).optional().meta({
      description:
        'The file the text belongs to, as Studio loaded it; the first file when omitted.',
      example: 'prisma/schema.prisma',
    }),
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
  .meta({
    description: 'Input for a request at a position',
    example: { text: '', line: 0, character: 0 },
  })

/**
 * What the Prisma language server says about the symbol at the position.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   participant S as StudioService
 *   participant L as LanguageService
 *   H->>U: hoverAt({ text, path, line, character })
 *   U->>S: studio().state
 *   S-->>U: snapshot files
 *   Note over U: the named file, else the first loaded one, with the text in its place
 *   U->>L: hoverSchema({ ...workspace, line, character })
 *   alt the language server throws
 *     Note over L: logged, and answered with nothing
 *   end
 *   L-->>U: hover contents and range
 *   U-->>H: hover contents and range
 * ```
 *
 * @param input - the text and the position
 * @returns the hover contents and range
 */
export function hoverAt(input: z.infer<typeof HoverAtInput>) {
  return Effect.gen(function* () {
    const workspace = yield* workspaceOf(input)
    const hover = yield* LanguageService.hoverSchema({
      ...workspace,
      line: input.line,
      character: input.character,
    })
    return hover
  })
}

const DefineAtInput = z
  .object({
    text: z
      .string()
      .brand<'SchemaText'>()
      .meta({ description: 'The schema text.', example: 'datasource db {\n  provider = \n}\n' }),
    path: z.string().min(1).optional().meta({
      description:
        'The file the text belongs to, as Studio loaded it; the first file when omitted.',
      example: 'prisma/schema.prisma',
    }),
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
  .meta({
    description: 'Input for a request at a position',
    example: { text: '', line: 0, character: 0 },
  })

/**
 * Where the model, enum or type referenced at the position is declared.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   participant S as StudioService
 *   participant L as LanguageService
 *   H->>U: defineAt({ text, path, line, character })
 *   U->>S: studio().state
 *   S-->>U: snapshot files
 *   Note over U: the named file, else the first loaded one, with the text in its place
 *   U->>L: defineSchema({ ...workspace, line, character })
 *   alt the language server throws
 *     Note over L: logged, and answered with nothing
 *   end
 *   L-->>U: locations
 *   U-->>H: locations
 * ```
 *
 * @param input - the text and the position
 * @returns the declaration locations
 */
export function defineAt(input: z.infer<typeof DefineAtInput>) {
  return Effect.gen(function* () {
    const workspace = yield* workspaceOf(input)
    const locations = yield* LanguageService.defineSchema({
      ...workspace,
      line: input.line,
      character: input.character,
    })
    return { locations }
  })
}

const ReferencesAtInput = z
  .object({
    text: z
      .string()
      .brand<'SchemaText'>()
      .meta({ description: 'The schema text.', example: 'datasource db {\n  provider = \n}\n' }),
    path: z.string().min(1).optional().meta({
      description:
        'The file the text belongs to, as Studio loaded it; the first file when omitted.',
      example: 'prisma/schema.prisma',
    }),
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
  .meta({
    description: 'Input for a request at a position',
    example: { text: '', line: 0, character: 0 },
  })

/**
 * Every place the symbol at the position is used, across the loaded files.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   participant S as StudioService
 *   participant L as LanguageService
 *   H->>U: referencesAt({ text, path, line, character })
 *   U->>S: studio().state
 *   S-->>U: snapshot files
 *   Note over U: the named file, else the first loaded one, with the text in its place
 *   U->>L: referencesSchema({ ...workspace, line, character })
 *   alt the language server throws
 *     Note over L: logged, and answered with nothing
 *   end
 *   L-->>U: locations
 *   U-->>H: locations
 * ```
 *
 * @param input - the text and the position
 * @returns the reference locations
 */
export function referencesAt(input: z.infer<typeof ReferencesAtInput>) {
  return Effect.gen(function* () {
    const workspace = yield* workspaceOf(input)
    const locations = yield* LanguageService.referencesSchema({
      ...workspace,
      line: input.line,
      character: input.character,
    })
    return { locations }
  })
}

const RenameAtInput = z
  .object({
    text: z
      .string()
      .brand<'SchemaText'>()
      .meta({ description: 'The schema text.', example: 'datasource db {\n  provider = \n}\n' }),
    path: z.string().min(1).optional().meta({
      description:
        'The file the text belongs to, as Studio loaded it; the first file when omitted.',
      example: 'prisma/schema.prisma',
    }),
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
    newName: z.string().min(1).meta({ description: 'The new name.', example: 'Account' }),
  })
  .readonly()
  .meta({
    description: 'Input for a rename',
    example: { text: '', line: 0, character: 7, newName: 'Account' },
  })

/**
 * The edits that rename the model or enum at the position everywhere it is used.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   participant S as StudioService
 *   participant L as LanguageService
 *   H->>U: renameAt({ text, path, line, character, newName })
 *   U->>S: studio().state
 *   S-->>U: snapshot files
 *   Note over U: the named file, else the first loaded one, with the text in its place
 *   U->>L: renameSchema({ ...workspace, line, character, newName })
 *   alt the language server throws
 *     Note over L: logged, and answered with nothing
 *   end
 *   L-->>U: changes per file
 *   U-->>H: changes per file
 * ```
 *
 * @param input - the text, the position and the new name
 * @returns the edits per file
 */
export function renameAt(input: z.infer<typeof RenameAtInput>) {
  return Effect.gen(function* () {
    const workspace = yield* workspaceOf(input)
    const changes = yield* LanguageService.renameSchema({
      ...workspace,
      line: input.line,
      character: input.character,
      newName: input.newName,
    })
    return { changes }
  })
}

const CodeActionsAtInput = z
  .object({
    text: z
      .string()
      .brand<'SchemaText'>()
      .meta({ description: 'The schema text.', example: 'datasource db {\n  provider = \n}\n' }),
    path: z.string().min(1).optional().meta({
      description:
        'The file the text belongs to, as Studio loaded it; the first file when omitted.',
      example: 'prisma/schema.prisma',
    }),
    range: z
      .object({
        start: z
          .object({
            line: z.number().int().min(0).meta({ description: 'The 0-based line.', example: 1 }),
            character: z
              .number()
              .int()
              .min(0)
              .meta({ description: 'The 0-based column.', example: 7 }),
          })
          .meta({ description: 'Where the range starts.' }),
        end: z
          .object({
            line: z.number().int().min(0).meta({ description: 'The 0-based line.', example: 1 }),
            character: z
              .number()
              .int()
              .min(0)
              .meta({ description: 'The 0-based column.', example: 8 }),
          })
          .meta({ description: 'Where the range ends.' }),
      })
      .meta({ description: 'The range the actions are asked for.' }),
    diagnostics: z
      .array(
        z.object({
          range: z
            .object({
              start: z
                .object({
                  line: z
                    .number()
                    .int()
                    .min(0)
                    .meta({ description: 'The 0-based line.', example: 1 }),
                  character: z
                    .number()
                    .int()
                    .min(0)
                    .meta({ description: 'The 0-based column.', example: 7 }),
                })
                .meta({ description: 'Where the range starts.' }),
              end: z
                .object({
                  line: z
                    .number()
                    .int()
                    .min(0)
                    .meta({ description: 'The 0-based line.', example: 1 }),
                  character: z
                    .number()
                    .int()
                    .min(0)
                    .meta({ description: 'The 0-based column.', example: 8 }),
                })
                .meta({ description: 'Where the range ends.' }),
            })
            .meta({ description: 'Where the diagnostic is.' }),
          message: z.string().meta({
            description: 'The Prisma message.',
            example:
              'Type "R" is neither a built-in type, nor refers to another model, composite type, or enum.',
          }),
          severity: z
            .enum(['error', 'warning', 'information', 'hint'])
            .meta({ description: 'How serious it is.', example: 'error' }),
        }),
      )
      .readonly()
      .meta({ description: 'The diagnostics the editor shows in the range.' }),
  })
  .readonly()
  .meta({
    description: 'Input for code actions',
    example: {
      text: '',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      diagnostics: [],
    },
  })

/**
 * The quick fixes the Prisma language server offers for the diagnostics in the range.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as PrismaUseCase
 *   participant S as StudioService
 *   participant L as LanguageService
 *   H->>U: codeActionsAt({ text, path, range, diagnostics })
 *   U->>S: studio().state
 *   S-->>U: snapshot files
 *   Note over U: the named file, else the first loaded one, with the text in its place
 *   U->>L: codeActionsSchema({ ...workspace, range, diagnostics })
 *   alt the language server throws
 *     Note over L: logged, and answered with nothing
 *   end
 *   L-->>U: actions
 *   U-->>H: actions
 * ```
 *
 * @param input - the text, the range and the diagnostics in it
 * @returns the fixes
 */
export function codeActionsAt(input: z.infer<typeof CodeActionsAtInput>) {
  return Effect.gen(function* () {
    const workspace = yield* workspaceOf(input)
    const actions = yield* LanguageService.codeActionsSchema({
      ...workspace,
      range: input.range,
      diagnostics: input.diagnostics,
    })
    return { actions }
  })
}
