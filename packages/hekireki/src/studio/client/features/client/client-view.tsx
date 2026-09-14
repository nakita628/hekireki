import { Button, Kbd, Tabs } from '@heroui/react'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { parseResponse } from 'hono/client'
import { useCallback, useMemo, useState } from 'react'
import { LuPlay } from 'react-icons/lu'

import { CodeBlock } from '../../components/code-block.js'
import { ConfirmDialog } from '../../components/confirm-dialog.js'
import { ResultTable } from '../../components/result-table.js'
import { useDebounced } from '../../hooks/debounce.js'
import {
  getClientKey,
  getDbCountsQueryKey,
  useClient,
  useDb,
  usePostClientRun,
  useSchema,
} from '../../hooks/index.js'
import { client } from '../../lib/index.js'
import type { ClientAnalysis, ClientSqlQuery, ClientTypeDiagnostics } from '../../lib/index.js'
import { DiagnosticsList } from '../sql/diagnostics-list.js'
import { SplitPane } from '../sql/split-pane.js'
import { ClientEditor } from './client-editor.js'
import type { CompletionModel } from './completion.js'
import type { ClientMarker } from './monaco-typescript.js'
import { problemMessage, tableOf } from './result.js'
import { Statements } from './statements.js'

const EDITOR_KEY = 'hekireki-studio:client-editor-height'
const ANALYZE_DEBOUNCE_MS = 250

type Tab = 'result' | 'sql'

type Range = { readonly start: number; readonly end: number }

function analysisOptions(query: string) {
  return queryOptions({
    queryKey: [...getClientKey(), '/client/analyze', query] as const,
    queryFn: ({ signal }) =>
      parseResponse(client.client.analyze.$post({ json: { query } }, { init: { signal } })),
  })
}

/** The analysis of exactly this text, from the cache when it is there; null when it cannot be had. */
async function readAnalysis(queryClient: ReturnType<typeof useQueryClient>, query: string) {
  try {
    return await queryClient.query(analysisOptions(query))
  } catch {
    return null
  }
}

function checkOptions(query: string) {
  return queryOptions({
    queryKey: [...getClientKey(), '/client/check', query] as const,
    queryFn: ({ signal }) =>
      parseResponse(client.client.check.$post({ json: { query } }, { init: { signal } })),
  })
}

/** What TypeScript finds wrong with the settled text, once the project has a TypeScript to ask. */
function useTypeCheck(query: string, enabled: boolean) {
  return useQuery({
    ...checkOptions(query),
    enabled: enabled && query.trim() !== '',
    placeholderData: (previous: ClientTypeDiagnostics | undefined) => previous,
  })
}

/** The calls and problems of the text, read by the server once per settled edit. */
function useClientAnalysis(query: string) {
  return useQuery({
    ...analysisOptions(query),
    enabled: query.trim() !== '',
    placeholderData: (previous: ClientAnalysis | undefined) => previous,
  })
}

// The server sends the first rows of a long array; say so rather than showing a wrong total.
function summaryOf(rowCount: number | null, shown: number) {
  if (rowCount === null) return 'one value'
  const rows = `${rowCount.toLocaleString()} ${rowCount === 1 ? 'row' : 'rows'}`
  return shown < rowCount ? `first ${shown.toLocaleString()} of ${rows}` : rows
}

/** Two or more ways to show the same thing, as pills: the one in use is marked. */
function ModeSwitch<Mode extends string>({
  modes,
  selected,
  onSelect,
}: {
  readonly modes: readonly Mode[]
  readonly selected: Mode
  readonly onSelect: (mode: Mode) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={mode === selected}
          className={`pill ${mode === selected ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-canvas text-muted hover:border-accent'}`}
          onClick={() => {
            onSelect(mode)
          }}
        >
          {mode}
        </button>
      ))}
    </div>
  )
}

/**
 * The Prisma Client page: a call typed as the application would write it, run through the
 * project's own generated client, its result beside the SQL the client sent for it.
 */
export function ClientView() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const database = useDb().data ?? null
  const schema = useSchema().data?.schema ?? null
  const status = useClient().data ?? null
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('result')
  const [asJson, setAsJson] = useState(false)
  const [asSent, setAsSent] = useState(false)
  const [writes, setWrites] = useState<readonly ClientAnalysis['calls'][number][] | null>(null)
  const [picked, setPicked] = useState<Range | null>(null)

  const settled = useDebounced(query, ANALYZE_DEBOUNCE_MS)
  const analysis = useClientAnalysis(settled)
  const calls = analysis.data?.calls ?? []
  const diagnostics = useMemo(() => analysis.data?.diagnostics ?? [], [analysis.data])
  const typesAvailable = status?.typescript !== null && status?.typescript !== undefined
  const typeCheck = useTypeCheck(settled, typesAvailable)
  // What the reading refuses comes first: it stops the run, and TypeScript says the same thing
  // in its own words underneath.
  const markers = useMemo(
    (): readonly ClientMarker[] => [
      ...diagnostics.map((diagnostic) => ({ ...diagnostic, severity: 'error' as const })),
      ...(settled === query ? (typeCheck.data?.diagnostics ?? []) : []),
    ],
    [diagnostics, typeCheck.data, settled, query],
  )

  const run = usePostClientRun({
    mutation: {
      // A write through the client changes what the model pages and the sidebar counts show.
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['db', '/db/rows/:modelName'] }),
          queryClient.invalidateQueries({ queryKey: getDbCountsQueryKey() }),
        ]),
    },
  })
  const result = run.data ?? null
  const table = useMemo(() => (result === null ? null : tableOf(result.result)), [result])
  const shown = Array.isArray(result?.result) ? result.result.length : 1

  const models = useMemo(
    (): readonly CompletionModel[] =>
      (schema?.models ?? []).map((model) => ({
        name: model.name,
        fields: model.fields.map((field) => ({
          name: field.name,
          type: field.type,
          kind: field.kind,
          isList: field.isList,
        })),
      })),
    [schema],
  )

  const send = useCallback(() => {
    run.mutate({ json: { query } })
    setTab('result')
  }, [run, query])

  // A write is confirmed first; the text is read again on the spot so a just-typed `delete` is
  // not waved through on the strength of an analysis from before it was typed.
  const execute = useCallback(async () => {
    if (run.isPending || query.trim() === '' || status?.available !== true) return
    const checked = await readAnalysis(queryClient, query)
    const writing = checked?.calls.filter((call) => call.write) ?? []
    if (writing.length > 0) {
      setWrites(writing)
      return
    }
    send()
  }, [run.isPending, query, status, queryClient, send])

  // The SQL page opens the statement the way it is shown here, with the values it was bound with.
  const openInSql = useCallback(
    (statement: ClientSqlQuery) => {
      void navigate({
        to: '/sql',
        search: {
          sql: asSent ? statement.sql : statement.formatted,
          params: [...statement.params],
        },
      })
    },
    [navigate, asSent],
  )

  const editorPane = (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <ClientEditor
          value={query}
          onChange={setQuery}
          onRun={() => {
            void execute()
          }}
          models={models}
          typesAvailable={typesAvailable}
          markers={markers}
          selection={picked}
        />
      </div>
      {calls.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-surface-2 px-4 py-1.5 text-code">
          <span className="heading mb-0">
            {analysis.data?.transaction ? '$transaction' : 'Call'}
          </span>
          {calls.map((call) => (
            <span
              key={`${call.range.start}-${call.range.end}`}
              className={`pill ${call.write ? 'border-warn text-warn' : 'border-line bg-canvas text-muted'}`}
            >
              {call.model}.{call.operation}
              {call.write ? ' · write' : ''}
            </span>
          ))}
        </div>
      ) : null}
      <DiagnosticsList
        diagnostics={markers.map(({ message, range, severity }) => ({
          message,
          range,
          severity: severity === 'info' ? ('info' as const) : severity,
        }))}
        onPick={setPicked}
      />
    </div>
  )

  const viewsPane = (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-1.5">
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => {
            setTab(key === 'sql' ? 'sql' : 'result')
          }}
        >
          <Tabs.ListContainer className="w-fit">
            <Tabs.List aria-label="Views of the call">
              <Tabs.Tab id="result">Result</Tabs.Tab>
              <Tabs.Tab id="sql" className="whitespace-nowrap">
                SQL{result === null ? '' : ` · ${result.queries.length}`}
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        {tab === 'result' && table !== null ? (
          <ModeSwitch
            modes={['Table', 'JSON']}
            selected={asJson ? 'JSON' : 'Table'}
            onSelect={(mode) => {
              setAsJson(mode === 'JSON')
            }}
          />
        ) : null}
        {tab === 'sql' && result !== null && result.queries.length > 0 ? (
          <ModeSwitch
            modes={['Formatted', 'As sent']}
            selected={asSent ? 'As sent' : 'Formatted'}
            onSelect={(mode) => {
              setAsSent(mode === 'As sent')
            }}
          />
        ) : null}
        {result === null ? null : (
          <span className="ml-auto text-code text-faint">
            {summaryOf(result.rowCount, shown)} · {result.durationMs} ms · {result.queries.length}{' '}
            {result.queries.length === 1 ? 'statement' : 'statements'}
          </span>
        )}
      </div>
      {run.isError ? (
        <pre className="error-box m-4 whitespace-pre-wrap">{problemMessage(run.error)}</pre>
      ) : result === null ? (
        <div className="p-6 text-muted">
          Run the call to see what it returns and the SQL the Prisma Client sends for it.
        </div>
      ) : tab === 'sql' ? (
        <Statements
          queries={result.queries}
          dialect={database?.dialect ?? null}
          asSent={asSent}
          onOpen={openInSql}
        />
      ) : table !== null && !asJson ? (
        <ResultTable columns={table.columns} rows={table.rows} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <CodeBlock code={JSON.stringify(result.result, null, 2)} />
        </div>
      )}
    </div>
  )

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3">
        <h1 className="page-title">Prisma Client</h1>
        <span className="text-lead text-muted">
          {status === null
            ? 'Loading the Prisma Client…'
            : status.available
              ? `${status.source ?? 'generated'} · ${database?.dialect ?? ''} ${database?.url ?? ''}`.trimEnd()
              : 'Prisma Client not available'}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-code text-faint">
          <Kbd>⌘/Ctrl</Kbd>
          <Kbd>Enter</Kbd>
          to run
        </span>
        <Button
          variant="primary"
          isDisabled={run.isPending || status?.available !== true}
          onPress={() => {
            void execute()
          }}
        >
          <LuPlay size={14} />
          Run
        </Button>
      </header>
      {status !== null && !status.available ? (
        <pre className="error-box m-4 whitespace-pre-wrap">{status.error}</pre>
      ) : status !== null && status.typesError !== null ? (
        <pre className="m-4 mb-0 rounded-lg border border-line bg-surface-2 px-4 py-3 font-mono text-code whitespace-pre-wrap text-muted">
          {status.typesError}
        </pre>
      ) : null}
      <SplitPane
        direction="column"
        storageKey={EDITOR_KEY}
        defaultRatio={0.4}
        label="Resize the editor"
        first={editorPane}
        second={viewsPane}
      />
      <ConfirmDialog
        isOpen={writes !== null}
        title={`Run ${writes?.length === 1 ? 'a write' : `${writes?.length ?? 0} writes`}?`}
        detail={
          <div className="flex flex-col gap-2">
            <span>This changes the database through the Prisma Client:</span>
            <ul className="m-0 list-disc pl-5 font-mono text-code">
              {(writes ?? []).map((call) => (
                <li key={`${call.range.start}-${call.range.end}`}>
                  {call.model}.{call.operation}
                </li>
              ))}
            </ul>
          </div>
        }
        confirmLabel="Run"
        isPending={run.isPending}
        onConfirm={() => {
          setWrites(null)
          send()
        }}
        onOpenChange={(open) => {
          if (!open) setWrites(null)
        }}
      />
    </section>
  )
}
