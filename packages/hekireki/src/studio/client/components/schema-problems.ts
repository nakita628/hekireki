/** One diagnostic of a schema file, as the server sends it (0-based, end exclusive). */
export type PlainFileDiagnostic = {
  readonly path: string
  readonly range: {
    readonly start: { readonly line: number; readonly character: number }
    readonly end: { readonly line: number; readonly character: number }
  }
  readonly message: string
  readonly severity: 'error' | 'warning' | 'information' | 'hint'
}

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
