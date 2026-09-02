import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { PlayIcon } from '../../components/icons.js'
import { ResultTable } from '../../components/result-table.js'
import { getDbCountsQueryKey, useDb, usePostDbSql } from '../../hooks/index.js'
import { errorMessage } from '../../lib/error.js'
import { loadString, saveString } from '../../lib/storage.js'

const SQL_KEY = 'hekireki-studio:sql'

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
        <h1 className="m-0 text-[22px] font-bold tracking-tight">SQL</h1>
        <span className="text-[15px] text-muted">
          {database?.connected
            ? `${database.dialect ?? ''} · ${database.url ?? ''}`
            : 'No database connected'}
        </span>
        <span className="ml-auto text-[12.5px] text-faint">⌘/Ctrl + Enter to run</span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={run.isPending || !database?.connected}
          onClick={execute}
        >
          <PlayIcon size={14} />
          Run
        </button>
      </header>
      {database && !database.connected ? (
        <div className="error-box m-6">
          {database.error ?? 'Start Studio with --url <connection string> or set DATABASE_URL.'}
        </div>
      ) : null}
      <textarea
        className="min-h-[160px] w-full resize-y border-b border-line bg-surface px-6 py-4 font-mono text-[13px] leading-[1.6] text-ink outline-none"
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
        <div className="error-box m-6">{errorMessage(run.error)}</div>
      ) : result === null ? (
        <div className="p-6 text-muted">Results will appear here.</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-line bg-surface-2 px-6 py-2 text-xs text-muted">
            {result.columns.length > 0
              ? `${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'}`
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
