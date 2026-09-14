// The Prisma Client editor's language features: the call coloured by its own grammar, and
// completed and explained by the project's own TypeScript through the Studio API (the way the
// schema editor relays the Prisma language server), with the schema's models and fields as the
// completion when the project has no TypeScript 5 to ask.
import { parseResponse } from 'hono/client'
import { editor, languages, MarkerSeverity, Range } from 'monaco-editor/editor/editor.api.js'

import { client } from '../../lib/index.js'
import { contextAt, suggestionsAt } from './completion.js'
import type { CompletionModel } from './completion.js'
import { completionKindOf, suggestionKindOf } from './kinds.js'
import { QUERY_LANGUAGE_CONFIGURATION, QUERY_LANGUAGE_ID, QUERY_MONARCH } from './query-monarch.js'

export const CLIENT_MARKER_OWNER = 'hekireki-client'

type Offsets = { readonly start: number; readonly end: number }

// The providers are registered once for the language; they read whichever editor is mounted.
const registry: { models: readonly CompletionModel[]; typesAvailable: boolean } = {
  models: [],
  typesAvailable: false,
}

// What each completion item was asked about, for the detail lookup when it is highlighted.
const asked = new WeakMap<
  languages.CompletionItem,
  { readonly query: string; readonly offset: number }
>()

export function bindClientEditor(context: {
  readonly models: readonly CompletionModel[]
  readonly typesAvailable: boolean
}) {
  registry.models = context.models
  registry.typesAvailable = context.typesAvailable
}

function toRange(model: editor.ITextModel, offsets: Offsets) {
  const start = model.getPositionAt(offsets.start)
  const end = model.getPositionAt(offsets.end)
  return new Range(start.lineNumber, start.column, end.lineNumber, end.column)
}

function wordRange(model: editor.ITextModel, position: { lineNumber: number; column: number }) {
  const word = model.getWordUntilPosition(position)
  return new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
}

/** A request the API refused (no TypeScript 5, a broken schema) leaves the editor without the feature, not with an error. */
async function quietly<T>(request: Promise<T>) {
  try {
    return await request
  } catch {
    return null
  }
}

function completionProvider(): languages.CompletionItemProvider {
  return {
    triggerCharacters: ['.', '{', ',', '"', "'"],
    provideCompletionItems: async (model, position) => {
      const query = model.getValue()
      const offset = model.getOffsetAt(position)
      const range = wordRange(model, position)
      if (!registry.typesAvailable) {
        const at = contextAt(query, offset)
        if (at === null) return null
        const suggestions = suggestionsAt(at, registry.models).map(
          (suggestion): languages.CompletionItem => ({
            label: suggestion.label,
            detail: suggestion.detail,
            kind: languages.CompletionItemKind[suggestionKindOf(suggestion.kind)],
            insertText: suggestion.label,
            range,
          }),
        )
        return { suggestions }
      }
      if (query.trim() === '') return null
      const found = await quietly(
        parseResponse(client.client.complete.$post({ json: { query, offset } })),
      )
      if (found === null) return null
      const suggestions = found.items.map((item): languages.CompletionItem => {
        const suggestion: languages.CompletionItem = {
          label: item.label,
          kind: languages.CompletionItemKind[completionKindOf(item.kind)],
          insertText: item.insertText ?? item.label,
          sortText: item.sortText,
          range,
        }
        asked.set(suggestion, { query, offset })
        return suggestion
      })
      return { suggestions }
    },
    resolveCompletionItem: async (item) => {
      const context = asked.get(item)
      if (context === undefined) return item
      const label = typeof item.label === 'string' ? item.label : item.label.label
      const detail = await quietly(
        parseResponse(client.client.complete.detail.$post({ json: { ...context, name: label } })),
      )
      if (detail === null) return item
      return {
        ...item,
        detail: detail.detail ?? undefined,
        documentation: detail.documentation === null ? undefined : { value: detail.documentation },
      }
    },
  }
}

function hoverProvider(): languages.HoverProvider {
  return {
    provideHover: async (model, position) => {
      if (!registry.typesAvailable) return null
      const query = model.getValue()
      if (query.trim() === '') return null
      const hover = await quietly(
        parseResponse(
          client.client.hover.$post({ json: { query, offset: model.getOffsetAt(position) } }),
        ),
      )
      if (hover?.contents === null || hover?.contents === undefined) return null
      return {
        contents: [{ value: hover.contents }],
        range: hover.range === null ? wordRange(model, position) : toRange(model, hover.range),
      }
    },
  }
}

function signatureHelpProvider(): languages.SignatureHelpProvider {
  return {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [')'],
    provideSignatureHelp: async (model, position) => {
      if (!registry.typesAvailable) return null
      const query = model.getValue()
      if (query.trim() === '') return null
      const help = await quietly(
        parseResponse(
          client.client.signature.$post({ json: { query, offset: model.getOffsetAt(position) } }),
        ),
      )
      if (help === null || help.signatures.length === 0) return null
      return {
        value: {
          signatures: help.signatures.map((signature) => ({
            label: signature.label,
            documentation:
              signature.documentation === null ? undefined : { value: signature.documentation },
            parameters: signature.parameters.map((parameter) => ({
              label: parameter.label,
              documentation:
                parameter.documentation === null ? undefined : { value: parameter.documentation },
            })),
          })),
          activeSignature: help.activeSignature,
          activeParameter: help.activeParameter,
        },
        dispose: () => undefined,
      }
    },
  }
}

export type ClientMarker = {
  readonly message: string
  readonly severity: 'error' | 'warning' | 'info'
  readonly range: Offsets
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
    CLIENT_MARKER_OWNER,
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

/** Registers the providers of the Prisma Client editor; safe to call repeatedly. */
export function setupClientEditor() {
  if (state.ready) return
  state.ready = true
  languages.register({ id: QUERY_LANGUAGE_ID })
  languages.setMonarchTokensProvider(QUERY_LANGUAGE_ID, QUERY_MONARCH)
  languages.setLanguageConfiguration(QUERY_LANGUAGE_ID, QUERY_LANGUAGE_CONFIGURATION)
  languages.registerCompletionItemProvider(QUERY_LANGUAGE_ID, completionProvider())
  languages.registerHoverProvider(QUERY_LANGUAGE_ID, hoverProvider())
  languages.registerSignatureHelpProvider(QUERY_LANGUAGE_ID, signatureHelpProvider())
}
