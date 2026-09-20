import { Button, Kbd, Tooltip } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { editor as MonacoEditor } from 'monaco-editor/editor/editor.api.js'
import { useCallback, useMemo, useState } from 'react'
import { LuCopy, LuPlay, LuWandSparkles } from 'react-icons/lu'

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

  const settled = useDebounced(query, ANALYZE_DEBOUNCE_MS)
  const analysis = useClientAnalysis(settled)
  const calls = analysis.data?.calls ?? []
  const [writes, setWrites] = useState<typeof calls | null>(null)
  const diagnostics = useMemo(() => analysis.data?.diagnostics ?? [], [analysis.data])
  const typesAvailable = status?.typescript !== null && status?.typescript !== undefined
  const typeCheck = useTypeCheck(settled, typesAvailable)
  const stale = settled !== query
  // What the reading refuses comes first: it stops the run, and TypeScript says the same thing
  // in its own words underneath.
  const markers = useMemo(
    () => [
      ...diagnostics.map((diagnostic) => ({ ...diagnostic, severity: 'error' as const })),
      ...(stale ? [] : (typeCheck.data?.diagnostics ?? [])),
    ],
    [diagnostics, typeCheck.data, stale],
  )

  const run = usePostClientRun({
    mutation: {
      // A write through the client changes what the model pages show.
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['db', '/db/rows/:modelName'] }),
    },
  })
  const result = run.data ?? null

  // The SQL tab shows what the call in the editor sends, kept up to date whichever tab is open:
  // what it sent, when it has run as it stands; otherwise what a read sends, from running the
  // settled text once it is read and checked without a problem. A write waits for Run and its
  // confirmation.
  const ran = result !== null && run.variables?.json.query === settled
  const checking = stale || analysis.isFetching || typeCheck.isFetching
  const hasWrite = calls.some((call) => call.write)
  const problems = markers.length > 0
  const sqlNote =
    status?.available !== true
      ? 'The Prisma Client is not available.'
      : calls.length === 0 && !problems
        ? 'Type a call to see the SQL it sends.'
        : problems
          ? 'Fix the problems to update the SQL: this is what the call last sent.'
          : hasWrite
            ? 'A write shows its SQL when it is run.'
            : null
  const preview = useClientPreview(settled, !ran && !checking && sqlNote === null)
  // What is going on with the text, in the editor's status bar: being read, being checked, and
  // what was found. The run says how it is going in the result pane.
  const state =
    query.trim() === ''
      ? ''
      : analysis.isError
        ? 'The analysis failed.'
        : stale || analysis.isFetching
          ? 'Analyzing…'
          : typeCheck.isFetching
            ? 'Checking types…'
            : problems
              ? `${markers.length} ${markers.length === 1 ? 'problem' : 'problems'}`
              : 'No problems'

  const touched = useMemo(
    () =>
      schema === null || settled.trim() === ''
        ? null
        : touchedHighlight(analysis.data?.touched ?? [], schema.models),
    [schema, settled, analysis.data],
  )

  const models = useMemo(
    () =>
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
      {state === '' ? null : (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-surface-2 px-4 py-1.5 text-code">
          {calls.length > 0 ? (
            <span className="heading mb-0">
              {analysis.data?.transaction ? '$transaction' : 'Call'}
            </span>
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
      )}
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
      sql={{
        data: ran ? result : (preview.data ?? null),
        error: ran || !preview.isError ? null : preview.error,
        note: ran ? null : sqlNote,
        stale: !ran && problems,
        updating: !ran && (checking || preview.isFetching),
      }}
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

  const schemaPane = (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2 text-code text-muted">
        <span className="heading mb-0">Schema</span>
        <span className="truncate">
          {touched === null
            ? 'Every model; the ones a call touches light up as you type.'
            : `${touched.size} ${touched.size === 1 ? 'model' : 'models'} touched · the fields the call names are marked`}
        </span>
      </div>
      {schema === null ? null : schema.models.length === 0 ? (
        <div className="p-6 text-muted">No models in the schema.</div>
      ) : (
        <SchemaCanvas schema={schema} focus={null} touched={touched} compact />
      )}
    </div>
  )

  const workspace = (
    <div className="flex min-h-0 min-w-0 flex-col">
      <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3">
        <h1 className="page-title">Prisma Client</h1>
        <span className="min-w-0 text-lead [overflow-wrap:anywhere] text-muted">
          {query.split('\n').length} lines
          {status === null
            ? ' · loading the Prisma Client…'
            : status.available
              ? ` · ${status.source ?? 'generated'} · ${database?.dialect ?? ''} ${database?.url ?? ''}`.trimEnd()
              : ' · Prisma Client not available'}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-code text-faint">
          <Kbd>⌘/Ctrl</Kbd>
          <Kbd>Enter</Kbd>
          to run
        </span>
        <Tooltip>
          <Button
            variant="ghost"
            onPress={() => {
              void editor?.getAction('editor.action.formatDocument')?.run()
            }}
          >
            <LuWandSparkles size={15} />
            Format
          </Button>
          <Tooltip.Content>Format with the TypeScript formatter (Shift+Alt+F)</Tooltip.Content>
        </Tooltip>
        <Button
          variant="ghost"
          onPress={() => {
            copy(query)
          }}
        >
          <LuCopy size={15} />
          {copied ? 'Copied' : 'Copy'}
        </Button>
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
        second={schemaPane}
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
