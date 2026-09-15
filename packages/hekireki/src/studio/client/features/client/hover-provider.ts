import { parseResponse } from 'hono/client'
import type { languages } from 'monaco-editor/editor/editor.api.js'

import { client } from '../../lib/index.js'
import { registry, toRange, wordRange } from './editor-state.js'

/** What TypeScript says about the symbol under the pointer, as Markdown. */
export function hoverProvider() {
  return {
    provideHover: async (model, position) => {
      if (!registry.typesAvailable) return null
      const query = model.getValue()
      if (query.trim() === '') return null
      const hover = await parseResponse(
        client.client.hover.$post({ json: { query, offset: model.getOffsetAt(position) } }),
      ).catch(() => null)
      if (hover?.contents === null || hover?.contents === undefined) return null
      return {
        contents: [{ value: hover.contents }],
        range: hover.range === null ? wordRange(model, position) : toRange(model, hover.range),
      }
    },
  } satisfies languages.HoverProvider
}
