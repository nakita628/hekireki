import { useState } from 'react'

import { schemaProblems } from './schema-problems.js'
import type { PlainFileDiagnostic } from './schema-problems.js'

/**
 * One line for a broken schema, with Prisma's full report behind a toggle so the page below
 * (the editor, the diagram) keeps its room.
 */
export function SchemaErrorBanner({
  error,
  diagnostics,
  note,
  action,
}: {
  readonly error: string
  /** The same errors as the language server places them */
  readonly diagnostics: readonly PlainFileDiagnostic[]
  /** What the page shows meanwhile, e.g. that the diagram is the last valid version. */
  readonly note: string
  readonly action?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { count, summary } = schemaProblems({ error, diagnostics })
  return (
    <div className="border-b border-danger-line bg-danger-soft text-body text-danger">
      <div className="flex min-w-0 items-center gap-3 px-6 py-1.5">
        <strong className="shrink-0">
          {count} {count === 1 ? 'error' : 'errors'}
        </strong>
        <span className="min-w-0 flex-1 truncate text-ink" title={summary}>
          {summary}
        </span>
        <span className="hidden shrink-0 text-muted md:inline">{note}</span>
        {action}
        <button
          type="button"
          className="btn h-6 shrink-0 px-2 text-code"
          aria-expanded={open}
          onClick={() => {
            setOpen((current) => !current)
          }}
        >
          {open ? 'Hide' : 'Details'}
        </button>
      </div>
      {open ? (
        <pre className="m-0 max-h-48 overflow-auto border-t border-danger-line px-6 py-2 font-mono text-code whitespace-pre-wrap text-ink">
          {error}
        </pre>
      ) : null}
    </div>
  )
}
