import { Button } from '@heroui/react'
import { LuRefreshCw } from 'react-icons/lu'

type PlanNode = {
  readonly id: string
  readonly parent: string | null
  readonly label: string
  readonly detail: string | null
  readonly cost: number | null
  readonly rows: number | null
}

type Plan = { readonly dialect: string; readonly nodes: readonly PlanNode[]; readonly raw: string }

function PlanTree({
  nodes,
  parent,
  depth,
}: {
  readonly nodes: readonly PlanNode[]
  readonly parent: string | null
  readonly depth: number
}) {
  const children = nodes.filter((node) => node.parent === parent)
  if (children.length === 0) return null
  return (
    <ul className="m-0 list-none p-0">
      {children.map((node) => (
        <li key={node.id}>
          <div
            className="flex items-baseline gap-3 border-b border-line py-1.5 font-mono text-code"
            style={{ paddingLeft: `${depth * 18 + 16}px` }}
          >
            <span className="text-faint">{depth === 0 ? '▸' : '└'}</span>
            <span className="text-ink">{node.label}</span>
            {node.detail === null ? null : (
              <span className="min-w-0 truncate text-muted" title={node.detail}>
                {node.detail}
              </span>
            )}
            <span className="ml-auto flex shrink-0 gap-3 text-caption text-faint">
              {node.rows === null ? null : <span>rows {node.rows.toLocaleString()}</span>}
              {node.cost === null ? null : <span>cost {node.cost.toLocaleString()}</span>}
            </span>
          </div>
          <PlanTree nodes={nodes} parent={node.id} depth={depth + 1} />
        </li>
      ))}
    </ul>
  )
}

/** The execution plan the database chose, as a tree, with the raw output underneath. */
export function PlanView({
  plan,
  pending,
  error,
  onExplain,
}: {
  readonly plan: Plan | null
  readonly pending: boolean
  readonly error: string | null
  readonly onExplain: () => void
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
        <span className="text-code text-muted">
          {plan === null
            ? 'What the database will do to answer the first statement.'
            : `${plan.dialect} · ${plan.nodes.length} ${plan.nodes.length === 1 ? 'step' : 'steps'}`}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          isDisabled={pending}
          onPress={onExplain}
        >
          <LuRefreshCw size={14} />
          Explain
        </Button>
      </div>
      {error !== null ? <div className="error-box m-4">{error}</div> : null}
      {plan === null ? null : (
        <>
          <PlanTree nodes={plan.nodes} parent={null} depth={0} />
          <details className="px-4 py-3">
            <summary className="cursor-pointer text-code text-muted">Raw output</summary>
            <pre className="mt-2 overflow-auto rounded-lg border border-line bg-surface-2 px-4 py-3 font-mono text-code text-ink">
              {plan.raw}
            </pre>
          </details>
        </>
      )}
    </div>
  )
}
