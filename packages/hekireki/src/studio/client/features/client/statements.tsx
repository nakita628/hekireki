import { Button } from '@heroui/react'
import { LuTerminal } from 'react-icons/lu'

import { CodeBlock } from '../../components/code-block.js'
import { CopyButton } from '../../components/copy-button.js'
import type { ClientSqlQuery } from '../../lib/index.js'

type Dialect = 'postgresql' | 'mysql' | 'sqlite' | null

function placeholderOf(dialect: Dialect, index: number) {
  return dialect === 'postgresql' ? `$${index + 1}` : `?${index + 1}`
}

/**
 * The statements the Prisma Client sent for a call, in order, each with the values bound to its
 * placeholders and the time the database took — laid out a clause per line, or exactly as sent —
 * and a way to take it to the SQL page, where it can be edited, explained and run on its own.
 */
export function Statements({
  queries,
  dialect,
  asSent,
  onOpen,
}: {
  readonly queries: readonly ClientSqlQuery[]
  readonly dialect: Dialect
  /** Whether to show each statement on one line, as the driver received it. */
  readonly asSent: boolean
  readonly onOpen: (query: ClientSqlQuery) => void
}) {
  if (queries.length === 0) {
    return <div className="p-6 text-muted">The call sent no statement to the database.</div>
  }
  return (
    <ol className="m-0 min-h-0 flex-1 list-none overflow-auto p-0">
      {queries.map((query, index) => (
        // The statements carry no identity of their own; their order is what they are.
        // oxlint-disable-next-line react/no-array-index-key
        <li key={index} className="border-b border-line px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-code text-muted">
            <span className="font-bold text-ink">#{index + 1}</span>
            <span>{query.durationMs} ms</span>
            {query.params.length > 0 ? (
              <span>
                {query.params.length} {query.params.length === 1 ? 'parameter' : 'parameters'}
              </span>
            ) : null}
            <span className="ml-auto flex items-center gap-1">
              <CopyButton
                text={asSent ? query.sql : query.formatted}
                what={`statement ${index + 1}`}
              />
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  onOpen(query)
                }}
              >
                <LuTerminal size={14} />
                Open in SQL
              </Button>
            </span>
          </div>
          {asSent ? (
            <CodeBlock code={query.sql} language="sql" className="break-all whitespace-pre-wrap" />
          ) : (
            <CodeBlock code={query.formatted} language="sql" />
          )}
          {query.params.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-caption">
              {query.params.map((value, position) => (
                <span
                  // The values are positional: the placeholder is their key.
                  // oxlint-disable-next-line react/no-array-index-key
                  key={position}
                  className="pill gap-1.5 border-line bg-canvas text-muted"
                >
                  <span className="text-ink">{placeholderOf(dialect, position)}</span>
                  <span className="max-w-[320px] truncate">{JSON.stringify(value)}</span>
                </span>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
