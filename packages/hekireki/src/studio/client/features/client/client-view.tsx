import { Button, Kbd, Tooltip } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { InferResponseType } from 'hono/client'
import type { editor as MonacoEditor } from 'monaco-editor/editor/editor.api.js'
import { useCallback, useMemo, useState } from 'react'
import { LuCopy, LuPlay, LuWandSparkles } from 'react-icons/lu'

import type { clientClient, dbClient } from '../../api/index.js'
import { ConfirmDialog } from '../../components/confirm-dialog.js'
import { DiagnosticsList } from '../../components/diagnostics-list.js'
import { SplitPane } from '../../components/split-pane.js'
import { useCopy } from '../../hooks/copy.js'
import { useDebounced } from '../../hooks/debounce.js'
import { useClient, useDb, usePostClientRun, useSchema } from '../../hooks/index.js'
import { SchemaCanvas } from '../schema/schema-view.js'
import { ClientEditor } from './client-editor.js'
import { readAnalysis, useClientAnalysis, useClientPreview, useTypeCheck } from './queries.js'
import { ResultPane } from './result-pane.js'
import { touchedHighlight } from './touched.js'

// How the page is shared out: the editor above its result and SQL, and the schema the whole
// height of the other side, to be looked at while the call is written.
const PANES_KEY = 'hekireki-studio:client-panes'
const EDITOR_KEY = 'hekireki-studio:client-editor-height'
const ANALYZE_DEBOUNCE_MS = 250

/** Why the SQL tab shows no fresh SQL for the call, or null when it can. */
function sqlNoteOf(state: {
  readonly available: boolean
  readonly empty: boolean
  readonly problems: boolean
  readonly hasWrite: boolean
}) {
  if (!state.available) return 'The Prisma Client is not available.'
  if (state.empty && !state.problems) return 'Type a call to see the SQL it sends.'
  if (state.problems) return 'Fix the problems to update the SQL: this is what the call last sent.'
  return state.hasWrite ? 'A write shows its SQL when it is run.' : null
}

/** What the editor's status bar says about the text: being read, being checked, what was found. */
function editorStateOf(state: {
  readonly query: string
  readonly failed: boolean
  readonly analyzing: boolean
  readonly checking: boolean
  readonly problems: number
}) {
  if (state.query.trim() === '') return ''
  if (state.failed) return 'The analysis failed.'
  if (state.analyzing) return 'Analyzing…'
  if (state.checking) return 'Checking types…'
  if (state.problems === 0) return 'No problems'
  return `${state.problems} ${state.problems === 1 ? 'problem' : 'problems'}`
}

/** Where the Prisma Client comes from and what it talks to, after the line count. */
function clientSummaryOf(
  status: { readonly available: boolean; readonly source: string | null } | null,
  database: { readonly dialect: string | null; readonly url: string | null } | null,
) {
  if (status === null) return ' · loading the Prisma Client…'
  if (!status.available) return ' · Prisma Client not available'
  return ` · ${status.source ?? 'generated'} · ${database?.dialect ?? ''} ${database?.url ?? ''}`.trimEnd()
}

type Call = {
  readonly model: string
  readonly operation: string
  readonly write: boolean
  readonly range: { readonly start: number; readonly end: number }
}

/** The calls the text makes, and what is going on with it, under the editor. */
function EditorStatus({
  state,
  calls,
  transaction,
}: {
  readonly state: string
  readonly calls: readonly Call[]
  readonly transaction: boolean
}) {
  if (state === '') return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-surface-2 px-4 py-1.5 text-code">
      {calls.length > 0 ? (
        <span className="heading mb-0">{transaction ? '$transaction' : 'Call'}</span>
      ) : null}
      {calls.map((call) => (
        <span
          key={`${call.range.start}-${call.range.end}`}
          className={`pill ${call.write ? 'border-warn text-warn' : 'border-line bg-canvas text-muted'}`}
        >
          {call.model}.{call.operation}
          {call.write ? ' · write' : ''}
        </span>
      ))}
      <output aria-label="Editor status" className="ml-auto text-faint">
        {state}
      </output>
    </div>
  )
}

/** The schema the whole height of the page, the models the call touches lit up. */
function SchemaPane({
  schema,
  touched,
}: {
  readonly schema: Parameters<typeof SchemaCanvas>[0]['schema'] | null
  readonly touched: ReturnType<typeof touchedHighlight>
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2 text-code text-muted">
        <span className="heading mb-0">Schema</span>
        <span className="truncate">
          {touched === null
            ? 'Every model; the ones a call touches light up as you type.'
            : `${touched.size} ${touched.size === 1 ? 'model' : 'models'} touched · the fields the call names are marked`}
        </span>
      </div>
      <SchemaBody schema={schema} touched={touched} />
    </div>
  )
}

function SchemaBody({
  schema,
  touched,
}: {
  readonly schema: Parameters<typeof SchemaCanvas>[0]['schema'] | null
  readonly touched: ReturnType<typeof touchedHighlight>
}) {
  if (schema === null) return null
  if (schema.models.length === 0) {
    return <div className="p-6 text-muted">No models in the schema.</div>
  }
  return <SchemaCanvas schema={schema} focus={null} touched={touched} compact />
}

type Schema = Parameters<typeof SchemaCanvas>[0]['schema']
type Status = InferResponseType<typeof clientClient.client.$get, 200>
type Database = InferResponseType<typeof dbClient.db.$get, 200>
type RunResult = InferResponseType<typeof clientClient.client.run.$post, 200>

/** Whether the project's TypeScript is there to check and complete the call. */
function hasTypes(status: Status | null) {
  return status !== null && status.typescript !== null
}

/** The models as completion reads them when there are no types to ask. */
function completionModels(schema: Schema | null) {
  return (schema?.models ?? []).map((model) => ({
    name: model.name,
    fields: model.fields.map((field) => ({
      name: field.name,
      type: field.type,
      kind: field.kind,
      isList: field.isList,
    })),
  }))
}

/**
 * The call as it settles: read, type-checked, and what both found — what the reading refuses
 * first, since it stops the run, with TypeScript saying the same thing in its own words underneath.
 */
function useCheckedCall(query: string, typesAvailable: boolean, schema: Schema | null) {
  const settled = useDebounced(query, ANALYZE_DEBOUNCE_MS)
  const analysis = useClientAnalysis(settled)
  const typeCheck = useTypeCheck(settled, typesAvailable)
  const stale = settled !== query
  const diagnostics = useMemo(() => analysis.data?.diagnostics ?? [], [analysis.data])
  const markers = useMemo(
    () => [
      ...diagnostics.map((diagnostic) => ({ ...diagnostic, severity: 'error' as const })),
      ...(stale ? [] : (typeCheck.data?.diagnostics ?? [])),
    ],
    [diagnostics, typeCheck.data, stale],
  )
  const touched = useMemo(
    () =>
      schema === null || settled.trim() === ''
        ? null
        : touchedHighlight(analysis.data?.touched ?? [], schema.models),
    [schema, settled, analysis.data],
  )
  // What is going on with the text, in the editor's status bar: being read, being checked, and
  // what was found. The run says how it is going in the result pane.
  const state = editorStateOf({
    query,
    failed: analysis.isError,
    analyzing: stale || analysis.isFetching,
    checking: typeCheck.isFetching,
    problems: markers.length,
  })
  return {
    settled,
    markers,
    touched,
    state,
    calls: analysis.data?.calls ?? [],
    transaction: analysis.data?.transaction === true,
    checking: stale || analysis.isFetching || typeCheck.isFetching,
  }
}

/**
 * The SQL tab shows what the call in the editor sends, kept up to date whichever tab is open:
 * what it sent, when it has run as it stands; otherwise what a read sends, from running the
 * settled text once it is read and checked without a problem. A write waits for Run and its
 * confirmation.
 */
function useSqlView(view: {
  readonly settled: string
  readonly result: RunResult | null
  readonly ranQuery: string | undefined
  readonly checking: boolean
  readonly note: string | null
  readonly problems: boolean
}) {
  const ran = view.result !== null && view.ranQuery === view.settled
  const preview = useClientPreview(view.settled, !ran && !view.checking && view.note === null)
  if (ran) return { data: view.result, error: null, note: null, stale: false, updating: false }
  return {
    data: preview.data ?? null,
    error: preview.isError ? preview.error : null,
    note: view.note,
    stale: view.problems,
    updating: view.checking || preview.isFetching,
  }
}

/** The page's title bar: where the client comes from, and Format, Copy and Run. */
function ClientHeader({
  query,
  status,
  database,
  copied,
  running,
  onFormat,
  onCopy,
  onRun,
}: {
  readonly query: string
  readonly status: Status | null
  readonly database: Database | null
  readonly copied: boolean
  readonly running: boolean
  readonly onFormat: () => void
  readonly onCopy: () => void
  readonly onRun: () => void
}) {
  return (
    <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3">
      <h1 className="page-title">Prisma Client</h1>
      <span className="min-w-0 text-lead [overflow-wrap:anywhere] text-muted">
        {query.split('\n').length} lines
        {clientSummaryOf(status, database)}
      </span>
      <span className="ml-auto flex items-center gap-1.5 text-code text-faint">
        <Kbd>⌘/Ctrl</Kbd>
        <Kbd>Enter</Kbd>
        to run
      </span>
      <Tooltip>
        <Button variant="ghost" onPress={onFormat}>
          <LuWandSparkles size={15} />
          Format
        </Button>
        <Tooltip.Content>Format with the TypeScript formatter (Shift+Alt+F)</Tooltip.Content>
      </Tooltip>
      <Button variant="ghost" onPress={onCopy}>
        <LuCopy size={15} />
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <Button variant="primary" isDisabled={running || status?.available !== true} onPress={onRun}>
        <LuPlay size={14} />
        Run
      </Button>
    </header>
  )
}

/** Asks before the writes a call makes are run. */
function WritesDialog({
  writes,
  running,
  onConfirm,
  onCancel,
}: {
  readonly writes: readonly Call[] | null
  readonly running: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}) {
  const count = writes?.length ?? 0
  return (
    <ConfirmDialog
      isOpen={writes !== null}
      title={`Run ${writes?.length === 1 ? 'a write' : `${count} writes`}?`}
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
      isPending={running}
      onConfirm={onConfirm}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    />
  )
}

/**
 * The Prisma Client page: a call typed as the application would write it, run through the
 * project's own generated client, its result beside the models it touches and the SQL it sends.
 */
export function ClientView() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const database = useDb().data ?? null
  const schema = useSchema().data?.schema ?? null
  const status = useClient().data ?? null
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'result' | 'sql'>('result')
  const [asJson, setAsJson] = useState(false)
  const [asSent, setAsSent] = useState(false)
  const [picked, setPicked] = useState<{ readonly start: number; readonly end: number } | null>(
    null,
  )
  const [editor, setEditor] = useState<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const { copied, copy } = useCopy()

  const typesAvailable = hasTypes(status)
  const { settled, markers, touched, state, calls, transaction, checking } = useCheckedCall(
    query,
    typesAvailable,
    schema,
  )
  const [writes, setWrites] = useState<typeof calls | null>(null)

  const run = usePostClientRun({
    mutation: {
      // A write through the client changes what the model pages show.
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['db', '/db/rows/:modelName'] }),
    },
  })
  const result = run.data ?? null
  const problems = markers.length > 0
  const sql = useSqlView({
    settled,
    result,
    ranQuery: run.variables?.json.query,
    checking,
    note: sqlNoteOf({
      available: status?.available === true,
      empty: calls.length === 0,
      problems,
      hasWrite: calls.some((call) => call.write),
    }),
    problems,
  })

  const models = useMemo(() => completionModels(schema), [schema])

  // Writing the call brings its SQL into view, as it changes; running it brings the result.
  const edit = useCallback((value: string) => {
    setQuery(value)
    setTab('sql')
  }, [])

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

  const editorPane = (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <ClientEditor
          value={query}
          onChange={edit}
          onRun={() => {
            void execute()
          }}
          onReady={setEditor}
          models={models}
          typesAvailable={typesAvailable}
          markers={markers}
          selection={picked}
        />
      </div>
      <EditorStatus state={state} calls={calls} transaction={transaction} />
      <DiagnosticsList diagnostics={markers} onPick={setPicked} />
    </div>
  )

  const viewsPane = (
    <ResultPane
      tab={tab}
      onTab={setTab}
      result={result}
      running={run.isPending}
      error={run.isError ? run.error : null}
      asJson={asJson}
      onAsJson={setAsJson}
      sql={sql}
      asSent={asSent}
      onAsSent={setAsSent}
      dialect={database?.dialect ?? null}
      // The SQL page opens the statement the way it is shown here, with the values it was bound with.
      onOpen={(statement) => {
        void navigate({
          to: '/sql',
          search: {
            sql: asSent ? statement.sql : statement.formatted,
            params: [...statement.params],
          },
        })
      }}
    />
  )

  const workspace = (
    <div className="flex min-h-0 min-w-0 flex-col">
      <ClientHeader
        query={query}
        status={status}
        database={database}
        copied={copied}
        running={run.isPending}
        onFormat={() => {
          void editor?.getAction('editor.action.formatDocument')?.run()
        }}
        onCopy={() => {
          copy(query)
        }}
        onRun={() => {
          void execute()
        }}
      />
      {/* Without the project's TypeScript the editor completes from the schema, and says nothing. */}
      {status !== null && !status.available ? (
        <pre className="error-box m-4 whitespace-pre-wrap">{status.error}</pre>
      ) : null}
      <SplitPane
        direction="column"
        storageKey={EDITOR_KEY}
        defaultRatio={0.4}
        label="Resize the editor"
        first={editorPane}
        second={viewsPane}
      />
    </div>
  )

  return (
    <section className="flex min-h-0 flex-1 overflow-hidden">
      <SplitPane
        direction="row"
        storageKey={PANES_KEY}
        defaultRatio={0.58}
        min={0.3}
        max={0.8}
        label="Resize the schema"
        first={workspace}
        second={<SchemaPane schema={schema} touched={touched} />}
      />
      <WritesDialog
        writes={writes}
        running={run.isPending}
        onConfirm={() => {
          setWrites(null)
          send()
        }}
        onCancel={() => {
          setWrites(null)
        }}
      />
    </section>
  )
}
