import { Tabs } from '@heroui/react'
import type { InferResponseType } from 'hono/client'
import { useMemo } from 'react'

import { CodeBlock } from '../../components/code-block.js'
import { ModeSwitch } from '../../components/mode-switch.js'
import { ResultTable } from '../../components/result-table.js'
import type { client } from '../../lib/index.js'
import { problemMessage, tableOf } from './result.js'
import { Statements } from './statements.js'

/**
 * Under the editor, one tab at a time: what the call came back with, as a table or as JSON (and,
 * when it was refused, why), or the SQL of the call in the editor — what a read sends, from
 * running it as it is typed, and what a write sent once it has run. While the text has a
 * problem, the SQL it last sent stays in view, stepped back.
 */
export function ResultPane({
  tab,
  onTab,
  result,
  running,
  error,
  asJson,
  onAsJson,
  sql,
  asSent,
  onAsSent,
  dialect,
  onOpen,
}: {
  readonly tab: 'result' | 'sql'
  readonly onTab: (tab: 'result' | 'sql') => void
  readonly result: InferResponseType<typeof client.client.run.$post, 200> | null
  /** Whether a run is on its way. */
  readonly running: boolean
  /** What the run failed with, when it did. */
  readonly error: unknown
  readonly asJson: boolean
  readonly onAsJson: (asJson: boolean) => void
  readonly sql: {
    readonly data: {
      readonly queries: InferResponseType<typeof client.client.run.$post, 200>['queries']
      readonly durationMs: number
    } | null
    /** What reading the SQL failed with, when it did. */
    readonly error: unknown
    /** Why the text shows no SQL as it stands, when it does not. */
    readonly note: string | null
    /** Whether `data` is the SQL of an earlier text, kept in view under the note. */
    readonly stale: boolean
    readonly updating: boolean
  }
  readonly asSent: boolean
  readonly onAsSent: (asSent: boolean) => void
  readonly dialect: 'postgresql' | 'mysql' | 'sqlite' | null
  readonly onOpen: (
    statement: InferResponseType<typeof client.client.run.$post, 200>['queries'][number],
  ) => void
}) {
  const table = useMemo(() => (result === null ? null : tableOf(result.result)), [result])
  // The server sends the first rows of a long array; say so rather than showing a wrong total.
  const shown = Array.isArray(result?.result) ? result.result.length : 1
  const rowCount = result?.rowCount ?? null
  const rows =
    rowCount === null
      ? 'one value'
      : `${rowCount.toLocaleString()} ${rowCount === 1 ? 'row' : 'rows'}`
  const summary =
    rowCount !== null && shown < rowCount ? `first ${shown.toLocaleString()} of ${rows}` : rows
  const sqlFailed = sql.error !== null && sql.error !== undefined
  // The statements, when there are some to show: the text's own, or an earlier text's under the note.
  const statements = (sql.note === null || sql.stale) && !sqlFailed ? sql.data : null
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-1.5 text-code">
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => {
            onTab(key === 'sql' ? 'sql' : 'result')
          }}
        >
          <Tabs.ListContainer className="w-fit">
            <Tabs.List aria-label="Views of the call">
              <Tabs.Tab id="result">Result</Tabs.Tab>
              <Tabs.Tab id="sql" className="whitespace-nowrap">
                SQL{statements === null ? '' : ` · ${statements.queries.length}`}
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        {tab === 'result' ? (
          <>
            {table === null ? null : (
              <ModeSwitch
                modes={['Table', 'JSON']}
                selected={asJson ? 'JSON' : 'Table'}
                onSelect={(mode) => {
                  onAsJson(mode === 'JSON')
                }}
              />
            )}
            <output aria-label="Run status" className="ml-auto text-faint">
              {running
                ? 'Running…'
                : result === null
                  ? ''
                  : `${summary} · ${result.durationMs} ms · ${result.queries.length} ${result.queries.length === 1 ? 'statement' : 'statements'}`}
            </output>
          </>
        ) : (
          <>
            {statements === null ? null : (
              <ModeSwitch
                modes={['Formatted', 'As sent']}
                selected={asSent ? 'As sent' : 'Formatted'}
                onSelect={(mode) => {
                  onAsSent(mode === 'As sent')
                }}
              />
            )}
            <output aria-label="SQL status" className="ml-auto text-faint">
              {sql.updating
                ? 'Updating…'
                : statements === null || sql.stale
                  ? ''
                  : `${statements.queries.length} ${statements.queries.length === 1 ? 'statement' : 'statements'} · ${statements.durationMs} ms`}
            </output>
          </>
        )}
      </div>
      {tab === 'sql' ? (
        statements === null ? (
          sql.note !== null ? (
            <div className="p-6 text-muted">{sql.note}</div>
          ) : sqlFailed ? (
            <pre className="error-box m-4 whitespace-pre-wrap">{problemMessage(sql.error)}</pre>
          ) : null
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {sql.stale && sql.note !== null ? (
              <div className="border-b border-line bg-surface-2 px-4 py-1.5 text-code text-muted">
                {sql.note}
              </div>
            ) : null}
            <div
              className={`flex min-h-0 flex-1 flex-col transition-opacity ${sql.stale ? 'opacity-50' : ''}`}
            >
              <Statements
                queries={statements.queries}
                dialect={dialect}
                asSent={asSent}
                onOpen={onOpen}
              />
            </div>
          </div>
        )
      ) : error !== null && error !== undefined ? (
        <pre className="error-box m-4 whitespace-pre-wrap">{problemMessage(error)}</pre>
      ) : result === null ? (
        <div className="p-6 text-muted">Run the call to see what it returns.</div>
      ) : table !== null && !asJson ? (
        <ResultTable columns={table.columns} rows={table.rows} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <CodeBlock code={JSON.stringify(result.result, null, 2)} />
        </div>
      )}
    </div>
  )
}
