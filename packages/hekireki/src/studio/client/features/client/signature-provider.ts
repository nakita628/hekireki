import { parseResponse } from 'hono/client'
import type { languages } from 'monaco-editor/editor/editor.api.js'

import { client } from '../../lib/index.js'
import { registry } from './editor-state.js'

/** The overloads of the call the cursor is inside, and which parameter it is on. */
export function signatureHelpProvider() {
  return {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [')'],
    provideSignatureHelp: async (model, position) => {
      if (!registry.typesAvailable) return null
      const query = model.getValue()
      if (query.trim() === '') return null
      const help = await parseResponse(
        client.client.signature.$post({ json: { query, offset: model.getOffsetAt(position) } }),
      ).catch(() => null)
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
  } satisfies languages.SignatureHelpProvider
}
