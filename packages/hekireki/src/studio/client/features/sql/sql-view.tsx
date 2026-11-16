import { Button, Kbd, Tabs } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { useCallback, useMemo, useState } from 'react'
import { LuPlay } from 'react-icons/lu'

import type { dbClient } from '../../api/index.js'
import { DiagnosticsList } from '../../components/diagnostics-list.js'
import { fieldTypeLabel } from '../../components/labels.js'
import { ResultTable } from '../../components/result-table.js'
import { SplitPane } from '../../components/split-pane.js'
import { useDebounced } from '../../hooks/debounce.js'
import { useDb, usePostDbExplain, usePostDbSql, useSchema } from '../../hooks/index.js'
import { SchemaCanvas } from '../schema/schema-view.js'
import { useAnalysis } from './analysis.js'
import { ColumnsView } from './columns-view.js'
import { FlowView } from './flow-view.js'
import { ParamsPanel } from './params-panel.js'
import { bindValues, paramInputsOf } from './params.js'
import { PlanView } from './plan-view.js'
import { SqlEditor } from './sql-editor.js'
import { TypeView } from './type-view.js'

// How the page is shared out: the editor beside the schema, and the editor above the views.
const PANES_KEY = 'hekireki-studio:sql-panes'
const EDITOR_KEY = 'hekireki-studio:sql-editor-height'
const ANALYZE_DEBOUNCE_MS = 250

type Tab = 'flow' | 'columns' | 'type' | 'result' | 'plan'

// The server sends only the first page of a large result, so the count of what matched and the
// number of rows on screen can differ; say so rather than showing a wrong total.
function rowSummary(shown: number, matched: number) {
  const rows = `${matched.toLocaleString()} ${matched === 1 ? 'row' : 'rows'}`
  return shown < matched ? `first ${shown.toLocaleString()} of ${rows}` : rows
}

function problemDetail(error: unknown) {
  if (error instanceof Error) return error.message
  return 'The statement could not be run.'
}

function statementLabel(
  statement: { readonly text: string; readonly kind: string },
  index: number,
) {
  const first = statement.text.trim().split('\n')[0]?.trim() ?? ''
  const short = first.length > 28 ? `${first.slice(0, 27)}…` : first
  return `${index + 1} · ${short === '' ? statement.kind : short}`
}

/** The tables a statement touches and the columns it reads from each, keyed by lowercased table name. */
function highlightOf(
  statement: {
    readonly tables: readonly { readonly name: string; readonly columnsUsed: readonly string[] }[]
  } | null,
) {
  if (statement === null || statement.tables.length === 0) return null
  const map = new Map<string, Set<string>>()
  for (const table of statement.tables) {
    const key = table.name.toLowerCase()
    const used = map.get(key) ?? new Set<string>()
    for (const column of table.columnsUsed) used.add(column.toLowerCase())
    map.set(key, used)
  }
  return map
}

function tabOf(key: string | number): Tab {
  const name = String(key)
  return name === 'columns' || name === 'type' || name === 'result' || name === 'plan'
    ? name
    : 'flow'
}

type Statement = InferResponseType<typeof dbClient.db.analyze.$post, 200>['statements'][number]
type SqlResult = InferResponseType<typeof dbClient.db.sql.$post, 200>
type Database = InferResponseType<typeof dbClient.db.$get, 200>
type Schema = Parameters<typeof SchemaCanvas>[0]['schema']

/** The parts of the picked statement the panes draw, or nothing while there is none. */
function statementParts(statement: Statement | null) {
  if (statement === null) return { nodes: [], edges: [], diagnostics: [], parameters: [] }
  const { nodes, edges, diagnostics, parameters } = statement
  return { nodes, edges, diagnostics, parameters }
}

/** The editor points at the picked node's clause, or at the diagnostic that was clicked. */
function highlightOfEditor(
  statement: Statement | null,
  selectedNode: string | null,
  pickedRange: { readonly start: number; readonly end: number } | null,
) {
  if (selectedNode === null) return pickedRange
  return statement?.nodes.find((candidate) => candidate.id === selectedNode)?.range ?? null
}

/** What runs: the picked statement when the text holds several, else the whole text. */
function textToRun(sql: string, statement: Statement | null, count: number) {
  return statement === null || count <= 1 ? sql : statement.text
}

function analysisStatusOf(failed: boolean, analyzing: boolean, statement: Statement | null) {
  if (failed) return 'The analysis failed.'
  if (analyzing) return 'Analyzing…'
  return statement === null ? '' : `${statement.kind} · ${statement.nodes.length} nodes`
}

/**
 * Completion and hovers offer the names the database knows — `@@map` / `@map` over the Prisma
 * names — with the Prisma type beside each one.
 */
function editorTables(schema: Schema | null) {
  return (schema?.models ?? []).map((model) => ({
    name: model.dbName ?? model.name,
    detail: `model ${model.name}`,
    columns: model.fields
      .filter((field) => field.kind !== 'object')
      .map((field) => ({ name: field.dbName ?? field.name, detail: fieldTypeLabel(field) })),
  }))
}

function StatementPills({
  statements,
  picked,
  onPick,
}: {
  readonly statements: readonly Statement[]
  readonly picked: number
  readonly onPick: (index: number) => void
}) {
  if (statements.length <= 1) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      {statements.map((entry, index) => (
        <button
          key={`${entry.range.start}-${entry.range.end}`}
          type="button"
          className={`pill ${index === picked ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-canvas text-muted hover:border-accent'}`}
          onClick={() => {
            onPick(index)
          }}
        >
          {statementLabel(entry, index)}
        </button>
      ))}
    </div>
  )
}

/** The result tab: why the run failed, or the rows it read, or how many rows it changed. */
function ResultView({
  failed,
  error,
  result,
}: {
  readonly failed: boolean
  readonly error: unknown
  readonly result: SqlResult | null
}) {
  if (failed) return <div className="error-box m-4">{problemDetail(error)}</div>
  if (result === null) {
    return <div className="p-6 text-muted">Run the statement to see its rows here.</div>
  }
  const reads = result.columns.length > 0
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line bg-surface-2 px-4 py-1.5 text-code text-muted">
        {reads
          ? rowSummary(result.rows.length, result.rowCount)
          : `${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'} affected`}{' '}
        · {result.durationMs} ms
      </div>
      {reads ? <ResultTable columns={result.columns} rows={result.rows} /> : null}
    </div>
  )
}

function SqlHeader({
  database,
  running,
  onRun,
}: {
  readonly database: Database | null
  readonly running: boolean
  readonly onRun: () => void
}) {
  const connected = database?.connected === true
  return (
    <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3">
      <h1 className="page-title">SQL</h1>
      <span className="min-w-0 text-lead [overflow-wrap:anywhere] text-muted">
        {connected ? `${database.dialect ?? ''} · ${database.url ?? ''}` : 'No database connected'}
      </span>
      <span className="ml-auto flex items-center gap-1.5 text-code text-faint">
        <Kbd>⌘/Ctrl</Kbd>
        <Kbd>Enter</Kbd>
        to run
      </span>
      <Button variant="primary" isDisabled={running || !connected} onPress={onRun}>
        <LuPlay size={14} />
        Run
      </Button>
    </header>
  )
}

function SchemaBody({
  schema,
  touched,
}: {
  readonly schema: Schema | null
  readonly touched: ReturnType<typeof highlightOf>
}) {
  if (schema === null) return null
  if (schema.models.length === 0) {
    return <div className="p-6 text-muted">No models in the schema.</div>
  }
  return <SchemaCanvas schema={schema} focus={null} touched={touched} compact />
}

function SchemaPane({
  schema,
  touched,
}: {
  readonly schema: Schema | null
  readonly touched: ReturnType<typeof highlightOf>
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2 text-code text-muted">
        <span className="heading mb-0">Schema</span>
        <span className="truncate">
          {touched === null
            ? 'Every model; the ones a statement touches light up as you type.'
            : `${touched.size} ${touched.size === 1 ? 'table' : 'tables'} touched · the columns read are marked`}
        </span>
      </div>
      <SchemaBody schema={schema} touched={touched} />
    </div>
  )
}

/** The text as it settles, read into statements, and the one picked among them. */
function useStatements(sql: string, index: number) {
  const settled = useDebounced(sql, ANALYZE_DEBOUNCE_MS)
  const analysis = useAnalysis(settled)
  const statements = analysis.data?.statements ?? []
  const statement = statements[Math.min(index, Math.max(0, statements.length - 1))] ?? null
  return { analysis, statements, statement, stale: settled !== sql }
}

/** Says why nothing runs while the database is not connected. */
function NoDatabase({ database }: { readonly database: Database | null }) {
  if (database === null || database.connected) return null
  return (
    <div className="error-box m-4">
      {database.error ?? 'Start Studio with --url <connection string> or set DATABASE_URL.'}
    </div>
  )
}

/** The columns and type tabs, which only have something to show for a statement. */
function StatementDetail({
  tab,
  statement,
  modelOf,
}: {
  readonly tab: Tab
  readonly statement: Statement | null
  readonly modelOf: (table: string) => string | null
}) {
  if (statement === null) return null
  if (tab === 'columns') return <ColumnsView statement={statement} modelOf={modelOf} />
  return tab === 'type' ? <TypeView statement={statement} /> : null
}

/** The SQL page: the editor and what the analysis says on the left, the models it runs against on the right. */
export function SqlView({
  initialSql,
  initialParams,
}: {
  readonly initialSql: string
  readonly initialParams: readonly (string | number | boolean | null)[]
}) {
  const queryClient = useQueryClient()
  const database = useDb().data ?? null
  const schema = useSchema().data?.schema ?? null
  // The editor is empty on every visit, unless a page hands a statement over (the Prisma Client
  // page opens what the client sent, with the values it was bound with).
  const [sql, setSql] = useState(initialSql)
  const [tab, setTab] = useState<Tab>('flow')
  const [statementIndex, setStatementIndex] = useState(0)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [pickedRange, setPickedRange] = useState<{
    readonly start: number
    readonly end: number
  } | null>(null)
  const [paramInputs, setParamInputs] = useState<Readonly<Record<string, string>>>(() =>
    paramInputsOf(initialParams),
  )

  const { analysis, statements, statement, stale } = useStatements(sql, statementIndex)

  const highlight = highlightOfEditor(statement, selectedNode, pickedRange)
  const parts = statementParts(statement)

  const touched = useMemo(() => highlightOf(statement), [statement])

  // The database knows tables; the pages know models. `@@map` is what tells the two apart.
  const modelOf = useCallback(
    (table: string) => {
      const key = table.toLowerCase()
      return (
        schema?.models.find((model) => (model.dbName ?? model.name).toLowerCase() === key)?.name ??
        null
      )
    },
    [schema],
  )

  const run = usePostDbSql({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['db', '/db/rows/:modelName'] }),
    },
  })
  const explain = usePostDbExplain()
  const result = run.data ?? null

  const params = useMemo(
    () => (statement === null ? [] : bindValues(statement.parameters, paramInputs)),
    [statement, paramInputs],
  )

  const execute = useCallback(() => {
    if (run.isPending || sql.trim() === '' || database?.connected !== true) return
    const text = textToRun(sql, statement, statements.length)
    run.mutate({ json: { sql: text, params: [...params] } })
    setTab('result')
  }, [run, sql, database, statement, statements.length, params])

  const runExplain = useCallback(() => {
    if (explain.isPending || sql.trim() === '' || database?.connected !== true) return
    const text = textToRun(sql, statement, statements.length)
    explain.mutate({ json: { sql: text, params: [...params] } })
  }, [explain, sql, database, statement, statements.length, params])

  const onChange = useCallback((value: string) => {
    setSql(value)
  }, [])

  const tables = useMemo(() => editorTables(schema), [schema])

  const editorPane = (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <SqlEditor
          value={sql}
          onChange={onChange}
          onRun={execute}
          dialect={database?.dialect ?? null}
          tables={tables}
          highlight={highlight}
          diagnostics={parts.diagnostics}
        />
      </div>
      <ParamsPanel
        parameters={parts.parameters}
        inputs={paramInputs}
        onChange={(key, value) => {
          setParamInputs((current) => ({ ...current, [key]: value }))
        }}
      />
      <DiagnosticsList
        diagnostics={parts.diagnostics}
        onPick={(range) => {
          setSelectedNode(null)
          setPickedRange(range)
        }}
      />
    </div>
  )

  const viewsPane = (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-1.5">
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => {
            setTab(tabOf(key))
          }}
        >
          <Tabs.ListContainer className="w-fit">
            <Tabs.List aria-label="Views of the statement">
              <Tabs.Tab id="flow">Flow</Tabs.Tab>
              <Tabs.Tab id="columns">Columns</Tabs.Tab>
              <Tabs.Tab id="type">Type</Tabs.Tab>
              <Tabs.Tab id="result">Result</Tabs.Tab>
              <Tabs.Tab id="plan">Plan</Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <StatementPills
          statements={statements}
          picked={statementIndex}
          onPick={(index) => {
            setStatementIndex(index)
            setSelectedNode(null)
          }}
        />
        <span className="ml-auto text-code text-faint">
          {analysisStatusOf(analysis.isError, stale || analysis.isFetching, statement)}
        </span>
      </div>
      {tab === 'flow' ? (
        <FlowView
          nodes={parts.nodes}
          edges={parts.edges}
          selected={selectedNode}
          onSelect={setSelectedNode}
        />
      ) : null}
      <StatementDetail tab={tab} statement={statement} modelOf={modelOf} />
      {tab === 'result' ? (
        <ResultView failed={run.isError} error={run.error} result={result} />
      ) : null}
      {tab === 'plan' ? (
        <PlanView
          plan={explain.data ?? null}
          pending={explain.isPending}
          error={explain.isError ? problemDetail(explain.error) : null}
          onExplain={runExplain}
        />
      ) : null}
    </div>
  )

  const workspace = (
    <div className="flex min-h-0 min-w-0 flex-col">
      <SqlHeader database={database} running={run.isPending} onRun={execute} />
      <NoDatabase database={database} />
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
    </section>
  )
}
