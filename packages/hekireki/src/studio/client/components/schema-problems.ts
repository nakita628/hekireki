import type * as z from 'zod'

import type { FileDiagnosticSchema } from '../../server/routes/index.js'

export type PlainFileDiagnostic = z.input<typeof FileDiagnosticSchema>

/**
 * The error state of the snapshot for a header line: how many errors the language server
 * placed, and the first one as a summary. A failure the server placed nothing for (a file
 * that could not be read) counts once, summarised by the first line of the engine message.
 */
export function schemaProblems(input: {
  readonly error: string
  readonly diagnostics: readonly PlainFileDiagnostic[]
}) {
  const errors = input.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  const first = errors[0]
  return {
    count: Math.max(errors.length, 1),
    summary:
      first === undefined
        ? (input.error.split('\n')[0] ?? '').trim()
        : `${first.message} (${first.path}:${first.range.start.line + 1})`,
  }
}
