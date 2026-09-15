// The Prisma Client editor's language: the call coloured by its own grammar, and completed and
// explained by the project's own TypeScript through the Studio API (the way the schema editor
// relays the Prisma language server), with the schema's models and fields as the completion
// when the project has no TypeScript 5 to ask.
import { editor, languages, MarkerSeverity } from 'monaco-editor/editor/editor.api.js'

import { completionProvider } from './complete-provider.js'
import { toRange } from './editor-state.js'
import { formattingProvider } from './format-provider.js'
import { hoverProvider } from './hover-provider.js'
import { QUERY_LANGUAGE_CONFIGURATION, QUERY_LANGUAGE_ID, QUERY_MONARCH } from './query-monarch.js'
import { signatureHelpProvider } from './signature-provider.js'

const MARKER_OWNER = 'hekireki-client'

export type ClientMarker = {
  readonly message: string
  readonly severity: 'error' | 'warning' | 'info'
  readonly range: { readonly start: number; readonly end: number }
}

const SEVERITIES = {
  error: MarkerSeverity.Error,
  warning: MarkerSeverity.Warning,
  info: MarkerSeverity.Info,
} as const

/** Puts the problems on the model as squiggles: what the reading found, and what TypeScript found. */
export function applyClientMarkers(model: editor.ITextModel, markers: readonly ClientMarker[]) {
  const length = model.getValueLength()
  editor.setModelMarkers(
    model,
    MARKER_OWNER,
    markers.map((marker) => {
      const start = Math.max(0, Math.min(marker.range.start, length))
      // An empty range (the text ends too soon) still marks the character before it.
      const end = Math.max(start, Math.min(marker.range.end, length))
      const range = toRange(
        model,
        end > start ? { start, end } : { start: Math.max(0, start - 1), end: Math.max(start, 1) },
      )
      return {
        message: marker.message,
        severity: SEVERITIES[marker.severity],
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn,
      }
    }),
  )
}

const state = { ready: false }

/** Registers the language and the providers of the Prisma Client editor; safe to call repeatedly. */
export function setupClientEditor() {
  if (state.ready) return
  state.ready = true
  languages.register({ id: QUERY_LANGUAGE_ID })
  languages.setMonarchTokensProvider(QUERY_LANGUAGE_ID, QUERY_MONARCH)
  languages.setLanguageConfiguration(QUERY_LANGUAGE_ID, QUERY_LANGUAGE_CONFIGURATION)
  languages.registerCompletionItemProvider(QUERY_LANGUAGE_ID, completionProvider())
  languages.registerHoverProvider(QUERY_LANGUAGE_ID, hoverProvider())
  languages.registerSignatureHelpProvider(QUERY_LANGUAGE_ID, signatureHelpProvider())
  languages.registerDocumentFormattingEditProvider(QUERY_LANGUAGE_ID, formattingProvider())
}
