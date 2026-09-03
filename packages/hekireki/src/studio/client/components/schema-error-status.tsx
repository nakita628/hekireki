import { useState } from 'react'

import { schemaProblems } from './schema-problems.js'
import type { PlainFileDiagnostic } from './schema-problems.js'

/**
 * The schema's error state for a header line: a chip with the count and the first message, and
 * a Details toggle that drops Prisma's full report over the page instead of pushing it down, so
 * the editor never moves while typing.
 */
export function SchemaErrorStatus({
  error,
  diagnostics,
}: {
  readonly error: string | null
  /** The same errors as the language server places them */
  readonly diagnostics: readonly PlainFileDiagnostic[]
}) {
  const [open, setOpen] = useState(false)
  if (error === null) return null
  const { count, summary } = schemaProblems({ error, diagnostics })
  return (
    <span className="relative flex min-w-0 items-center gap-2">
      <span
        className="max-w-[28rem] min-w-0 truncate rounded-md bg-danger-soft px-2 py-0.5 text-[12.5px] text-danger"
        title={summary}
      >
        <strong>
          {count} {count === 1 ? 'error' : 'errors'}
        </strong>{' '}
        · {summary}
      </span>
      <button
        type="button"
        className="btn h-7 shrink-0 px-2 text-xs"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        {open ? 'Hide' : 'Details'}
      </button>
      {open ? (
        <pre className="absolute top-full right-0 z-20 m-0 mt-2 max-h-72 w-[min(48rem,80vw)] overflow-auto rounded-lg border border-danger-line bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-ink shadow-lg">
          {error}
        </pre>
      ) : null}
    </span>
  )
}
