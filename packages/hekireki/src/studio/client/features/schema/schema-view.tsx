import { useNavigate } from '@tanstack/react-router'
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
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Schema } from '../../../server/routes/index.js'
import { LayoutIcon, RefreshIcon } from '../../components/icons.js'
import { ModelNode } from '../../components/model-node.js'
import { layoutStorageKey, loadLayout, saveLayout } from '../../lib/storage.js'
import { useUiStore } from '../../lib/store.js'
import { buildEdges, buildNodes, highlightEdges } from './graph.js'
import type { ModelNodeType } from './graph.js'
import { autoLayout, positionsFor } from './layout.js'

const nodeTypes = { model: ModelNode }
const NO_NODES: ModelNodeType[] = []
const NO_EDGES: Edge[] = []

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
  const navigate = useNavigate()
  const storageKey = layoutStorageKey(schema.files[0]?.path ?? 'schema')
  const [nodes, setNodes, onNodesChange] = useNodesState(NO_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(NO_EDGES)
  const [selected, setSelected] = useState<readonly string[]>([])
  const { fitView } = useReactFlow()
  const store = useStoreApi()
  const theme = useUiStore((s) => s.theme)

  useEffect(() => {
    const positions = positionsFor(schema, loadLayout(storageKey))
    setNodes([...buildNodes(schema, positions)])
    setEdges([...buildEdges(schema)])
  }, [schema, storageKey, setNodes, setEdges])

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
    (list: readonly ModelNodeType[]) => {
      saveLayout(storageKey, Object.fromEntries(list.map((n) => [n.id, n.position])))
    },
    [storageKey],
  )

  const relayout = useCallback(() => {
    const positions = autoLayout(schema.models, schema.relations)
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

  const styledEdges = useMemo(() => highlightEdges(edges, selected), [edges, selected])

  return (
    <div className="relative min-h-0 flex-1">
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={() => {
          persist(nodes)
        }}
        onNodeDoubleClick={(_event, node) => {
          void navigate({ to: '/models/$name', params: { name: node.id }, search: {} })
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
          <button
            type="button"
            className={`btn${compact ? ' h-8 px-2.5 text-xs' : ''}`}
            onClick={relayout}
          >
            <LayoutIcon size={15} />
            Auto layout
          </button>
        </Panel>
      </ReactFlow>
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
        <h1 className="m-0 text-[22px] font-bold tracking-tight">Schema</h1>
        <span className="text-[15px] text-muted">
          {schema.models.length} {schema.models.length === 1 ? 'model' : 'models'} ·{' '}
          {schema.relations.length} {schema.relations.length === 1 ? 'relation' : 'relations'}
          {schema.enums.length > 0 ? ` · ${schema.enums.length} enums` : ''}
        </span>
        <span className="ml-auto text-[12.5px] text-faint">Double-click a model to open it</span>
      </header>
      <SchemaCanvas schema={schema} focus={focus} onRefresh={onRefresh} />
    </section>
  )
}
