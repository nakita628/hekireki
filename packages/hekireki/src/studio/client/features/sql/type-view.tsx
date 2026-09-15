import { Button } from '@heroui/react'
import type { InferResponseType } from 'hono/client'
import { LuCopy } from 'react-icons/lu'

import { copyText } from '../../hooks/copy.js'
import type { client } from '../../lib/index.js'

function formatType(type: string) {
  // `{ a: number; b: string }` → one property per line, the way an editor shows it on hover.
  if (!type.startsWith('{ ') || !type.endsWith(' }')) return type
  const inner = type.slice(2, -2)
  return inner === ''
    ? '{}'
    : `{\n${inner
        .split('; ')
        .map((entry) => `  ${entry}`)
        .join('\n')}\n}`
}

/** The row and parameter types as TypeScript: what `sql('...')` would carry through inferql. */
export function TypeView({
  statement,
}: {
  readonly statement: InferResponseType<typeof client.db.analyze.$post, 200>['statements'][number]
}) {
  const row = formatType(statement.rowType)
  const params = formatType(statement.paramsType)
  const snippet = `type Row = ${row}\n\ntype Params = ${params}`
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-2 flex items-center gap-3">
        <div className="heading mb-0">Inferred types</div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onPress={() => {
            copyText(snippet, 'Types')
          }}
        >
          <LuCopy size={14} />
          Copy
        </Button>
      </div>
      <pre className="m-0 overflow-auto rounded-lg border border-line bg-surface-2 px-4 py-3 font-mono text-code leading-relaxed text-ink">
        <code>
          <span className="tok-keyword">type</span> <span className="tok-definition">Row</span> ={' '}
          {row}
          {'\n\n'}
          <span className="tok-keyword">type</span> <span className="tok-definition">Params</span> ={' '}
          {params}
        </code>
      </pre>
      <p className="mt-3 text-code text-muted">
        {statement.kind === 'select'
          ? 'Row is what a driver hands back for each row; a column that may be NULL carries | null. Params is the tuple (or the object, for named placeholders) the statement binds.'
          : statement.columns.length === 0
            ? 'A write without RETURNING yields no rows, so Row is never; the driver reports the affected count instead.'
            : 'Row is what RETURNING hands back for each written row.'}
      </p>
    </div>
  )
}
