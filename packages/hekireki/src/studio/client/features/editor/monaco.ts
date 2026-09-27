// The Monaco build Studio ships: the editor core, the features the schema editor uses and the
// Prisma language, bundled by Vite. Nothing is fetched from a CDN, so Studio works offline.
// Every language feature is a Monaco provider that relays the Prisma language server's answer
// through the Studio API; the providers only translate LSP shapes into Monaco's.
import { loader } from '@monaco-editor/react'
// oxlint-disable-next-line import/no-namespace -- the React wrapper takes the whole Monaco API object
import * as monacoApi from 'monaco-editor/editor/editor.api.js'
import {
  editor,
  KeyCode,
  KeyMod,
  languages,
  MarkerSeverity,
  Position,
  Range,
  Uri,
} from 'monaco-editor/editor/editor.api.js'
// oxlint-disable-next-line import/default -- Vite's `?worker` module has a default export the resolver cannot see
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

// oxlint-disable-next-line import/no-unassigned-import -- registers the editor features for their side effects
import './monaco-features.js'
import type { Theme } from '../../lib/index.js'
import { symbolKindName, toCompletions, toMarkers } from './lsp.js'
import type { Completion, PlainDiagnostic, PlainRange } from './lsp.js'
import {
  PRISMA_LANGUAGE_CONFIGURATION,
  PRISMA_LANGUAGE_ID,
  PRISMA_MONARCH,
} from './prisma-monarch.js'

const monaco = { editor, languages, KeyCode, KeyMod, MarkerSeverity, Position, Range, Uri }

// The wire shapes of what the server returns for a text: brands do not survive JSON.
type PlainHover = { readonly contents: string | null; readonly range: PlainRange | null }

export type PlainSymbol = {
  readonly name: string
  readonly kind: number
  readonly range: PlainRange
  readonly selectionRange: PlainRange
}

type PlainTextEdit = { readonly range: PlainRange; readonly newText: string }

/** A place in one of the schema files. */
type LspLocation = {
  readonly path: string
  readonly range: PlainRange
  readonly selection: PlainRange
}

/** One place a symbol is used. */
type LspReference = { readonly path: string; readonly range: PlainRange }

/** The edits of one file. */
type LspFileEdit = { readonly path: string; readonly edits: readonly PlainTextEdit[] }

/** One quick fix the language server offers. */
type CodeAction = {
  readonly title: string
  readonly changes: readonly LspFileEdit[]
  readonly isPreferred: boolean
}

/** A request about the text of a file. */
type TextRequest = {
  readonly text: string
  readonly path: string
}

/** A request about a position in the edited file. */
type PositionRequest = TextRequest & {
  readonly line: number
  readonly character: number
}

/** What the editor asks the Studio server for; the view wires these to the API. */
export type EditorServices = {
  readonly complete: (
    request: PositionRequest & { readonly triggerCharacter: string | null },
  ) => Promise<readonly Completion[]>
  readonly hover: (request: PositionRequest) => Promise<PlainHover>
  readonly definition: (request: PositionRequest) => Promise<readonly LspLocation[]>
  readonly references: (request: PositionRequest) => Promise<readonly LspReference[]>
  readonly rename: (
    request: PositionRequest & { readonly newName: string },
  ) => Promise<readonly LspFileEdit[]>
  readonly codeActions: (
    request: TextRequest & {
      readonly range: PlainRange
      readonly diagnostics: readonly PlainDiagnostic[]
    },
  ) => Promise<readonly CodeAction[]>
  readonly lint: (request: TextRequest) => Promise<readonly PlainDiagnostic[]>
  readonly symbols: (request: TextRequest) => Promise<readonly PlainSymbol[]>
  readonly format: (request: TextRequest) => Promise<readonly PlainTextEdit[]>
  /** Opens another schema file at a line: a definition or reference that lives elsewhere. */
  readonly openLocation: (path: string, line: number, column: number) => void
  /** Writes another schema file that a rename or quick fix edited. */
  readonly save: (path: string, content: string) => void
}

const MARKER_OWNER = 'prisma'
const EDITOR_FONT =
  'ui-monospace, SF Mono, Menlo, Consolas, Liberation Mono, DejaVu Sans Mono, monospace'

/**
 * What the operating system would rather you had typed. macOS turns two spaces into a period and
 * a space, straight quotes into curly ones, two hyphens into a dash; it does that to a
 * `<textarea>`, which is what drives Monaco here (`editContext` below turns the space bar back
 * on, and a textarea is what that costs). None of it belongs in a schema: a period is not what
 * the space bar was pressed for, and a curly quote is a parse error.
 *
 * Each arrives as one `insertText` carrying the substituted text, so each is answered with what
 * the keys actually said.
 */
const SUBSTITUTIONS: Readonly<Record<string, string>> = {
  '. ': ' ',
  '\u201C': '"',
  '\u201D': '"',
  '\u2018': "'",
  '\u2019': "'",
  '\u2013': '-',
  '\u2014': '-',
  '\u2026': '...',
}

/**
 * Refuses those substitutions on the editor's input area and types what was meant instead.
 *
 * @param code - the editor whose input area to watch
 * @returns how to stop watching it
 */
export function refuseTextSubstitutions(code: editor.IStandaloneCodeEditor) {
  const area = code.getDomNode()?.querySelector('textarea.inputarea')
  if (!(area instanceof HTMLTextAreaElement)) return () => undefined
  const refuse = (event: Event) => {
    if (!(event instanceof InputEvent) || event.inputType !== 'insertText') return
    const meant = event.data === null ? undefined : SUBSTITUTIONS[event.data]
    if (meant === undefined) return
    // The substitution replaces what is already there, so cancelling it leaves that alone; what
    // the key press was worth goes in through Monaco, with its undo and its auto-closing.
    event.preventDefault()
    code.trigger('keyboard', 'type', { text: meant })
  }
  area.addEventListener('beforeinput', refuse, { capture: true })
  return () => {
    area.removeEventListener('beforeinput', refuse, { capture: true })
  }
}

export const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  // Monaco 0.56 defaults its input to the experimental `EditContext`, which drives a plain
  // `<div class="native-edit-context">` — no `contenteditable`, no textarea. In Chromium a letter
  // reaches it as a `beforeinput`, and the space bar does not: the key arrives, nothing cancels
  // it, and no text is ever inserted. Typing `model User` in the schema editor writes `modelUser`.
  // The textarea this turns back on is the input path Monaco used for a decade.
  editContext: false,
  fontFamily: EDITOR_FONT,
  fontSize: 12.5,
  lineHeight: 20,
  tabSize: 2,
  insertSpaces: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: 'line',
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: true,
  wordBasedSuggestions: 'off',
  quickSuggestions: { other: true, comments: false, strings: false },
  // Enter takes the highlighted item when there is something left to finish, and breaks the line
  // when there is not. The list is open for most of a schema — every type and every attribute is
  // a completion — so plain `on` would swallow the newline at the end of a line that is already
  // written out: `title String` would take `String` and stay put. `smart` only takes an item that
  // changes the line, which is the difference between finishing a word and ending it.
  acceptSuggestionOnEnter: 'smart',
  suggest: { showWords: false, preview: true },
  bracketPairColorization: { enabled: false },
  guides: { bracketPairs: false, indentation: true },
  stickyScroll: { enabled: false },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
  fixedOverflowWidgets: true,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  renderWhitespace: 'none',
}

const PALETTE = {
  light: {
    surface: '#ffffff',
    ink: '#16181f',
    muted: '#6b7084',
    faint: '#9a9fb3',
    line: '#e4e6ee',
    lineStrong: '#cfd3e0',
    accent: '#4f46e5',
    accentSoft: '#eef0ff',
    keyword: '#4f46e5',
    type: '#0f766e',
    blockName: '#16181f',
    annotation: '#b45309',
    string: '#15803d',
    number: '#0e7490',
    comment: '#9a9fb3',
    docComment: '#6b7084',
    fn: '#0369a1',
    danger: '#c2410c',
    warning: '#d97706',
  },
  dark: {
    surface: '#171a23',
    ink: '#e6e8ef',
    muted: '#9aa0b4',
    faint: '#6b7189',
    line: '#262b38',
    lineStrong: '#343a4a',
    accent: '#7c74ff',
    accentSoft: '#24264a',
    keyword: '#a5a0ff',
    type: '#5eead4',
    blockName: '#e6e8ef',
    annotation: '#fbbf24',
    string: '#86efac',
    number: '#67e8f9',
    comment: '#6b7189',
    docComment: '#9aa0b4',
    fn: '#7dd3fc',
    danger: '#fb923c',
    warning: '#fbbf24',
  },
} as const

function themeData(theme: Theme): editor.IStandaloneThemeData {
  const c = PALETTE[theme]
  return {
    base: theme === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: c.keyword.slice(1), fontStyle: 'bold' },
      { token: 'type', foreground: c.type.slice(1) },
      { token: 'type.identifier', foreground: c.blockName.slice(1), fontStyle: 'bold' },
      { token: 'annotation', foreground: c.annotation.slice(1) },
      { token: 'string', foreground: c.string.slice(1) },
      { token: 'string.quote', foreground: c.string.slice(1) },
      { token: 'string.escape', foreground: c.number.slice(1) },
      { token: 'string.invalid', foreground: c.danger.slice(1) },
      { token: 'number', foreground: c.number.slice(1) },
      { token: 'comment', foreground: c.comment.slice(1), fontStyle: 'italic' },
      { token: 'comment.doc', foreground: c.docComment.slice(1), fontStyle: 'italic' },
      { token: 'function', foreground: c.fn.slice(1) },
      { token: 'identifier', foreground: c.ink.slice(1) },
      // A Prisma Client call: the client, its model delegate, the argument keys, the literals.
      { token: 'variable.predefined', foreground: c.annotation.slice(1) },
      { token: 'member', foreground: c.blockName.slice(1), fontStyle: 'bold' },
      { token: 'key', foreground: c.type.slice(1) },
      { token: 'keyword.literal', foreground: c.keyword.slice(1) },
      { token: 'operator', foreground: c.muted.slice(1) },
      { token: 'delimiter', foreground: c.muted.slice(1) },
    ],
    colors: {
      'editor.background': c.surface,
      'editor.foreground': c.ink,
      'editorGutter.background': c.surface,
      'editorLineNumber.foreground': c.faint,
      'editorLineNumber.activeForeground': c.muted,
      'editor.lineHighlightBackground': `${c.accentSoft}99`,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': c.accentSoft,
      'editor.inactiveSelectionBackground': `${c.accentSoft}99`,
      'editorCursor.foreground': c.accent,
      'editorIndentGuide.background1': c.line,
      'editorIndentGuide.activeBackground1': c.lineStrong,
      'editorBracketMatch.background': c.accentSoft,
      'editorBracketMatch.border': c.lineStrong,
      'editorWidget.background': c.surface,
      'editorWidget.border': c.lineStrong,
      'editorHoverWidget.background': c.surface,
      'editorHoverWidget.border': c.lineStrong,
      'editorSuggestWidget.background': c.surface,
      'editorSuggestWidget.border': c.lineStrong,
      'editorSuggestWidget.selectedBackground': c.accentSoft,
      'editorSuggestWidget.selectedForeground': c.ink,
      'editorSuggestWidget.highlightForeground': c.accent,
      'editorSuggestWidget.focusHighlightForeground': c.accent,
      'editorError.foreground': c.danger,
      'editorWarning.foreground': c.warning,
      'scrollbarSlider.background': `${c.lineStrong}66`,
      'scrollbarSlider.hoverBackground': `${c.lineStrong}aa`,
      'scrollbarSlider.activeBackground': `${c.lineStrong}cc`,
      'editorOverviewRuler.border': '#00000000',
      focusBorder: c.accent,
      'input.background': c.surface,
      'input.border': c.lineStrong,
      'list.hoverBackground': `${c.accentSoft}99`,
      'quickInput.background': c.surface,
      'peekView.border': c.accent,
      'peekViewEditor.background': c.surface,
      'peekViewResult.background': c.surface,
      'peekViewTitle.background': c.surface,
      'widget.shadow': theme === 'dark' ? '#00000066' : '#16181f1a',
    },
  }
}

export function themeName(theme: Theme) {
  return theme === 'dark' ? 'hekireki-dark' : 'hekireki-light'
}

// The providers are registered once per language; they read the services and the file of
// whichever editor is mounted through this registry. The other loaded files have models too,
// so definitions, references and renames reach across files; `paths` maps their URIs back.
const registry: {
  services: EditorServices | null
  path: string
  readonly paths: Map<string, string>
  readonly synced: Map<string, string>
  readonly watched: Set<string>
} = { services: null, path: '', paths: new Map(), synced: new Map(), watched: new Set() }

function pathOf(uri: Uri) {
  return registry.paths.get(uri.toString()) ?? null
}

export function bindEditorContext(context: {
  readonly services: EditorServices
  readonly path: string
}) {
  registry.services = context.services
  registry.path = context.path
}

/**
 * Gives every loaded file a model, so the language features can point into them, and keeps
 * the models of the files that are not being edited at their disk content. A model that was
 * changed in the editor (a rename reaching into another file) is left alone until its save
 * comes back through the snapshot.
 */
export function syncFileModels(
  files: readonly { readonly path: string; readonly content: string }[],
  activePath: string,
) {
  for (const file of files) {
    const uri = Uri.parse(file.path)
    const key = uri.toString()
    registry.paths.set(key, file.path)
    const model = editor.getModel(uri) ?? editor.createModel(file.content, PRISMA_LANGUAGE_ID, uri)
    if (!registry.watched.has(key)) {
      registry.watched.add(key)
      model.onDidChangeContent(() => {
        // The edited file saves through the editor's own onChange; the others through here.
        if (file.path !== registry.path) registry.services?.save(file.path, model.getValue())
      })
    }
    const untouched = model.getValue() === (registry.synced.get(key) ?? model.getValue())
    if (file.path !== activePath && untouched && model.getValue() !== file.content) {
      model.setValue(file.content)
    }
    registry.synced.set(key, file.content)
  }
}

function requestAt(model: editor.ITextModel, position: Position): PositionRequest {
  return {
    text: model.getValue(),
    path: registry.path,
    line: position.lineNumber - 1,
    character: position.column - 1,
  }
}

function toRange(range: PlainRange) {
  return new Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1,
  )
}

function fromRange(range: Range): PlainRange {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
  }
}

function wordRange(model: editor.ITextModel, position: Position) {
  const word = model.getWordUntilPosition(position)
  return new Range(position.lineNumber, word.startColumn, position.lineNumber, position.column)
}

/** The column the `@` or `@@` in front of the word starts at, when there is one. */
function attributeStart(model: editor.ITextModel, lineNumber: number, startColumn: number) {
  const before = model.getValueInRange(new Range(lineNumber, 1, lineNumber, startColumn))
  const marker = /@{1,2}$/u.exec(before)
  return marker === null ? startColumn : startColumn - marker[0].length
}

/**
 * What one completion replaces. An attribute item carries its own `@`, so the range has to reach
 * back over the one already typed: Monaco takes a suggestion on Enter only when it would change
 * the line, and it measures that by the length of what is replaced. A range that stops after the
 * `@` makes `@unique` look like a change to `unique`, so Enter takes a suggestion that writes the
 * same text back and swallows the newline it was pressed for.
 */
function rangeFor(model: editor.ITextModel, position: Position, insertText: string) {
  const word = model.getWordUntilPosition(position)
  const startColumn = insertText.startsWith('@')
    ? attributeStart(model, position.lineNumber, word.startColumn)
    : word.startColumn
  return new Range(position.lineNumber, startColumn, position.lineNumber, position.column)
}

function wholeWordRange(model: editor.ITextModel, position: Position) {
  const word = model.getWordAtPosition(position)
  return word
    ? new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
    : undefined
}

function completionProvider(): languages.CompletionItemProvider {
  return {
    // The characters the Prisma VS Code extension triggers on.
    triggerCharacters: ['@', '"', '.'],
    provideCompletionItems: async (model, position, context) => {
      const items =
        (await registry.services?.complete({
          ...requestAt(model, position),
          triggerCharacter:
            context.triggerKind === languages.CompletionTriggerKind.TriggerCharacter
              ? (context.triggerCharacter ?? null)
              : null,
        })) ?? []
      const suggestions = toCompletions(items).map((item) => ({
        label: item.label,
        kind: languages.CompletionItemKind[item.kind],
        detail: item.detail ?? undefined,
        documentation: item.documentation === null ? undefined : { value: item.documentation },
        insertText: item.insertText,
        insertTextRules: item.isSnippet
          ? languages.CompletionItemInsertTextRule.InsertAsSnippet
          : languages.CompletionItemInsertTextRule.None,
        sortText: item.sortText,
        range: rangeFor(model, position, item.insertText),
      }))
      return { suggestions }
    },
  }
}

function hoverProvider(): languages.HoverProvider {
  return {
    provideHover: async (model, position) => {
      const hover = await registry.services?.hover(requestAt(model, position))
      if (!hover?.contents) return null
      return {
        contents: [{ value: hover.contents }],
        range: hover.range ? toRange(hover.range) : wholeWordRange(model, position),
      }
    },
  }
}

// Every loaded file has a model, so a declaration in another file is a plain location; the
// editor opener below turns opening it into a file switch of the view.
function definitionProvider(): languages.DefinitionProvider {
  return {
    provideDefinition: async (model, position) => {
      const locations = (await registry.services?.definition(requestAt(model, position))) ?? []
      return locations.map((location) => ({
        uri: Uri.parse(location.path),
        range: toRange(location.selection),
      }))
    },
  }
}

function referenceProvider(): languages.ReferenceProvider {
  return {
    provideReferences: async (model, position) => {
      const locations = (await registry.services?.references(requestAt(model, position))) ?? []
      return locations.map((location) => ({
        uri: Uri.parse(location.path),
        range: toRange(location.range),
      }))
    },
  }
}

// The occurrences the word highlighter marks: the language server's references in this file.
function documentHighlightProvider(): languages.DocumentHighlightProvider {
  return {
    provideDocumentHighlights: async (model, position) => {
      const locations = (await registry.services?.references(requestAt(model, position))) ?? []
      return locations
        .filter((location) => Uri.parse(location.path).toString() === model.uri.toString())
        .map((location) => ({
          range: toRange(location.range),
          kind: languages.DocumentHighlightKind.Text,
        }))
    },
  }
}

function workspaceEdits(changes: readonly LspFileEdit[]) {
  return changes.flatMap((change) => {
    const uri = Uri.parse(change.path)
    const model = editor.getModel(uri)
    return model === null
      ? []
      : change.edits.map((edit): languages.IWorkspaceTextEdit => ({
          resource: uri,
          versionId: model.getVersionId(),
          textEdit: { range: toRange(edit.range), text: edit.newText },
        }))
  })
}

function renameProvider(): languages.RenameProvider {
  return {
    provideRenameEdits: async (model, position, newName) => {
      const changes =
        (await registry.services?.rename({ ...requestAt(model, position), newName })) ?? []
      return { edits: workspaceEdits(changes) }
    },
    resolveRenameLocation: (model, position) => {
      const word = model.getWordAtPosition(position)
      if (!word) {
        return {
          range: wordRange(model, position),
          text: '',
          rejectReason: 'Nothing to rename here.',
        }
      }
      return {
        range: new Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn,
        ),
        text: word.word,
      }
    },
  }
}

const DIAGNOSTIC_SEVERITIES = {
  [MarkerSeverity.Error]: 'error',
  [MarkerSeverity.Warning]: 'warning',
  [MarkerSeverity.Info]: 'information',
  [MarkerSeverity.Hint]: 'hint',
} as const

function codeActionProvider(): languages.CodeActionProvider {
  return {
    provideCodeActions: async (model, range, context) => {
      const diagnostics = context.markers.map((marker): PlainDiagnostic => ({
        range: fromRange(
          new Range(
            marker.startLineNumber,
            marker.startColumn,
            marker.endLineNumber,
            marker.endColumn,
          ),
        ),
        message: marker.message,
        severity: DIAGNOSTIC_SEVERITIES[marker.severity],
      }))
      const actions =
        (await registry.services?.codeActions({
          text: model.getValue(),
          path: registry.path,
          range: fromRange(range),
          diagnostics,
        })) ?? []
      return {
        actions: actions.map((action) => ({
          title: action.title,
          kind: 'quickfix',
          isPreferred: action.isPreferred,
          edit: { edits: workspaceEdits(action.changes) },
        })),
        dispose: () => {
          // Nothing to release: the actions hold plain edits.
        },
      }
    },
  }
}

// The formatter answers with one whole-document edit; Monaco reduces it to the changed lines.
function formattingProvider(): languages.DocumentFormattingEditProvider {
  return {
    displayName: 'Prisma',
    provideDocumentFormattingEdits: async (model) => {
      const edits =
        (await registry.services?.format({ text: model.getValue(), path: registry.path })) ?? []
      return edits.map((edit) => ({ range: toRange(edit.range), text: edit.newText }))
    },
  }
}

function documentSymbolProvider(): languages.DocumentSymbolProvider {
  return {
    displayName: 'Prisma',
    provideDocumentSymbols: async (model) => {
      const symbols =
        (await registry.services?.symbols({ text: model.getValue(), path: registry.path })) ?? []
      return symbols.map((symbol) => ({
        name: symbol.name,
        detail: '',
        kind: languages.SymbolKind[symbolKindName(symbol.kind)],
        tags: [],
        range: toRange(symbol.range),
        selectionRange: toRange(symbol.selectionRange),
      }))
    },
  }
}

// "Go to definition" and the peek views open other files through the view, which switches the
// editor to that file at the line.
function editorOpener(): editor.ICodeEditorOpener {
  return {
    openCodeEditor: (_source, resource, selectionOrPosition) => {
      const path = pathOf(resource)
      if (path === null || registry.services === null) return false
      const line =
        selectionOrPosition === undefined
          ? 1
          : 'startLineNumber' in selectionOrPosition
            ? selectionOrPosition.startLineNumber
            : selectionOrPosition.lineNumber
      const column =
        selectionOrPosition === undefined
          ? 1
          : 'startColumn' in selectionOrPosition
            ? selectionOrPosition.startColumn
            : selectionOrPosition.column
      registry.services.openLocation(path, line, column)
      return true
    },
  }
}

/** Puts the diagnostics on the model as squiggles. */
export function applyMarkers(model: editor.ITextModel, diagnostics: readonly PlainDiagnostic[]) {
  editor.setModelMarkers(
    model,
    MARKER_OWNER,
    toMarkers(diagnostics).map((marker): editor.IMarkerData => {
      const range = toRange(marker.range)
      return {
        message: marker.message,
        severity: MarkerSeverity[marker.severity],
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn,
      }
    }),
  )
}

const state = { ready: false }

/** Registers the worker, the Prisma language, the themes and the providers; safe to call repeatedly. */
export function setupMonaco() {
  if (state.ready) return monaco
  state.ready = true
  globalThis.MonacoEnvironment = { getWorker: () => new EditorWorker() }
  loader.config({ monaco: monacoApi })
  languages.register({ id: PRISMA_LANGUAGE_ID, extensions: ['.prisma'] })
  languages.setMonarchTokensProvider(PRISMA_LANGUAGE_ID, PRISMA_MONARCH)
  languages.setLanguageConfiguration(PRISMA_LANGUAGE_ID, PRISMA_LANGUAGE_CONFIGURATION)
  editor.defineTheme(themeName('light'), themeData('light'))
  editor.defineTheme(themeName('dark'), themeData('dark'))
  editor.registerEditorOpener(editorOpener())
  languages.registerCompletionItemProvider(PRISMA_LANGUAGE_ID, completionProvider())
  languages.registerHoverProvider(PRISMA_LANGUAGE_ID, hoverProvider())
  languages.registerDefinitionProvider(PRISMA_LANGUAGE_ID, definitionProvider())
  languages.registerReferenceProvider(PRISMA_LANGUAGE_ID, referenceProvider())
  languages.registerDocumentHighlightProvider(PRISMA_LANGUAGE_ID, documentHighlightProvider())
  languages.registerRenameProvider(PRISMA_LANGUAGE_ID, renameProvider())
  languages.registerCodeActionProvider(PRISMA_LANGUAGE_ID, codeActionProvider())
  languages.registerDocumentFormattingEditProvider(PRISMA_LANGUAGE_ID, formattingProvider())
  languages.registerDocumentSymbolProvider(PRISMA_LANGUAGE_ID, documentSymbolProvider())
  return monaco
}
