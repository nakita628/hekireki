import { parseResponse } from 'hono/client'
import { languages } from 'monaco-editor/editor/editor.api.js'

import { client } from '../../lib/index.js'
import { suggestionsAt } from './completion.js'
import { contextAt } from './cursor.js'
import { registry, wordRange } from './editor-state.js'
import { completionKindOf } from './kinds.js'

// What each completion item was asked about, for the detail lookup when it is highlighted.
const asked = new WeakMap<
  languages.CompletionItem,
  { readonly query: string; readonly offset: number }
>()

/**
 * Completion: TypeScript's, through the API, with the type of the highlighted item fetched as
 * its detail; or the schema's models, operations and argument keys when there are no types.
 */
export function completionProvider() {
  return {
    triggerCharacters: ['.', '{', ',', '"', "'"],
    provideCompletionItems: async (model, position) => {
      const query = model.getValue()
      const offset = model.getOffsetAt(position)
      const range = wordRange(model, position)
      if (!registry.typesAvailable) {
        const at = contextAt(query, offset)
        if (at === null) return null
        const suggestions = suggestionsAt(at, registry.models).map((suggestion) => ({
          label: suggestion.label,
          detail: suggestion.detail,
          kind: languages.CompletionItemKind[
            suggestion.kind === 'model'
              ? 'Class'
              : suggestion.kind === 'operation'
                ? 'Method'
                : suggestion.kind === 'argument'
                  ? 'Keyword'
                  : 'Property'
          ],
          insertText: suggestion.label,
          range,
        }))
        return { suggestions }
      }
      if (query.trim() === '') return null
      // A request the API refuses (no TypeScript 5, a broken schema) leaves the editor without
      // the feature, not with an error.
      const found = await parseResponse(
        client.client.complete.$post({ json: { query, offset } }),
      ).catch(() => null)
      if (found === null) return null
      const suggestions = found.items.map((item) => {
        const suggestion = {
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
      const detail = await parseResponse(
        client.client.complete.detail.$post({ json: { ...context, name: label } }),
      ).catch(() => null)
      if (detail === null) return item
      return {
        ...item,
        detail: detail.detail ?? undefined,
        documentation: detail.documentation === null ? undefined : { value: detail.documentation },
      }
    },
  } satisfies languages.CompletionItemProvider
}
