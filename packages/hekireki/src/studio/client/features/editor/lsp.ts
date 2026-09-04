// What the Studio server relays from the Prisma language server, named the way Monaco names it.
// Nothing is interpreted here: LSP numbers become Monaco enum names, LSP severities Monaco's.
// The wire shapes: the brands the server puts on checked lines and columns do not apply to
// what the editor sends and receives.
export type PlainPosition = { readonly line: number; readonly character: number }

export type PlainRange = { readonly start: PlainPosition; readonly end: PlainPosition }

export type PlainDiagnostic = {
  readonly range: PlainRange
  readonly message: string
  readonly severity: 'error' | 'warning' | 'information' | 'hint'
}

/** One completion the Prisma language server offers. */
export type Completion = {
  readonly label: string
  readonly kind: number | null
  readonly detail: string | null
  readonly documentation: string | null
  readonly insertText: string
  readonly insertTextFormat: 'plainText' | 'snippet'
  readonly sortText: string | null
}

/** The LSP CompletionItemKind values by number, named as Monaco names them. */
export const LSP_COMPLETION_KINDS = [
  'Text',
  'Text',
  'Method',
  'Function',
  'Constructor',
  'Field',
  'Variable',
  'Class',
  'Interface',
  'Module',
  'Property',
  'Unit',
  'Value',
  'Enum',
  'Keyword',
  'Snippet',
  'Color',
  'File',
  'Reference',
  'Folder',
  'EnumMember',
  'Constant',
  'Struct',
  'Event',
  'Operator',
  'TypeParameter',
] as const

type CompletionKindName = (typeof LSP_COMPLETION_KINDS)[number]

export function completionKindName(kind: number | null): CompletionKindName {
  return (kind === null ? undefined : LSP_COMPLETION_KINDS[kind]) ?? 'Text'
}

/** The LSP SymbolKind values by number, named as Monaco names them. */
export const LSP_SYMBOL_KINDS = [
  'File',
  'File',
  'Module',
  'Namespace',
  'Package',
  'Class',
  'Method',
  'Property',
  'Field',
  'Constructor',
  'Enum',
  'Interface',
  'Function',
  'Variable',
  'Constant',
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'Key',
  'Null',
  'EnumMember',
  'Struct',
  'Event',
  'Operator',
  'TypeParameter',
] as const

type SymbolKindName = (typeof LSP_SYMBOL_KINDS)[number]

export function symbolKindName(kind: number): SymbolKindName {
  return LSP_SYMBOL_KINDS[kind] ?? 'File'
}

type EditorCompletion = {
  readonly label: string
  readonly kind: CompletionKindName
  readonly detail: string | null
  readonly documentation: string | null
  readonly insertText: string
  readonly isSnippet: boolean
  readonly sortText: string
}

/** The server's completions in the server's order: an item without a sort key keeps its place. */
export function toCompletions(items: readonly Completion[]): readonly EditorCompletion[] {
  return items.map((item, index) => ({
    label: item.label,
    kind: completionKindName(item.kind),
    detail: item.detail,
    documentation: item.documentation,
    insertText: item.insertText,
    isSnippet: item.insertTextFormat === 'snippet',
    sortText: item.sortText ?? String(index).padStart(4, '0'),
  }))
}

/** The LSP severities as Monaco's MarkerSeverity names them. */
export const MARKER_SEVERITIES = {
  error: 'Error',
  warning: 'Warning',
  information: 'Info',
  hint: 'Hint',
} as const

type MarkerSeverityName = (typeof MARKER_SEVERITIES)[keyof typeof MARKER_SEVERITIES]

export type EditorMarker = {
  readonly range: PlainRange
  readonly message: string
  readonly severity: MarkerSeverityName
}

/** Diagnostics as markers: the range stays LSP's, the severity takes Monaco's name. */
export function toMarkers(diagnostics: readonly PlainDiagnostic[]): readonly EditorMarker[] {
  return diagnostics.map((diagnostic) => ({
    // An empty range is invisible; give it one character so the squiggle shows.
    range:
      diagnostic.range.start.line === diagnostic.range.end.line &&
      diagnostic.range.start.character === diagnostic.range.end.character
        ? {
            start: diagnostic.range.start,
            end: { line: diagnostic.range.end.line, character: diagnostic.range.end.character + 1 },
          }
        : diagnostic.range,
    message: diagnostic.message,
    severity: MARKER_SEVERITIES[diagnostic.severity],
  }))
}
