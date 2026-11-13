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

type LanguageServer = {
  readonly handlers: z.infer<typeof MessageHandlerModule>
  readonly schema: z.infer<typeof SchemaModule>
  readonly ast: z.infer<typeof AstModule>
}

// The modules once read and checked; null until the first request asks for them.
const modules: { server: LanguageServer | null } = { server: null }

// Read where a request needs it rather than when Studio starts: loading the package takes
// seconds, so only the first request pays. Resolved and checked once: every request after that
// reads the same modules, and `require.resolve` on each would be a file system walk per call.
function languageServer(): LanguageServer {
  if (modules.server !== null) return modules.server
  const require = createRequire(import.meta.url)
  const root = path.resolve(path.dirname(require.resolve('@prisma/language-server')), '..')
  const lib = (file: string): unknown => require(path.join(root, 'dist/lib', file))
  const server = {
    handlers: MessageHandlerModule.parse(lib('MessageHandler.js')),
    schema: SchemaModule.parse(lib('Schema.js')),
    ast: AstModule.parse(lib('ast/index.js')),
  }
  // oxlint-disable-next-line custom/no-mutation -- the one cell the loaded modules are kept in
  modules.server = server
  return server
}

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

/**
 * Runs a language server request; what it throws is logged and answered with `fallback`, so an
 * editor request never fails on the server's account.
 */
function askServer<A, B>(what: string, fallback: B, run: () => A) {
  return Effect.try(run).pipe(
    Effect.catchTag('UnknownError', (error) =>
      Effect.logDebug(`the language server could not ${what}`, error).pipe(Effect.as(fallback)),
    ),
  )
}

// ---------------------------------------------------------------------------------------------
// What the requests below are made of: the loaded files, the text being edited, and where.
// ---------------------------------------------------------------------------------------------

/** The LSP DiagnosticSeverity values by name. */
const SEVERITY = { error: 1, warning: 2, information: 3, hint: 4 } as const

/** The names in value order, so `SEVERITIES[value - 1]` is the name. */
const SEVERITIES = ['error', 'warning', 'information', 'hint'] as const

const SchemaFiles = z
  .array(
    z
      .object({
        path: z.string().meta({ description: 'The file path.', example: 'prisma/schema.prisma' }),
        content: z
          .string()
          .meta({ description: 'The file text.', example: 'model User {\n  id Int @id\n}\n' }),
      })
      .readonly(),
  )
  .readonly()
  .meta({ description: 'The loaded schema files.', example: [] })

const EditedPath = z.string().nullable().meta({
  description: 'The file the text belongs to, or null for a lone in-memory document.',
  example: 'prisma/schema.prisma',
})

const EditedText = z
  .string()
  .meta({ description: 'The text as typed.', example: 'model User {\n  id Int @id\n}\n' })

const CursorLine = z
  .number()
  .int()
  .min(0)
  .meta({ description: '0-based line of the cursor.', example: 1 })

const CursorCharacter = z
  .number()
  .int()
  .min(0)
  .meta({ description: '0-based column of the cursor.', example: 13 })

const ActionRange = z
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
  .meta({ description: 'The range the actions are asked for.' })

const ShownDiagnostics = z
  .array(
    z.object({
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
        .meta({ description: 'Where the diagnostic is.' }),
      message: z.string().meta({
        description: 'The Prisma message.',
        example:
          'Type "R" is neither a built-in type, nor refers to another model, composite type, or enum.',
      }),
      severity: z.enum(SEVERITIES).meta({ description: 'How serious it is.', example: 'error' }),
    }),
  )
  .readonly()
  .meta({ description: 'The diagnostics the editor shows in the range.' })

// ---------------------------------------------------------------------------------------------
// The workspace: every loaded file as the language server sees it, one of them being edited.
// ---------------------------------------------------------------------------------------------

/** The loaded files and the text of the one being edited: what every request about a text carries. */
const EditedSchemaInput = z
  .object({
    files: SchemaFiles,
    path: EditedPath,
    text: EditedText,
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
// The loaded files as the server reads them, by the snapshot's files array: a request is made of
// those and one edited text, and only the text changes from one keystroke to the next.
const loadedDocuments = new WeakMap<
  z.infer<typeof EditedSchemaInput>['files'],
  ReadonlyMap<string, SchemaDocument>
>()

function makeWorkspace(input: z.infer<typeof EditedSchemaInput>) {
  const edited = input.path
  const editedUri = edited === null ? PRISMA_FILE_URI : uriOf(edited)
  const document = TextDocument.create(editedUri, 'prisma', 1, input.text)
  const { PrismaSchema, SchemaDocument: Document } = languageServer().schema
  const loaded =
    loadedDocuments.get(input.files) ??
    new Map(
      input.files.map((f) => [
        f.path,
        new Document(TextDocument.create(uriOf(f.path), 'prisma', 1, f.content)),
      ]),
    )
  loadedDocuments.set(input.files, loaded)
  const others = [...loaded].filter(([file]) => file !== edited)
  const paths = new Map([
    [editedUri, edited ?? ''],
    ...others.map(([file, other]): readonly [string, string] => [other.textDocument.uri, file]),
  ])
  return {
    schema: new PrismaSchema([new Document(document), ...others.map(([, other]) => other)]),
    document,
    pathOf: (uri: string) => paths.get(uri) ?? uri,
  }
}

type Workspace = ReturnType<typeof makeWorkspace>

type LspRange = {
  readonly start: { readonly line: number; readonly character: number }
  readonly end: { readonly line: number; readonly character: number }
}

// The server's ranges are copied into Studio's own shape so nothing exported names its types.
function rangeOf(range: LspRange) {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  }
}

// ---------------------------------------------------------------------------------------------
// The files on disk: what the snapshot carries about them.
// ---------------------------------------------------------------------------------------------

function diagnosticsOf(workspace: Workspace) {
  return Array.from(
    quietly(() => languageServer().handlers.handleDiagnosticsRequest(workspace.schema)).entries(),
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

const LoadedFilesInput = z
  .object({
    files: SchemaFiles,
  })
  .readonly()
  .meta({ description: 'The loaded schema files', example: { files: [] } })

function blocksOf(workspace: Workspace) {
  return Array.from(languageServer().ast.getBlocks(workspace.schema), (block) => ({
    type: block.type,
    name: block.name,
    file: workspace.pathOf(block.definingDocument.uri),
    line: block.range.start.line + 1,
  }))
}

/**
 * The diagnostics and the blocks of the loaded files, from one workspace: what a reload reads,
 * which would otherwise build the same documents twice. Either is empty where the server throws.
 *
 * ```mermaid
 * flowchart LR
 *   files[loaded files] --> ws[workspace of documents] --> ls[(Prisma language server)]
 *   ls -->|handleDiagnosticsRequest| diagnostics[diagnostics with paths]
 *   ls -->|getBlocks| blocks[blocks with file and line]
 *   files -->|none| none[both empty]
 *   ws & diagnostics & blocks -->|"throws (UnknownError), logDebug"| empty[that part empty]
 * ```
 *
 * @param input.files - the loaded schema files
 * @returns the diagnostics and the blocks of every loaded file; it does not fail
 */
export function inspectFiles(input: z.infer<typeof LoadedFilesInput>) {
  return Effect.gen(function* () {
    const first = input.files[0]
    if (first === undefined) return { diagnostics: [], blocks: [] }
    const workspace = yield* askServer('read the schema files', null, () =>
      makeWorkspace({ files: input.files, path: first.path, text: first.content }),
    )
    if (workspace === null) return { diagnostics: [], blocks: [] }
    const diagnostics = yield* askServer('list the diagnostics', [], () => diagnosticsOf(workspace))
    const blocks = yield* askServer('list the blocks', [], () => blocksOf(workspace))
    return { diagnostics, blocks }
  })
}

// ---------------------------------------------------------------------------------------------
// The text being edited: what the editor asks about it.
// ---------------------------------------------------------------------------------------------

/**
 * The diagnostics of the edited text, validated together with the other loaded files.
 *
 * ```mermaid
 * flowchart LR
 *   in[files + edited text] --> ls[(Prisma language server)] -->|handleDiagnosticsRequest| out[diagnostics of the edited file]
 *   ls -->|"throws (UnknownError)"| log["logDebug: could not lint the schema"] --> empty["[]"]
 * ```
 *
 * @param input.files - the loaded schema files
 * @param input.path - the file the text belongs to, or null for a lone in-memory document
 * @param input.text - the text as typed
 * @returns the edited file's diagnostics, each with its range, message and severity; empty where
 *   the server throws
 */
export function lintSchema(input: z.infer<typeof EditedSchemaInput>) {
  return askServer('lint the schema', [], () => {
    const workspace = makeWorkspace(input)
    return diagnosticsOf(workspace)
      .filter((diagnostic) => diagnostic.path === (input.path ?? ''))
      .map(({ range, message, severity }) => ({ range, message, severity }))
  })
}

const FORMAT_OPTIONS = { tabSize: 2, insertSpaces: true } as const

function formatEdits(workspace: Workspace, onError: (message: string) => void) {
  return quietly(() =>
    languageServer().handlers.handleDocumentFormatting(
      workspace.schema,
      workspace.document,
      { textDocument: { uri: workspace.document.uri }, options: FORMAT_OPTIONS },
      onError,
    ),
  ).filter((edit) => edit.newText !== workspace.document.getText())
}

/**
 * The edits the Prisma formatter makes to the edited text; empty when it is already formatted.
 *
 * ```mermaid
 * flowchart LR
 *   in[files + edited text] --> ls[(Prisma language server)] -->|handleDocumentFormatting| edits[edits that change the text]
 *   ls -->|reports an error| fail[FormatError]
 * ```
 *
 * @param input.files - the loaded schema files
 * @param input.path - the file the text belongs to, or null for a lone in-memory document
 * @param input.text - the text as typed
 * @returns the formatting edits, each a range and its new text
 */
export function formatSchema(input: z.infer<typeof EditedSchemaInput>) {
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

/**
 * The blocks of the edited text as the language server's document outline lists them.
 *
 * ```mermaid
 * flowchart LR
 *   in[files + edited text] --> ls[(Prisma language server)] -->|handleDocumentSymbol| out[symbols: name, kind, ranges]
 *   ls -->|"throws (UnknownError)"| log["logDebug: could not list the symbols"] --> empty["[]"]
 * ```
 *
 * @param input.files - the loaded schema files
 * @param input.path - the file the text belongs to, or null for a lone in-memory document
 * @param input.text - the text as typed
 * @returns each block's name, kind, range and selection range; empty where the server throws
 */
export function symbolsOfSchema(input: z.infer<typeof EditedSchemaInput>) {
  return askServer('list the symbols', [], () => {
    const workspace = makeWorkspace(input)
    return languageServer()
      .handlers.handleDocumentSymbol(
        { textDocument: { uri: workspace.document.uri } },
        workspace.document,
      )
      .map(
        // `kind` is widened to a number so the declaration does not name the server's SymbolKind.
        (symbol): { name: string; kind: number; range: LspRange; selectionRange: LspRange } => ({
          name: symbol.name,
          kind: symbol.kind,
          range: rangeOf(symbol.range),
          selectionRange: rangeOf(symbol.selectionRange),
        }),
      )
  })
}

const PositionParamsInput = z
  .object({
    files: SchemaFiles,
    path: EditedPath,
    text: EditedText,
    line: CursorLine,
    character: CursorCharacter,
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
    files: SchemaFiles,
    path: EditedPath,
    text: EditedText,
    line: CursorLine,
    character: CursorCharacter,
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

function markdownOf(
  contents: string | { readonly value: string } | readonly (string | { readonly value: string })[],
) {
  if (typeof contents === 'string') return contents
  if ('value' in contents) return contents.value
  return contents.map((part) => (typeof part === 'string' ? part : part.value)).join('\n\n')
}

/**
 * Completions the Prisma language server offers at the position: keywords, types, attributes,
 * arguments, values.
 *
 * ```mermaid
 * flowchart LR
 *   in[files + edited text + position + trigger character] --> ls[(Prisma language server)] -->|handleCompletionRequest| out[completion items]
 *   ls -->|"throws (UnknownError)"| log["logDebug: could not complete"] --> empty["[]"]
 * ```
 *
 * @param input.files - the loaded schema files
 * @param input.path - the file the text belongs to, or null for a lone in-memory document
 * @param input.text - the text as typed
 * @param input.line - 0-based line of the cursor
 * @param input.character - 0-based column of the cursor
 * @param input.triggerCharacter - the character that opened the list, or null when the user asked
 *   for it
 * @returns the completion items, with their insert text and whether it is a snippet; empty where
 *   the server throws
 */
export function completeSchema(input: z.infer<typeof CompleteSchemaInput>) {
  return askServer('complete', [], () => {
    const workspace = makeWorkspace(input)
    const list = quietly(() =>
      languageServer().handlers.handleCompletionRequest(workspace.schema, workspace.document, {
        ...positionParams(workspace, input),
        context:
          input.triggerCharacter === null
            ? { triggerKind: INVOKED }
            : { triggerKind: TRIGGER_CHARACTER, triggerCharacter: input.triggerCharacter },
      }),
    )
    return (list?.items ?? []).map(
      // `kind` is widened to a number so the declaration does not name the server's CompletionItemKind.
      (
        item,
      ): {
        label: string
        kind: number | null
        detail: string | null
        documentation: string | null
        insertText: string
        insertTextFormat: 'snippet' | 'plainText'
        sortText: string | null
      } => ({
        label: item.label,
        kind: item.kind ?? null,
        detail: item.detail ?? null,
        documentation: item.documentation === undefined ? null : markdownOf(item.documentation),
        insertText: item.insertText ?? item.label,
        insertTextFormat: item.insertTextFormat === SNIPPET ? 'snippet' : 'plainText',
        sortText: item.sortText ?? null,
      }),
    )
  })
}

/**
 * What the Prisma language server says about the symbol at the position, as Markdown.
 *
 * ```mermaid
 * flowchart LR
 *   in[files + edited text + position] --> ls[(Prisma language server)] -->|handleHoverRequest| out[Markdown + range]
 *   ls -->|"throws (UnknownError)"| log["logDebug: could not hover"] --> empty[contents and range null]
 * ```
 *
 * @param input.files - the loaded schema files
 * @param input.path - the file the text belongs to, or null for a lone in-memory document
 * @param input.text - the text as typed
 * @param input.line - 0-based line of the cursor
 * @param input.character - 0-based column of the cursor
 * @returns the hover text as Markdown and the range it covers; both null where there is nothing
 *   to say or the server throws
 */
export function hoverSchema(input: z.infer<typeof PositionParamsInput>) {
  return askServer('hover', { contents: null, range: null }, () => {
    const workspace = makeWorkspace(input)
    const hover = quietly(() =>
      languageServer().handlers.handleHoverRequest(
        workspace.schema,
        workspace.document,
        positionParams(workspace, input),
      ),
    )
    return hover === undefined
      ? { contents: null, range: null }
      : { contents: markdownOf(hover.contents), range: hover.range ? rangeOf(hover.range) : null }
  })
}

/**
 * Where the model, enum or type referenced at the position is declared.
 *
 * ```mermaid
 * flowchart LR
 *   in[files + edited text + position] --> ls[(Prisma language server)] -->|handleDefinitionRequest| out[path + range of each declaration]
 *   ls -->|"throws (UnknownError)"| log["logDebug: could not find the definition"] --> empty["[]"]
 * ```
 *
 * @param input.files - the loaded schema files
 * @param input.path - the file the text belongs to, or null for a lone in-memory document
 * @param input.text - the text as typed
 * @param input.line - 0-based line of the cursor
 * @param input.character - 0-based column of the cursor
 * @returns the path, range and selection range of each declaration; empty where the server throws
 */
export function defineSchema(input: z.infer<typeof PositionParamsInput>) {
  return askServer('find the definition', [], () => {
    const workspace = makeWorkspace(input)
    const links = quietly(() =>
      languageServer().handlers.handleDefinitionRequest(
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
  })
}

/**
 * Every place the symbol at the position is used, across the loaded files, declaration included.
 *
 * ```mermaid
 * flowchart LR
 *   in[files + edited text + position] --> ls[(Prisma language server)] -->|handleReferencesRequest| out[path + range of each use]
 *   ls -->|"throws (UnknownError)"| log["logDebug: could not find the references"] --> empty["[]"]
 * ```
 *
 * @param input.files - the loaded schema files
 * @param input.path - the file the text belongs to, or null for a lone in-memory document
 * @param input.text - the text as typed
 * @param input.line - 0-based line of the cursor
 * @param input.character - 0-based column of the cursor
 * @returns the path and range of each use; empty where the server throws
 */
export function referencesSchema(input: z.infer<typeof PositionParamsInput>) {
  return askServer('find the references', [], () => {
    const workspace = makeWorkspace(input)
    const locations = quietly(() =>
      languageServer().handlers.handleReferencesRequest(workspace.schema, {
        ...positionParams(workspace, input),
        context: { includeDeclaration: true },
      }),
    )
    return (locations ?? []).map((location) => ({
      path: workspace.pathOf(location.uri),
      range: rangeOf(location.range),
    }))
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
    files: SchemaFiles,
    path: EditedPath,
    text: EditedText,
    line: CursorLine,
    character: CursorCharacter,
    newName: z.string().meta({ description: 'The new name.', example: 'Account' }),
  })
  .readonly()
  .meta({
    description: 'A position and the new name for the symbol there',
    example: { files: [], path: null, text: '', line: 0, character: 7, newName: 'Account' },
  })

/**
 * The edits that rename the model, enum or field at the position everywhere it is used, per file.
 *
 * ```mermaid
 * flowchart LR
 *   in[files + edited text + position + new name] --> ls[(Prisma language server)] -->|handleRenameRequest| out[edits per file]
 *   ls -->|"throws (UnknownError)"| log["logDebug: could not rename"] --> empty["[]"]
 * ```
 *
 * @param input.files - the loaded schema files
 * @param input.path - the file the text belongs to, or null for a lone in-memory document
 * @param input.text - the text as typed
 * @param input.line - 0-based line of the cursor
 * @param input.character - 0-based column of the cursor
 * @param input.newName - the new name
 * @returns the edits of each file the rename touches; empty where the server throws
 */
export function renameSchema(input: z.infer<typeof RenameSchemaInput>) {
  return askServer('rename', [], () => {
    const workspace = makeWorkspace(input)
    const edit = quietly(() =>
      languageServer().handlers.handleRenameRequest(workspace.schema, workspace.document, {
        ...positionParams(workspace, input),
        newName: input.newName,
      }),
    )
    return fileEdits(workspace, edit?.changes)
  })
}

const CodeActionsSchemaInput = z
  .object({
    files: SchemaFiles,
    path: EditedPath,
    text: EditedText,
    range: ActionRange,
    diagnostics: ShownDiagnostics,
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

// The Prisma formatter also completes relations (the opposite field, `fields` / `references`),
// which the language server reports as errors without offering a fix. When formatting the text
// removes errors, the formatted text is offered as one.
function formatFix(input: z.infer<typeof CodeActionsSchemaInput>, workspace: Workspace) {
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

/**
 * The quick fixes for the diagnostics in the range: the language server's, then the formatter when
 * it fixes errors.
 *
 * ```mermaid
 * flowchart LR
 *   in[files + edited text + range + diagnostics] --> ls[(Prisma language server)]
 *   ls -->|handleCodeActions| actions[the server's quick fixes]
 *   ls -->|"handleDocumentFormatting, fewer errors after"| format[Format with Prisma]
 *   actions & format --> out[actions with edits per file]
 *   ls -->|"throws (UnknownError)"| log["logDebug: could not list the code actions"] --> empty["[]"]
 * ```
 *
 * @param input.files - the loaded schema files
 * @param input.path - the file the text belongs to, or null for a lone in-memory document
 * @param input.text - the text as typed
 * @param input.range - the range the actions are asked for
 * @param input.diagnostics - the diagnostics the editor shows in the range
 * @returns each action's title, edits per file and whether it is preferred; empty where the
 *   server throws
 */
export function codeActionsSchema(input: z.infer<typeof CodeActionsSchemaInput>) {
  return askServer('list the code actions', [], () => {
    const workspace = makeWorkspace(input)
    const actions = quietly(() =>
      languageServer().handlers.handleCodeActions(workspace.schema, workspace.document, {
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
  })
}
