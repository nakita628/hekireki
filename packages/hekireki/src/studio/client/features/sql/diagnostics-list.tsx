import { LuCircleAlert, LuInfo, LuTriangleAlert } from 'react-icons/lu'

import type { Diagnostic, Range } from './analysis.js'

const STYLES = {
  error: { className: 'text-danger', icon: LuCircleAlert },
  warning: { className: 'text-warn', icon: LuTriangleAlert },
  info: { className: 'text-muted', icon: LuInfo },
} as const

/** What the analysis found wrong, each one a button that points the editor at it. */
export function DiagnosticsList({
  diagnostics,
  onPick,
}: {
  readonly diagnostics: readonly Diagnostic[]
  readonly onPick: (range: Range | null) => void
}) {
  if (diagnostics.length === 0) return null
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 border-b border-line bg-surface px-4 py-1.5">
      {diagnostics.map((diagnostic, index) => {
        const style = STYLES[diagnostic.severity]
        const Icon = style.icon
        return (
          // Two diagnostics can carry the same text; the position is the only stable key.
          // oxlint-disable-next-line react/no-array-index-key
          <li key={index}>
            <button
              type="button"
              className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left font-mono text-code hover:bg-canvas ${style.className}`}
              onClick={() => {
                onPick(diagnostic.range)
              }}
            >
              <Icon size={13} className="shrink-0" />
              <span className="min-w-0 truncate">{diagnostic.message}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
