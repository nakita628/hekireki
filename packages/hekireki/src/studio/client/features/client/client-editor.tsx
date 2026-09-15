import { Editor } from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'

import { useUiStore } from '../../lib/index.js'
import { EDITOR_OPTIONS, setupMonaco, themeName } from '../editor/monaco.js'
import type { MonacoEditor } from '../editor/monaco.js'
import type { CompletionModel } from './completion.js'
import { applyClientMarkers, bindClientEditor, setupClientEditor } from './monaco-typescript.js'
import type { ClientMarker } from './monaco-typescript.js'
import { QUERY_LANGUAGE_ID } from './query-monarch.js'

// One model for the page: the providers and the markers find it by this name.
const QUERY_PATH = 'file:///hekireki-studio-query.ts'

/**
 * The Prisma Client editor: Monaco with the grammar of a Prisma call, completion, hovers and
 * signature help answered by the project's TypeScript through the Studio API (the schema's
 * models and fields when the project has no TypeScript 5), and the problems found in the text
 * — by the reading and by the type check — underlined.
 */
export function ClientEditor({
  value,
  onChange,
  onRun,
  onReady,
  models,
  typesAvailable,
  markers,
  selection,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onRun: () => void
  /** Receives the editor once mounted, for the page's own commands (Format). */
  readonly onReady: (editor: MonacoEditor.IStandaloneCodeEditor) => void
  readonly models: readonly CompletionModel[]
  /** Whether the server can complete against the client's types; otherwise the schema completes. */
  readonly typesAvailable: boolean
  readonly markers: readonly ClientMarker[]
  /** A range to select and scroll to, such as the diagnostic that was clicked. */
  readonly selection: ClientMarker['range'] | null
}) {
  const monaco = setupMonaco()
  setupClientEditor()
  const theme = useUiStore((s) => s.theme)
  const editor = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const latest = useRef({ onChange, onRun })
  useEffect(() => {
    latest.current = { onChange, onRun }
  })

  useEffect(() => {
    bindClientEditor({ models, typesAvailable })
  }, [models, typesAvailable])

  useEffect(() => {
    const model = editor.current?.getModel()
    if (model) applyClientMarkers(model, markers)
  }, [markers])

  useEffect(() => {
    const current = editor.current
    if (current === null || selection === null) return
    const model = current.getModel()
    if (!model) return
    const start = model.getPositionAt(selection.start)
    const end = model.getPositionAt(selection.end)
    current.setSelection(
      new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
    )
    current.revealPositionInCenterIfOutsideViewport(start)
    current.focus()
  }, [selection, monaco])

  const onMount: OnMount = (mounted) => {
    editor.current = mounted
    mounted.addCommand(
      // oxlint-disable-next-line no-bitwise -- Monaco keybindings are bit flags by design
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        latest.current.onRun()
      },
    )
    // Monaco binds Ctrl+Shift+I on Linux; the header advertises Shift+Alt+F, so bind it everywhere.
    mounted.addCommand(
      // oxlint-disable-next-line no-bitwise -- Monaco keybindings are bit flags by design
      monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      () => {
        void mounted.getAction('editor.action.formatDocument')?.run()
      },
    )
    onReady(mounted)
    const model = mounted.getModel()
    if (model) applyClientMarkers(model, markers)
    mounted.focus()
  }

  return (
    <Editor
      path={QUERY_PATH}
      language={QUERY_LANGUAGE_ID}
      value={value}
      theme={themeName(theme)}
      options={EDITOR_OPTIONS}
      keepCurrentModel
      loading={<div className="p-4 text-code text-muted">Loading editor…</div>}
      onMount={onMount}
      onChange={(text) => {
        if (text !== undefined) latest.current.onChange(text)
      }}
    />
  )
}
