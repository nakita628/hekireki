import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStoreApi,
} from '@xyflow/react'
import type { Edge, OnSelectionChangeParams } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

import type { DiagramIndex } from '../../../../diagram/layout.js'
import { EnumNode } from '../../components/enum-node.js'
import { DownloadIcon, LayoutIcon, RefreshIcon } from '../../components/icons.js'
import { ModelNode } from '../../components/model-node.js'
import { layoutStorageKey, loadLayout, saveLayout, useUiStore } from '../../lib/index.js'
import { exportPng, exportSvg } from './export.js'
import { GeometryContext, useDiagramGeometry } from './geometry.js'
import { buildEdges, buildNodes, highlightEdges } from './graph.js'
import type { DiagramNodeType } from './graph.js'
import { autoLayout, positionsFor } from './layout.js'
import { RelationEdge } from './relation-edge.js'

type Field = {
  readonly name: string
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  readonly isId: boolean
  readonly isUnique: boolean
  readonly isForeignKey: boolean
  readonly documentation: string | null
}

type Model = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation: string | null
  readonly primaryKey: readonly string[] | null
  readonly fields: readonly Field[]
  readonly indexes: readonly DiagramIndex[]
}

type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

type Relation = {
  readonly id: string
  readonly origin: 'inferred' | 'annotated' | 'implicit-many-to-many'
  readonly onDelete: string | null
  readonly from: {
    readonly model: string
    readonly field: string
    readonly cardinality: Cardinality
  }
  readonly to: {
    readonly model: string
    readonly field: string
    readonly cardinality: Cardinality
  }
}

type EnumBlock = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation: string | null
  readonly values: readonly { readonly name: string; readonly dbName: string | null }[]
}

type Schema = {
  readonly files: readonly { readonly path: string }[]
  readonly models: readonly Model[]
  readonly enums: readonly EnumBlock[]
  readonly relations: readonly Relation[]
}

const nodeTypes = { model: ModelNode, enum: EnumNode }
const edgeTypes = { relation: RelationEdge }
const NO_NODES: DiagramNodeType[] = []
const NO_EDGES: Edge[] = []

// IE (crow's foot) notation, drawn towards the model the end touches: the inner symbol is the
// maximum (a bar for one, the foot for many), the outer one the minimum (a bar for mandatory,
// a circle for optional). The marker box ends where the edge meets the node, at x = 0.
const CROW_FOOT = 'M0 -8 L-12 0 L0 8 M-12 0 L0 0'
const MAX_ONE_BAR = 'M-6 -6 L-6 6'
const MIN_ONE_BAR = 'M-15 -6 L-15 6'

const CARDINALITIES = [
  { cardinality: 'one', many: false, optional: false },
  { cardinality: 'zero-one', many: false, optional: true },
  { cardinality: 'many', many: true, optional: false },
  { cardinality: 'zero-many', many: true, optional: true },
] as const

/** The four end symbols, defined once per canvas; the edges name them through `cardinalityMarker`. */
function RelationMarkers() {
  return (
    <svg className="er-markers" aria-hidden="true">
      <defs>
        {CARDINALITIES.map(({ cardinality, many, optional }) => (
          <marker
            key={cardinality}
            id={`er-${cardinality}`}
            viewBox="-20 -10 20 20"
            refX="0"
            refY="0"
            markerWidth="20"
            markerHeight="20"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path className="er-symbol" d={many ? CROW_FOOT : MAX_ONE_BAR} />
            {optional ? (
              <circle className="er-symbol er-symbol-open" cx="-16" cy="0" r="3.2" />
            ) : (
              <path className="er-symbol" d={MIN_ONE_BAR} />
            )}
          </marker>
        ))}
      </defs>
    </svg>
  )
}

function Canvas({
  schema,
  focus,
  highlight,
  compact,
  onRefresh,
}: {
  readonly schema: Schema
  readonly focus: string | null
  readonly highlight: string | null
  readonly compact: boolean
  readonly onRefresh: (() => void) | null
}) {
  const storageKey = layoutStorageKey(schema.files[0]?.path ?? 'schema')
  const [nodes, setNodes, onNodesChange] = useNodesState(NO_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(NO_EDGES)
  const [selected, setSelected] = useState<readonly string[]>([])
  const { fitView } = useReactFlow()
  const store = useStoreApi()
  const theme = useUiStore((s) => s.theme)

  // Every autosave produces a new snapshot object; the nodes are rebuilt only when the models or
  // relations actually changed, so typing in the editor does not redraw the diagram.
  const structure = useMemo(
    () =>
      `${storageKey}\n${JSON.stringify({ models: schema.models, relations: schema.relations })}`,
    [schema, storageKey],
  )
  const built = useRef<string | null>(null)
  useEffect(() => {
    if (built.current === structure) return
    built.current = structure
    const positions = positionsFor(schema, loadLayout(storageKey))
    setNodes([...buildNodes(schema, positions)])
    setEdges([...buildEdges(schema)])
  }, [schema, structure, storageKey, setNodes, setEdges])

  useEffect(() => {
    if (focus === null || nodes.length === 0) return undefined
    const focusNode = async () => {
      try {
        await fitView({ nodes: [{ id: focus }], duration: 500, maxZoom: 1.1, padding: 0.4 })
      } catch {
        // The node can disappear between renders when the schema reloads; nothing to focus.
      }
    }
    const timer = setTimeout(() => {
      void focusNode()
    }, 50)
    return () => {
      clearTimeout(timer)
    }
  }, [focus, nodes.length, fitView])

  // Selecting through the store replays the change through onNodesChange / onSelectionChange,
  // exactly as a click would.
  useEffect(() => {
    store.getState().addSelectedNodes(highlight === null ? [] : [highlight])
  }, [highlight, store])

  const persist = useCallback(
    (list: readonly DiagramNodeType[]) => {
      saveLayout(storageKey, Object.fromEntries(list.map((n) => [n.id, n.position])))
    },
    [storageKey],
  )

  const relayout = useCallback(() => {
    const positions = autoLayout(schema)
    const next = nodes.map((n) => ({ ...n, position: positions[n.id] ?? n.position }))
    setNodes(next)
    persist(next)
    const fitAll = async () => {
      try {
        await fitView({ duration: 400, padding: 0.1 })
      } catch {
        // Nothing to fit yet.
      }
    }
    setTimeout(() => {
      void fitAll()
    }, 30)
  }, [schema, nodes, setNodes, persist, fitView])

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelected(params.nodes.map((n) => n.id))
  }, [])

  // The export draws the nodes where they are on the canvas, in the current theme.
  const diagram = useCallback(
    () => ({
      models: schema.models,
      relations: schema.relations,
      enums: schema.enums,
      positions: Object.fromEntries(nodes.map((n) => [n.id, n.position])),
      theme,
    }),
    [schema, nodes, theme],
  )
  const [exporting, setExporting] = useState(false)
  const onExportPng = useCallback(() => {
    const run = async () => {
      setExporting(true)
      try {
        await exportPng('schema.png', diagram())
      } catch {
        toast.error('The diagram could not be exported.')
      } finally {
        setExporting(false)
      }
    }
    void run()
  }, [diagram])
  const onExportSvg = useCallback(() => {
    exportSvg('schema.svg', diagram())
  }, [diagram])

  const styledEdges = useMemo(() => highlightEdges(edges, selected), [edges, selected])
  // Routed once for the whole canvas: an edge cannot place its caption clear of the others
  // without knowing where they went.
  const geometry = useDiagramGeometry(edges)

  return (
    <div className="relative min-h-0 flex-1">
      <RelationMarkers />
      <GeometryContext value={geometry}>
        <ReactFlow
          nodes={nodes}
          edges={styledEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={() => {
            persist(nodes)
          }}
          onSelectionChange={onSelectionChange}
          nodesConnectable={false}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          colorMode={theme}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.2}
            color={theme === 'dark' ? '#2a2f3d' : '#d4d4dc'}
          />
          <Controls showInteractive={false} position="bottom-left" />
          {compact ? null : (
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              nodeColor={theme === 'dark' ? '#3b415a' : '#c7c9d9'}
            />
          )}
          <Panel position="top-right" className="flex gap-2">
            {onRefresh ? (
              <button type="button" className="btn btn-ghost bg-surface" onClick={onRefresh}>
                <RefreshIcon size={15} />
                Refresh
              </button>
            ) : null}
            {compact ? null : (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={onExportPng}
                  disabled={exporting || nodes.length === 0}
                  title="Download the diagram as a PNG image"
                >
                  <DownloadIcon size={15} />
                  PNG
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={onExportSvg}
                  disabled={nodes.length === 0}
                  title="Download the diagram as an SVG image"
                >
                  <DownloadIcon size={15} />
                  SVG
                </button>
              </>
            )}
            <button
              type="button"
              className={`btn${compact ? ' h-8 px-2.5 text-code' : ''}`}
              onClick={relayout}
            >
              <LayoutIcon size={15} />
              Auto layout
            </button>
          </Panel>
        </ReactFlow>
      </GeometryContext>
    </div>
  )
}

export function SchemaCanvas({
  schema,
  focus,
  highlight = null,
  compact = false,
  onRefresh = null,
}: {
  readonly schema: Schema
  readonly focus: string | null
  readonly highlight?: string | null
  readonly compact?: boolean
  readonly onRefresh?: (() => void) | null
}) {
  return (
    <ReactFlowProvider>
      <Canvas
        schema={schema}
        focus={focus}
        highlight={highlight}
        compact={compact}
        onRefresh={onRefresh}
      />
    </ReactFlowProvider>
  )
}

export function SchemaView({
  schema,
  focus,
  onRefresh,
}: {
  readonly schema: Schema
  readonly focus: string | null
  readonly onRefresh: () => void
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3.5">
        <h1 className="page-title">Schema</h1>
        <span className="text-lead text-muted">
          {schema.models.length} {schema.models.length === 1 ? 'model' : 'models'} ·{' '}
          {schema.relations.length} {schema.relations.length === 1 ? 'relation' : 'relations'}
          {schema.enums.length > 0 ? ` · ${schema.enums.length} enums` : ''}
        </span>
      </header>
      <SchemaCanvas schema={schema} focus={focus} onRefresh={onRefresh} />
    </section>
  )
}
