import { Editor } from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useRef } from 'react'

import type { Theme } from '../../lib/index.js'
import {
  applyMarkers,
  bindEditorContext,
  EDITOR_FONT,
  setupMonaco,
  syncFileModels,
  themeName,
} from './monaco.js'
import type { EditorServices, MonacoEditor, PlainSymbol } from './monaco.js'
import { PRISMA_LANGUAGE_ID } from './prisma-monarch.js'

export type { EditorServices, MonacoEditor, PlainSymbol } from './monaco.js'

const ANALYZE_DEBOUNCE_MS = 400

const OPTIONS: MonacoEditor.IStandaloneEditorConstructionOptions = {
  // Monaco 0.56 defaults its input to the experimental `EditContext`, which drives a plain
  // `<div class="native-edit-context">` — no `contenteditable`, no textarea. In Chromium a letter
  // reaches it as a `beforeinput`, and the space bar does not: the key arrives, nothing cancels
  // it, and no text is ever inserted. Typing `model User` in the schema editor writes `modelUser`.
  // The textarea this turns back on is the input path Monaco used for a decade.
  editContext: false,
  fontFamily: EDITOR_FONT,
  fontSize: 12.5,
  lineHeight: 20,
  tabSize: 2,
  insertSpaces: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: 'line',
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: true,
  wordBasedSuggestions: 'off',
  quickSuggestions: { other: true, comments: false, strings: false },
  suggest: { showWords: false, preview: true },
  bracketPairColorization: { enabled: false },
  guides: { bracketPairs: false, indentation: true },
  stickyScroll: { enabled: false },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
  fixedOverflowWidgets: true,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  renderWhitespace: 'none',
}

export function CodeEditor({
  value,
  path,
  files,
  theme,
  services,
  revealLine,
  onReady,
  onChange,
  onCursorLine,
  onSymbols,
}: {
  readonly value: string
  readonly path: string
  /** Every loaded file: the others get models too, so the language features can reach them. */
  readonly files: readonly { readonly path: string; readonly content: string }[]
  readonly theme: Theme
  readonly services: EditorServices
  /** A line to scroll to and put the cursor on, when the view opens the file at a place. */
  readonly revealLine: number | null
  /** Receives the editor once mounted, for the view's own commands (Format). */
  readonly onReady: (editor: MonacoEditor.IStandaloneCodeEditor) => void
  readonly onChange: (text: string) => void
  readonly onCursorLine: (line: number) => void
  /** The blocks of the text after each analysis, as the language server outlines them. */
  readonly onSymbols: (symbols: readonly PlainSymbol[]) => void
}) {
  const monaco = setupMonaco()
  const latest = useRef({ onChange, onCursorLine, onSymbols, services, path })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    latest.current = { onChange, onCursorLine, onSymbols, services, path }
  })
  // The providers are global to the language; they follow whichever editor rendered last.
  useEffect(() => {
    bindEditorContext({ services, path })
  }, [services, path])
  useEffect(() => {
    syncFileModels(files, path)
  }, [files, path])

  // Diagnostics become squiggles and the outline goes to the view, both from the same text.
  const analyze = useCallback((model: MonacoEditor.ITextModel) => {
    const run = async () => {
      const request = { text: model.getValue(), path: latest.current.path }
      const [diagnostics, symbols] = await Promise.all([
        latest.current.services.lint(request),
        latest.current.services.symbols(request),
      ])
      if (model.isDisposed() || model.getValue() !== request.text) return
      applyMarkers(model, diagnostics)
      latest.current.onSymbols(symbols)
    }
    void run()
  }, [])

  const scheduleAnalyze = useCallback(
    (model: MonacoEditor.ITextModel) => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        analyze(model)
      }, ANALYZE_DEBOUNCE_MS)
    },
    [analyze],
  )

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const onMount: OnMount = (editor) => {
    onReady(editor)
    // Monaco binds Ctrl+Shift+I on Linux; the header advertises Shift+Alt+F, so bind it everywhere.
    editor.addCommand(
      // oxlint-disable-next-line no-bitwise -- Monaco keybindings are bit flags by design
      monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      () => {
        void editor.getAction('editor.action.formatDocument')?.run()
      },
    )
    editor.onDidChangeCursorPosition((event) => {
      latest.current.onCursorLine(event.position.lineNumber)
    })
    const model = editor.getModel()
    if (model) analyze(model)
    if (revealLine !== null) {
      editor.setPosition({ lineNumber: revealLine, column: 1 })
      editor.revealLineInCenter(revealLine)
      editor.focus()
    }
  }

  return (
    <Editor
      path={path}
      language={PRISMA_LANGUAGE_ID}
      value={value}
      theme={themeName(theme)}
      options={OPTIONS}
      keepCurrentModel
      loading={<div className="p-4 text-code text-muted">Loading editor…</div>}
      onMount={onMount}
      onChange={(text, event) => {
        if (text === undefined) return
        latest.current.onChange(text)
        const model = monaco.editor.getModels().find((m) => m.getValue() === text)
        if (model && !event.isFlush) scheduleAnalyze(model)
      }}
    />
  )
}
