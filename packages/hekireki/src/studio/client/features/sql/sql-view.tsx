import { Button, Kbd } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { LuPlay } from 'react-icons/lu'

import { ResultTable } from '../../components/result-table.js'
import { getDbCountsQueryKey, useDb, usePostDbSql } from '../../hooks/index.js'
import { loadString, saveString } from '../../lib/index.js'

const SQL_KEY = 'hekireki-studio:sql'

// The server sends only the first page of a large result, so the count of what matched and the
// number of rows on screen can differ; say so rather than showing a wrong total.
function rowSummary(shown: number, matched: number) {
  const rows = `${matched.toLocaleString()} ${matched === 1 ? 'row' : 'rows'}`
  return shown < matched ? `first ${shown.toLocaleString()} of ${rows}` : rows
}

export function SqlView() {
  const queryClient = useQueryClient()
  const database = useDb().data ?? null
  const [sql, setSql] = useState(() => loadString(SQL_KEY) ?? 'SELECT 1')
  const run = usePostDbSql({
    mutation: {
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['db', '/db/rows/:modelName'] }),
          queryClient.invalidateQueries({ queryKey: getDbCountsQueryKey() }),
        ]),
    },
  })
  const result = run.data ?? null

  const execute = () => {
    if (run.isPending || sql.trim() === '') return
    saveString(SQL_KEY, sql)
    run.mutate({ json: { sql } })
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3.5">
        <h1 className="page-title">SQL</h1>
        <span className="text-lead text-muted">
          {database?.connected
            ? `${database.dialect ?? ''} · ${database.url ?? ''}`
            : 'No database connected'}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-code text-faint">
          <Kbd>⌘/Ctrl</Kbd>
          <Kbd>Enter</Kbd>
          to run
        </span>
        <Button
          variant="primary"
          isDisabled={run.isPending || !database?.connected}
          onPress={execute}
        >
          <LuPlay size={14} />
          Run
        </Button>
      </header>
      {database && !database.connected ? (
        <div className="error-box m-6">
          {database.error ?? 'Start Studio with --url <connection string> or set DATABASE_URL.'}
        </div>
      ) : null}
      <textarea
        className="min-h-[160px] w-full resize-y border-b border-line bg-surface px-6 py-4 font-mono text-body leading-[1.6] text-ink outline-none"
        spellCheck={false}
        value={sql}
        onChange={(event) => {
          setSql(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            execute()
          }
        }}
      />
      {run.isError ? (
        <div className="error-box m-6">The statement could not be run.</div>
      ) : result === null ? (
        <div className="p-6 text-muted">Results will appear here.</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-line bg-surface-2 px-6 py-2 text-code text-muted">
            {result.columns.length > 0
              ? rowSummary(result.rows.length, result.rowCount)
              : `${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'} affected`}{' '}
            · {result.durationMs} ms
          </div>
          {result.columns.length > 0 ? (
            <ResultTable columns={result.columns} rows={result.rows} />
          ) : null}
        </div>
      )}
    </section>
  )
}
