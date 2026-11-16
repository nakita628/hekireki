import { Tabs } from '@heroui/react'
import type { InferResponseType } from 'hono/client'
import { useMemo } from 'react'

import type { clientClient } from '../../api/index.js'
import { CodeBlock } from '../../components/code-block.js'
import { ModeSwitch } from '../../components/mode-switch.js'
import { ResultTable } from '../../components/result-table.js'
import { problemMessage, tableOf } from './result.js'
import { Statements } from './statements.js'

type RunResult = InferResponseType<typeof clientClient.client.run.$post, 200>
type Statement = RunResult['queries'][number]
type SqlData = { readonly queries: RunResult['queries']; readonly durationMs: number }
type Table = ReturnType<typeof tableOf>

function statementCount(count: number) {
  return `${count} ${count === 1 ? 'statement' : 'statements'}`
}

/** How many rows came back; the server sends the first rows of a long array, and that is said. */
function rowSummaryOf(result: RunResult) {
  const shown = Array.isArray(result.result) ? result.result.length : 1
  const { rowCount } = result
  if (rowCount === null) return 'one value'
  const rows = `${rowCount.toLocaleString()} ${rowCount === 1 ? 'row' : 'rows'}`
  return shown < rowCount ? `first ${shown.toLocaleString()} of ${rows}` : rows
}

function runStatusOf(running: boolean, result: RunResult | null) {
  if (running) return 'Running…'
  if (result === null) return ''
  return `${rowSummaryOf(result)} · ${result.durationMs} ms · ${statementCount(result.queries.length)}`
}

function sqlStatusOf(updating: boolean, statements: SqlData | null, stale: boolean) {
  if (updating) return 'Updating…'
  if (statements === null || stale) return ''
  return `${statementCount(statements.queries.length)} · ${statements.durationMs} ms`
}

/** The SQL tab: the statements, stepped back under the note while they are an earlier text's. */
function SqlBody({
  statements,
  note,
  stale,
  error,
  dialect,
  asSent,
  onOpen,
}: {
  readonly statements: SqlData | null
  readonly note: string | null
  readonly stale: boolean
  readonly error: unknown
  readonly dialect: 'postgresql' | 'mysql' | 'sqlite' | null
  readonly asSent: boolean
  readonly onOpen: (statement: Statement) => void
}) {
  if (statements === null) {
    if (note !== null) return <div className="p-6 text-muted">{note}</div>
    if (error === null || error === undefined) return null
    return <pre className="error-box m-4 whitespace-pre-wrap">{problemMessage(error)}</pre>
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {stale && note !== null ? (
        <div className="border-b border-line bg-surface-2 px-4 py-1.5 text-code text-muted">
          {note}
        </div>
      ) : null}
      <div
        className={`flex min-h-0 flex-1 flex-col transition-opacity ${stale ? 'opacity-50' : ''}`}
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
}

/** The result tab: why the run was refused, or what it came back with, as a table or as JSON. */
function ResultBody({
  error,
  result,
  table,
  asJson,
}: {
  readonly error: unknown
  readonly result: RunResult | null
  readonly table: Table | null
  readonly asJson: boolean
}) {
  if (error !== null && error !== undefined) {
    return <pre className="error-box m-4 whitespace-pre-wrap">{problemMessage(error)}</pre>
  }
  if (result === null) {
    return <div className="p-6 text-muted">Run the call to see what it returns.</div>
  }
  if (table !== null && !asJson) return <ResultTable columns={table.columns} rows={table.rows} />
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <CodeBlock code={JSON.stringify(result.result, null, 2)} />
    </div>
  )
}

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
  readonly result: InferResponseType<typeof clientClient.client.run.$post, 200> | null
  /** Whether a run is on its way. */
  readonly running: boolean
  /** What the run failed with, when it did. */
  readonly error: unknown
  readonly asJson: boolean
  readonly onAsJson: (asJson: boolean) => void
  readonly sql: {
    readonly data: {
      readonly queries: InferResponseType<typeof clientClient.client.run.$post, 200>['queries']
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
    statement: InferResponseType<typeof clientClient.client.run.$post, 200>['queries'][number],
  ) => void
}) {
  const table = useMemo(() => (result === null ? null : tableOf(result.result)), [result])
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
              {runStatusOf(running, result)}
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
              {sqlStatusOf(sql.updating, statements, sql.stale)}
            </output>
          </>
        )}
      </div>
      {tab === 'sql' ? (
        <SqlBody
          statements={statements}
          note={sql.note}
          stale={sql.stale}
          error={sqlFailed ? sql.error : null}
          dialect={dialect}
          asSent={asSent}
          onOpen={onOpen}
        />
      ) : (
        <ResultBody error={error} result={result} table={table} asJson={asJson} />
      )}
    </div>
  )
}
