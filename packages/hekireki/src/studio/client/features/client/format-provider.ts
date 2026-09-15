import { parseResponse } from 'hono/client'
import type { languages } from 'monaco-editor/editor/editor.api.js'

import { client } from '../../lib/index.js'
import { quietly } from './editor-state.js'

/** Format Document: the query laid out by the TypeScript formatter, replacing the whole text. */
export function formattingProvider() {
  return {
    displayName: 'TypeScript',
    provideDocumentFormattingEdits: async (model) => {
      const query = model.getValue()
      if (query.trim() === '') return []
      const formatted = await quietly(
        parseResponse(client.client.format.$post({ json: { query } })),
      )
      if (formatted === null || formatted.text === query) return []
      return [{ range: model.getFullModelRange(), text: formatted.text }]
    },
  } satisfies languages.DocumentFormattingEditProvider
}
