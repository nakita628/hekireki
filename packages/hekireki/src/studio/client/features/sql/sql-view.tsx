import { Button, Kbd, Tabs } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { LuPlay } from 'react-icons/lu'

import { fieldTypeLabel } from '../../components/labels.js'
import { ResultTable } from '../../components/result-table.js'
import { useDebounced } from '../../hooks/debounce.js'
import { getDbCountsQueryKey, useDb, usePostDbSql, useSchema } from '../../hooks/index.js'
import { loadString, saveString } from '../../lib/index.js'
import { SchemaCanvas } from '../schema/schema-view.js'
import type { SchemaHighlight } from '../schema/schema-view.js'
import { useAnalysis } from './analysis.js'
import type { Range, StatementAnalysis } from './analysis.js'
import { ColumnsView } from './columns-view.js'
import { DiagnosticsList } from './diagnostics-list.js'
import { FlowView } from './flow-view.js'
import { ParamsPanel } from './params-panel.js'
import { bindValues } from './params.js'
import { SplitPane } from './split-pane.js'
import { SqlEditor } from './sql-editor.js'
import type { EditorTable } from './sql-editor.js'
import { TypeView } from './type-view.js'

const SQL_KEY = 'hekireki-studio:sql'
// How the page is shared out: the editor beside the schema, and the editor above the views.
const PANES_KEY = 'hekireki-studio:sql-panes'
const EDITOR_KEY = 'hekireki-studio:sql-editor-height'
const ANALYZE_DEBOUNCE_MS = 250

type Tab = 'flow' | 'columns' | 'type' | 'result'

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

function statementLabel(statement: StatementAnalysis, index: number) {
  const first = statement.text.trim().split('\n')[0]?.trim() ?? ''
  const short = first.length > 28 ? `${first.slice(0, 27)}…` : first
  return `${index + 1} · ${short === '' ? statement.kind : short}`
}

/** The tables a statement touches and the columns it reads from each, keyed by lowercased table name. */
function highlightOf(statement: StatementAnalysis | null): SchemaHighlight | null {
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
  return name === 'columns' || name === 'type' || name === 'result' ? name : 'flow'
}

/** The SQL page: the editor and what the analysis says on the left, the models it runs against on the right. */
export function SqlView() {
  const queryClient = useQueryClient()
  const database = useDb().data ?? null
  const schema = useSchema().data?.schema ?? null
  // The editor starts empty; what was last typed comes back on the next visit.
  const [sql, setSql] = useState(() => loadString(SQL_KEY) ?? '')
  const [tab, setTab] = useState<Tab>('flow')
  const [statementIndex, setStatementIndex] = useState(0)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [pickedRange, setPickedRange] = useState<Range | null>(null)
  const [paramInputs, setParamInputs] = useState<Readonly<Record<string, string>>>({})

  const settled = useDebounced(sql, ANALYZE_DEBOUNCE_MS)
  const analysis = useAnalysis(settled)
  const statements = analysis.data?.statements ?? []
  const statement = statements[Math.min(statementIndex, Math.max(0, statements.length - 1))] ?? null
  const stale = settled !== sql

  // The editor points at the picked node's clause, or at the diagnostic that was clicked.
  const highlight =
    selectedNode === null
      ? pickedRange
      : (statement?.nodes.find((candidate) => candidate.id === selectedNode)?.range ?? null)

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
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['db', '/db/rows/:modelName'] }),
          queryClient.invalidateQueries({ queryKey: getDbCountsQueryKey() }),
        ]),
    },
  })
  const result = run.data ?? null

  const params = useMemo(
    () => (statement === null ? [] : bindValues(statement.parameters, paramInputs)),
    [statement, paramInputs],
  )

  const execute = useCallback(() => {
    if (run.isPending || sql.trim() === '' || database?.connected !== true) return
    saveString(SQL_KEY, sql)
    const text = statement === null || statements.length <= 1 ? sql : statement.text
    run.mutate({ json: { sql: text, params: [...params] } })
    setTab('result')
  }, [run, sql, database, statement, statements.length, params])

  const onChange = useCallback((value: string) => {
    setSql(value)
    saveString(SQL_KEY, value)
  }, [])

  // Completion and hovers offer the names the database knows — `@@map` / `@map` over the Prisma
  // names — with the Prisma type beside each one.
  const tables = useMemo(
    (): readonly EditorTable[] =>
      (schema?.models ?? []).map((model) => ({
        name: model.dbName ?? model.name,
        detail: `model ${model.name}`,
        columns: model.fields
          .filter((field) => field.kind !== 'object')
          .map((field) => ({ name: field.dbName ?? field.name, detail: fieldTypeLabel(field) })),
      })),
    [schema],
  )

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
          diagnostics={statement?.diagnostics ?? []}
        />
      </div>
      <ParamsPanel
        parameters={statement?.parameters ?? []}
        inputs={paramInputs}
        onChange={(key, value) => {
          setParamInputs((current) => ({ ...current, [key]: value }))
        }}
      />
      <DiagnosticsList
        diagnostics={statement?.diagnostics ?? []}
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
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        {statements.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1">
            {statements.map((entry, index) => (
              <button
                key={`${entry.range.start}-${entry.range.end}`}
                type="button"
                className={`pill ${index === statementIndex ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-canvas text-muted hover:border-accent'}`}
                onClick={() => {
                  setStatementIndex(index)
                  setSelectedNode(null)
                }}
              >
                {statementLabel(entry, index)}
              </button>
            ))}
          </div>
        ) : null}
        <span className="ml-auto text-code text-faint">
          {analysis.isError
            ? 'The analysis failed.'
            : stale || analysis.isFetching
              ? 'Analyzing…'
              : statement === null
                ? ''
                : `${statement.kind} · ${statement.nodes.length} nodes`}
        </span>
      </div>
      {tab === 'flow' ? (
        <FlowView
          nodes={statement?.nodes ?? []}
          edges={statement?.edges ?? []}
          selected={selectedNode}
          onSelect={setSelectedNode}
        />
      ) : null}
      {tab === 'columns' && statement !== null ? (
        <ColumnsView statement={statement} modelOf={modelOf} />
      ) : null}
      {tab === 'type' && statement !== null ? <TypeView statement={statement} /> : null}
      {tab === 'result' ? (
        run.isError ? (
          <div className="error-box m-4">{problemDetail(run.error)}</div>
        ) : result === null ? (
          <div className="p-6 text-muted">Run the statement to see its rows here.</div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-line bg-surface-2 px-4 py-1.5 text-code text-muted">
              {result.columns.length > 0
                ? rowSummary(result.rows.length, result.rowCount)
                : `${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'} affected`}{' '}
              · {result.durationMs} ms
            </div>
            {result.columns.length > 0 ? (
              <ResultTable columns={result.columns} rows={result.rows} />
            ) : null}
          </div>
        )
      ) : null}
    </div>
  )

  const workspace = (
    <div className="flex min-h-0 min-w-0 flex-col">
      <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3">
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
          isDisabled={run.isPending || database?.connected !== true}
          onPress={execute}
        >
          <LuPlay size={14} />
          Run
        </Button>
      </header>
      {database !== null && !database.connected ? (
        <div className="error-box m-4">
          {database.error ?? 'Start Studio with --url <connection string> or set DATABASE_URL.'}
        </div>
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

  const schemaPane = (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2 text-code text-muted">
        <span className="heading mb-0">Schema</span>
        <span className="truncate">
          {touched === null
            ? 'Every model; the ones a statement touches light up as you type.'
            : `${touched.size} ${touched.size === 1 ? 'table' : 'tables'} touched · the columns read are marked`}
        </span>
      </div>
      {schema === null ? null : schema.models.length === 0 ? (
        <div className="p-6 text-muted">No models in the schema.</div>
      ) : (
        <SchemaCanvas schema={schema} focus={null} touched={touched} compact />
      )}
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
    </section>
  )
}
