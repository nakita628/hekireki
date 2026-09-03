// The Prisma language server (the one behind the VS Code extension), called in-process. Its
// package only exports the stdio entry, so the request handlers are loaded from its `dist/lib`
// files and typed from the declarations shipped next to them (see the `paths` of tsconfig.json).
// Everything Studio knows about a schema text — diagnostics, formatting, completions, hover,
// definitions, references, renames, quick fixes, the block outline — comes from these handlers;
// the functions below only replace file URIs by the paths Studio loaded.
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { getBlocks } from '@prisma/language-server/dist/lib/ast/index.js'
import type {
  handleCodeActions,
  handleCompletionRequest,
  handleDefinitionRequest,
  handleDiagnosticsRequest,
  handleDocumentFormatting,
  handleDocumentSymbol,
  handleHoverRequest,
  handleReferencesRequest,
  handleRenameRequest,
} from '@prisma/language-server/dist/lib/MessageHandler.js'
import type { PrismaSchema, SchemaDocument } from '@prisma/language-server/dist/lib/Schema.js'
import { Effect } from 'effect'
import { TextDocument } from 'vscode-languageserver-textdocument'
import * as z from 'zod'

import { PRISMA_FILE_URI } from '../constants/index.js'
import { FormatError } from '../errors/index.js'

function exportOf<T>(description: string) {
  return z.custom<T>((value) => typeof value === 'function').meta({ description })
}

const MessageHandlerModule = z
  .object({
    handleDiagnosticsRequest: exportOf<typeof handleDiagnosticsRequest>(
      'Lints every document of the schema.',
    ),
    handleDocumentFormatting: exportOf<typeof handleDocumentFormatting>(
      'Formats one document of the schema.',
    ),
    handleCompletionRequest: exportOf<typeof handleCompletionRequest>('Completions at a position.'),
    handleHoverRequest: exportOf<typeof handleHoverRequest>('Hover text at a position.'),
    handleDefinitionRequest: exportOf<typeof handleDefinitionRequest>(
      'Where the symbol at a position is declared.',
    ),
    handleReferencesRequest: exportOf<typeof handleReferencesRequest>(
      'Where the symbol at a position is used.',
    ),
    handleRenameRequest: exportOf<typeof handleRenameRequest>(
      'The edits that rename the symbol at a position.',
    ),
    handleCodeActions: exportOf<typeof handleCodeActions>('Quick fixes for diagnostics.'),
    handleDocumentSymbol: exportOf<typeof handleDocumentSymbol>('The blocks of one document.'),
  })
  .meta({
    description: 'The request handlers of @prisma/language-server (dist/lib/MessageHandler)',
  })

const SchemaModule = z
  .object({
    PrismaSchema: exportOf<typeof PrismaSchema>('The multi-file schema the handlers read.'),
    SchemaDocument: exportOf<typeof SchemaDocument>('One document of the schema.'),
  })
  .meta({ description: 'The schema classes of @prisma/language-server (dist/lib/Schema)' })

const AstModule = z
  .object({
    getBlocks: exportOf<typeof getBlocks>('Every block of the schema, with its ranges.'),
  })
  .meta({ description: 'The AST helpers of @prisma/language-server (dist/lib/ast)' })

function loadLanguageServer() {
  const require = createRequire(import.meta.url)
  const root = path.resolve(path.dirname(require.resolve('@prisma/language-server')), '..')
  const lib = (file: string): unknown => require(path.join(root, 'dist/lib', file))
  return {
    handlers: MessageHandlerModule.parse(lib('MessageHandler.js')),
    schema: SchemaModule.parse(lib('Schema.js')),
    ast: AstModule.parse(lib('ast/index.js')),
  }
}

const languageServer = loadLanguageServer()

function noop() {
  // The language server reports progress on the console; Studio's terminal belongs to the CLI.
}

/** Runs a language server request with its console chatter muted. */
function quietly<T>(run: () => T): T {
  // oxlint-disable-next-line no-console -- the server's own console output is silenced for the call
  const original = { log: console.log, info: console.info, warn: console.warn }
  Object.assign(console, { log: noop, info: noop, warn: noop })
  try {
    return run()
  } finally {
    Object.assign(console, original)
  }
}

// ---------------------------------------------------------------------------------------------
// The workspace: every loaded file as the language server sees it, one of them being edited.
// ---------------------------------------------------------------------------------------------

const MakeWorkspaceInput = z
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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
  })
  .readonly()
  .meta({
    description: 'The schema files and the text of the one being edited',
    example: { files: [], path: null, text: '' },
  })

function uriOf(filePath: string) {
  return pathToFileURL(path.resolve(filePath)).href
}

/** The loaded files as documents, with the edited one (when it is one of them) replaced by the text. */
function makeWorkspace(input: z.infer<typeof MakeWorkspaceInput>) {
  const edited = input.path
  const editedUri = edited === null ? PRISMA_FILE_URI : uriOf(edited)
  const document = TextDocument.create(editedUri, 'prisma', 1, input.text)
  const others = input.files
    .filter((f) => f.path !== edited)
    .map((f) => ({
      path: f.path,
      document: TextDocument.create(uriOf(f.path), 'prisma', 1, f.content),
    }))
  const paths = new Map([
    [editedUri, edited ?? ''],
    ...others.map((f): readonly [string, string] => [f.document.uri, f.path]),
  ])
  return {
    schema: new languageServer.schema.PrismaSchema(
      [document, ...others.map((f) => f.document)].map(
        (loaded) => new languageServer.schema.SchemaDocument(loaded),
      ),
    ),
    document,
    pathOf: (uri: string) => paths.get(uri) ?? uri,
  }
}

type Workspace = ReturnType<typeof makeWorkspace>

type LspPosition = { readonly line: number; readonly character: number }

type LspRange = { readonly start: LspPosition; readonly end: LspPosition }

// The server's ranges are copied into Studio's own shape so nothing exported names its types.
function rangeOf(range: LspRange): LspRange {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  }
}

// ---------------------------------------------------------------------------------------------
// The files on disk: what the snapshot carries about them.
// ---------------------------------------------------------------------------------------------

/** The LSP DiagnosticSeverity values by name. */
const SEVERITY = { error: 1, warning: 2, information: 3, hint: 4 } as const

/** The names in value order, so `SEVERITIES[value - 1]` is the name. */
const SEVERITIES = ['error', 'warning', 'information', 'hint'] as const

function diagnosticsOf(workspace: Workspace) {
  return Array.from(
    quietly(() => languageServer.handlers.handleDiagnosticsRequest(workspace.schema)).entries(),
    ([uri, diagnostics]) =>
      diagnostics.map((diagnostic) => ({
        path: workspace.pathOf(uri),
        range: rangeOf(diagnostic.range),
        message: diagnostic.message,
        severity:
          (diagnostic.severity === undefined ? undefined : SEVERITIES[diagnostic.severity - 1]) ??
          'error',
      })),
  ).flat()
}

const DiagnoseFilesInput = z
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
      .meta({ description: 'The loaded schema files.' }),
  })
  .readonly()
  .meta({ description: 'The loaded schema files', example: { files: [] } })

/** Every diagnostic the language server reports for the loaded files, validated together. */
export function diagnoseFiles(input: z.infer<typeof DiagnoseFilesInput>) {
  return Effect.sync(() => {
    const first = input.files[0]
    if (first === undefined) return []
    try {
      return diagnosticsOf(
        makeWorkspace({ files: input.files, path: first.path, text: first.content }),
      )
    } catch {
      return []
    }
  })
}

const BlockLocationsInput = z
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
      .meta({ description: 'The loaded schema files.' }),
  })
  .readonly()
  .meta({ description: 'The loaded schema files', example: { files: [] } })

/** Every block of the loaded files with the file and 1-based line of its header, in file order. */
export function blockLocations(input: z.infer<typeof BlockLocationsInput>) {
  return Effect.sync(() => {
    const first = input.files[0]
    if (first === undefined) return []
    try {
      const workspace = makeWorkspace({ files: input.files, path: first.path, text: first.content })
      return Array.from(languageServer.ast.getBlocks(workspace.schema), (block) => ({
        type: block.type,
        name: block.name,
        file: workspace.pathOf(block.definingDocument.uri),
        line: block.range.start.line + 1,
      }))
    } catch {
      return []
    }
  })
}

// ---------------------------------------------------------------------------------------------
// The text being edited: what the editor asks about it.
// ---------------------------------------------------------------------------------------------

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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
  })
  .readonly()
  .meta({
    description: 'The schema files and the text of the one being edited',
    example: { files: [], path: null, text: '' },
  })

/** The diagnostics of the edited text, validated together with the other loaded files. */
export function lintSchema(input: z.infer<typeof LintSchemaInput>) {
  return Effect.sync(() => {
    try {
      const workspace = makeWorkspace(input)
      return diagnosticsOf(workspace)
        .filter((diagnostic) => diagnostic.path === (input.path ?? ''))
        .map(({ range, message, severity }) => ({ range, message, severity }))
    } catch {
      return []
    }
  })
}

const FORMAT_OPTIONS = { tabSize: 2, insertSpaces: true }

function formatEdits(workspace: Workspace, onError: (message: string) => void) {
  return quietly(() =>
    languageServer.handlers.handleDocumentFormatting(
      workspace.schema,
      workspace.document,
      { textDocument: { uri: workspace.document.uri }, options: FORMAT_OPTIONS },
      onError,
    ),
  ).filter((edit) => edit.newText !== workspace.document.getText())
}

const FormatSchemaInput = z
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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
  })
  .readonly()
  .meta({
    description: 'The schema files and the text of the one being edited',
    example: { files: [], path: null, text: '' },
  })

/** The edits the Prisma formatter makes to the edited text; empty when it is already formatted. */
export function formatSchema(
  input: z.infer<typeof FormatSchemaInput>,
): Effect.Effect<readonly { readonly range: LspRange; readonly newText: string }[], FormatError> {
  return Effect.suspend(() => {
    const failures: string[] = []
    const edits = formatEdits(makeWorkspace(input), (message) => {
      // oxlint-disable-next-line custom/no-mutation -- collects what the server reports during the call
      failures.push(message)
    })
    const cause = failures[0]
    return cause === undefined
      ? Effect.succeed(edits.map((edit) => ({ range: rangeOf(edit.range), newText: edit.newText })))
      : Effect.fail(new FormatError({ cause }))
  })
}

const SymbolsOfSchemaInput = z
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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
  })
  .readonly()
  .meta({
    description: 'The schema files and the text of the one being edited',
    example: { files: [], path: null, text: '' },
  })

/** The blocks of the edited text as the language server's document outline lists them. */
export function symbolsOfSchema(input: z.infer<typeof SymbolsOfSchemaInput>) {
  return Effect.sync(() => {
    try {
      const workspace = makeWorkspace(input)
      return languageServer.handlers
        .handleDocumentSymbol({ textDocument: { uri: workspace.document.uri } }, workspace.document)
        .map(
          (symbol): { name: string; kind: number; range: LspRange; selectionRange: LspRange } => ({
            name: symbol.name,
            kind: symbol.kind,
            range: rangeOf(symbol.range),
            selectionRange: rangeOf(symbol.selectionRange),
          }),
        )
    } catch {
      return []
    }
  })
}

const PositionParamsInput = z
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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
    line: z.number().int().min(0).meta({ description: '0-based line of the cursor.', example: 1 }),
    character: z
      .number()
      .int()
      .min(0)
      .meta({ description: '0-based column of the cursor.', example: 13 }),
  })
  .readonly()
  .meta({
    description: 'The schema files, the edited text and a 0-based LSP position',
    example: { files: [], path: null, text: '', line: 0, character: 0 },
  })

function positionParams(workspace: Workspace, input: z.infer<typeof PositionParamsInput>) {
  return {
    textDocument: { uri: workspace.document.uri },
    position: { line: input.line, character: input.character },
  }
}

const CompleteSchemaInput = z
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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
    line: z.number().int().min(0).meta({ description: '0-based line of the cursor.', example: 1 }),
    character: z
      .number()
      .int()
      .min(0)
      .meta({ description: '0-based column of the cursor.', example: 13 }),
    triggerCharacter: z.string().nullable().meta({
      description: 'The character that opened the list, or null when the user asked for it.',
      example: '@',
    }),
  })
  .readonly()
  .meta({
    description: 'A position and how the completion list was opened',
    example: { files: [], path: null, text: '', line: 0, character: 0, triggerCharacter: null },
  })

// LSP CompletionTriggerKind: 1 = Invoked, 2 = TriggerCharacter.
const INVOKED = 1
const TRIGGER_CHARACTER = 2

// LSP InsertTextFormat: 2 = Snippet.
const SNIPPET = 2

type Completion = {
  readonly label: string
  readonly kind: number | null
  readonly detail: string | null
  readonly documentation: string | null
  readonly insertText: string
  readonly insertTextFormat: 'snippet' | 'plainText'
  readonly sortText: string | null
}

function markdownOf(
  contents: string | { readonly value: string } | readonly (string | { readonly value: string })[],
) {
  if (typeof contents === 'string') return contents
  if ('value' in contents) return contents.value
  return contents.map((part) => (typeof part === 'string' ? part : part.value)).join('\n\n')
}

/** Completions the Prisma language server offers at the position: keywords, types, attributes, arguments, values. */
export function completeSchema(input: z.infer<typeof CompleteSchemaInput>) {
  return Effect.sync(() => {
    try {
      const workspace = makeWorkspace(input)
      const list = quietly(() =>
        languageServer.handlers.handleCompletionRequest(workspace.schema, workspace.document, {
          ...positionParams(workspace, input),
          context:
            input.triggerCharacter === null
              ? { triggerKind: INVOKED }
              : { triggerKind: TRIGGER_CHARACTER, triggerCharacter: input.triggerCharacter },
        }),
      )
      return (list?.items ?? []).map((item): Completion => ({
        label: item.label,
        kind: item.kind ?? null,
        detail: item.detail ?? null,
        documentation: item.documentation === undefined ? null : markdownOf(item.documentation),
        insertText: item.insertText ?? item.label,
        insertTextFormat:
          item.insertTextFormat === SNIPPET ? ('snippet' as const) : ('plainText' as const),
        sortText: item.sortText ?? null,
      }))
    } catch {
      return []
    }
  })
}

const HoverSchemaInput = z
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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
    line: z.number().int().min(0).meta({ description: '0-based line of the cursor.', example: 1 }),
    character: z
      .number()
      .int()
      .min(0)
      .meta({ description: '0-based column of the cursor.', example: 13 }),
  })
  .readonly()
  .meta({
    description: 'The schema files, the edited text and a 0-based LSP position',
    example: { files: [], path: null, text: '', line: 0, character: 0 },
  })

/** What the Prisma language server says about the symbol at the position, as Markdown. */
export function hoverSchema(input: z.infer<typeof HoverSchemaInput>) {
  return Effect.sync(() => {
    try {
      const workspace = makeWorkspace(input)
      const hover = quietly(() =>
        languageServer.handlers.handleHoverRequest(
          workspace.schema,
          workspace.document,
          positionParams(workspace, input),
        ),
      )
      return hover === undefined
        ? { contents: null, range: null }
        : { contents: markdownOf(hover.contents), range: hover.range ? rangeOf(hover.range) : null }
    } catch {
      return { contents: null, range: null }
    }
  })
}

const DefineSchemaInput = z
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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
    line: z.number().int().min(0).meta({ description: '0-based line of the cursor.', example: 1 }),
    character: z
      .number()
      .int()
      .min(0)
      .meta({ description: '0-based column of the cursor.', example: 13 }),
  })
  .readonly()
  .meta({
    description: 'The schema files, the edited text and a 0-based LSP position',
    example: { files: [], path: null, text: '', line: 0, character: 0 },
  })

/** Where the model, enum or type referenced at the position is declared. */
export function defineSchema(input: z.infer<typeof DefineSchemaInput>) {
  return Effect.sync(() => {
    try {
      const workspace = makeWorkspace(input)
      const links = quietly(() =>
        languageServer.handlers.handleDefinitionRequest(
          workspace.schema,
          workspace.document,
          positionParams(workspace, input),
        ),
      )
      return (links ?? []).map((link) => ({
        path: workspace.pathOf(link.targetUri),
        range: rangeOf(link.targetRange),
        selection: rangeOf(link.targetSelectionRange),
      }))
    } catch {
      return []
    }
  })
}

const ReferencesSchemaInput = z
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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
    line: z.number().int().min(0).meta({ description: '0-based line of the cursor.', example: 1 }),
    character: z
      .number()
      .int()
      .min(0)
      .meta({ description: '0-based column of the cursor.', example: 13 }),
  })
  .readonly()
  .meta({
    description: 'The schema files, the edited text and a 0-based LSP position',
    example: { files: [], path: null, text: '', line: 0, character: 0 },
  })

/** Every place the symbol at the position is used, across the loaded files, declaration included. */
export function referencesSchema(input: z.infer<typeof ReferencesSchemaInput>) {
  return Effect.sync(() => {
    try {
      const workspace = makeWorkspace(input)
      const locations = quietly(() =>
        languageServer.handlers.handleReferencesRequest(workspace.schema, {
          ...positionParams(workspace, input),
          context: { includeDeclaration: true },
        }),
      )
      return (locations ?? []).map((location) => ({
        path: workspace.pathOf(location.uri),
        range: rangeOf(location.range),
      }))
    } catch {
      return []
    }
  })
}

function fileEdits(
  workspace: Workspace,
  changes:
    | Readonly<Record<string, readonly { readonly range: LspRange; readonly newText: string }[]>>
    | undefined,
) {
  return Object.entries(changes ?? {}).map(([uri, edits]) => ({
    path: workspace.pathOf(uri),
    edits: edits.map((edit) => ({ range: rangeOf(edit.range), newText: edit.newText })),
  }))
}

const RenameSchemaInput = z
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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
    line: z.number().int().min(0).meta({ description: '0-based line of the cursor.', example: 1 }),
    character: z
      .number()
      .int()
      .min(0)
      .meta({ description: '0-based column of the cursor.', example: 13 }),
    newName: z.string().meta({ description: 'The new name.', example: 'Account' }),
  })
  .readonly()
  .meta({
    description: 'A position and the new name for the symbol there',
    example: { files: [], path: null, text: '', line: 0, character: 7, newName: 'Account' },
  })

/** The edits that rename the model, enum or field at the position everywhere it is used, per file. */
export function renameSchema(input: z.infer<typeof RenameSchemaInput>) {
  return Effect.sync(() => {
    try {
      const workspace = makeWorkspace(input)
      const edit = quietly(() =>
        languageServer.handlers.handleRenameRequest(workspace.schema, workspace.document, {
          ...positionParams(workspace, input),
          newName: input.newName,
        }),
      )
      return fileEdits(workspace, edit?.changes)
    } catch {
      return []
    }
  })
}

const CodeActionsSchemaInput = z
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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
    range: z
      .object({
        start: z
          .object({
            line: z.number().int().min(0).meta({ description: 'The 0-based line.', example: 1 }),
            character: z
              .number()
              .int()
              .min(0)
              .meta({ description: 'The 0-based column.', example: 13 }),
          })
          .meta({ description: 'Where the range starts.' }),
        end: z
          .object({
            line: z.number().int().min(0).meta({ description: 'The 0-based line.', example: 1 }),
            character: z
              .number()
              .int()
              .min(0)
              .meta({ description: 'The 0-based column.', example: 16 }),
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
                    .meta({ description: 'The 0-based column.', example: 13 }),
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
                    .meta({ description: 'The 0-based column.', example: 16 }),
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
            .enum(SEVERITIES)
            .meta({ description: 'How serious it is.', example: 'error' }),
        }),
      )
      .meta({ description: 'The diagnostics the editor shows in the range.' }),
  })
  .readonly()
  .meta({
    description: 'The schema files, the edited text, a range and the diagnostics in it',
    example: {
      files: [],
      path: null,
      text: '',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      diagnostics: [],
    },
  })

function errorCount(workspace: Workspace) {
  return diagnosticsOf(workspace).filter(
    (diagnostic) =>
      diagnostic.path === workspace.pathOf(workspace.document.uri) &&
      diagnostic.severity === 'error',
  ).length
}

const FormatFixInput = z
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
      .meta({ description: 'The loaded schema files.' }),
    path: z.string().nullable().meta({
      description: 'The file the text belongs to, or null for a lone in-memory document.',
      example: 'prisma/schema.prisma',
    }),
    text: z
      .string()
      .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' }),
    range: z
      .object({
        start: z
          .object({
            line: z.number().int().min(0).meta({ description: 'The 0-based line.', example: 1 }),
            character: z
              .number()
              .int()
              .min(0)
              .meta({ description: 'The 0-based column.', example: 13 }),
          })
          .meta({ description: 'Where the range starts.' }),
        end: z
          .object({
            line: z.number().int().min(0).meta({ description: 'The 0-based line.', example: 1 }),
            character: z
              .number()
              .int()
              .min(0)
              .meta({ description: 'The 0-based column.', example: 16 }),
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
                    .meta({ description: 'The 0-based column.', example: 13 }),
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
                    .meta({ description: 'The 0-based column.', example: 16 }),
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
            .enum(SEVERITIES)
            .meta({ description: 'How serious it is.', example: 'error' }),
        }),
      )
      .meta({ description: 'The diagnostics the editor shows in the range.' }),
  })
  .readonly()
  .meta({
    description: 'The schema files, the edited text, a range and the diagnostics in it',
    example: {
      files: [],
      path: null,
      text: '',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      diagnostics: [],
    },
  })

// The Prisma formatter also completes relations (the opposite field, `fields` / `references`),
// which the language server reports as errors without offering a fix. When formatting the text
// removes errors, the formatted text is offered as one.
function formatFix(input: z.infer<typeof FormatFixInput>, workspace: Workspace) {
  if (!input.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return []
  const edit = formatEdits(workspace, noop)[0]
  if (edit === undefined) return []
  const before = errorCount(workspace)
  const after = errorCount(
    makeWorkspace({ files: input.files, path: input.path, text: edit.newText }),
  )
  if (after >= before) return []
  const fixed = before - after
  return [
    {
      title: `Format with Prisma (fixes ${fixed} ${fixed === 1 ? 'error' : 'errors'})`,
      changes: [
        { path: input.path ?? '', edits: [{ range: rangeOf(edit.range), newText: edit.newText }] },
      ],
      isPreferred: true,
    },
  ]
}

/** The quick fixes for the diagnostics in the range: the language server's, then the formatter when it fixes errors. */
export function codeActionsSchema(input: z.infer<typeof CodeActionsSchemaInput>) {
  return Effect.sync(() => {
    try {
      const workspace = makeWorkspace(input)
      const actions = quietly(() =>
        languageServer.handlers.handleCodeActions(workspace.schema, workspace.document, {
          textDocument: { uri: workspace.document.uri },
          range: input.range,
          context: {
            diagnostics: input.diagnostics.map((diagnostic) => ({
              range: diagnostic.range,
              message: diagnostic.message,
              severity: SEVERITY[diagnostic.severity],
            })),
          },
        }),
      )
      return [
        ...actions.map((action) => ({
          title: action.title,
          changes: fileEdits(workspace, action.edit?.changes),
          isPreferred: action.isPreferred ?? false,
        })),
        ...formatFix(input, workspace),
      ]
    } catch {
      return []
    }
  })
}
