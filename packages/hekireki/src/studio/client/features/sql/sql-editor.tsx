import { autocompletion, closeBrackets } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { MySQL, PostgreSQL, sql, SQLite } from '@codemirror/lang-sql'
import { bracketMatching, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state'
import type { Range as CmRange } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { classHighlighter } from '@lezer/highlight'
import { useEffect, useRef } from 'react'

import type { Diagnostic, Range } from './analysis.js'

type Dialect = 'postgresql' | 'mysql' | 'sqlite' | null

type Schema = Readonly<Record<string, readonly string[]>>

const setHighlight = StateEffect.define<Range | null>()
const setDiagnostics = StateEffect.define<readonly Diagnostic[]>()

const highlightMark = Decoration.mark({ class: 'cm-node-range' })

const diagnosticMarks = {
  error: Decoration.mark({ class: 'cm-diagnostic-error' }),
  warning: Decoration.mark({ class: 'cm-diagnostic-warning' }),
  info: Decoration.mark({ class: 'cm-diagnostic-info' }),
}

function clamp(range: Range, length: number) {
  const start = Math.max(0, Math.min(range.start, length))
  const end = Math.max(start, Math.min(range.end, length))
  return { start, end }
}

// The clause of the picked node, drawn over the text; replaced whole on every change.
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    const effect = transaction.effects.find((candidate) => candidate.is(setHighlight))
    if (effect === undefined) return value.map(transaction.changes)
    const range = effect.value
    if (range === null) return Decoration.none
    const { start, end } = clamp(range, transaction.newDoc.length)
    return start === end ? Decoration.none : Decoration.set([highlightMark.range(start, end)])
  },
  provide: (field) => EditorView.decorations.from(field),
})

const diagnosticsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    const effect = transaction.effects.find((candidate) => candidate.is(setDiagnostics))
    if (effect === undefined) return value.map(transaction.changes)
    const marks = effect.value
      .flatMap((diagnostic): CmRange<Decoration>[] => {
        if (diagnostic.range === null) return []
        const { start, end } = clamp(diagnostic.range, transaction.newDoc.length)
        return start === end ? [] : [diagnosticMarks[diagnostic.severity].range(start, end)]
      })
      .toSorted((a, b) => a.from - b.from || a.to - b.to)
    return Decoration.set(marks, true)
  },
  provide: (field) => EditorView.decorations.from(field),
})

function languageOf(dialect: Dialect, schema: Schema) {
  const chosen = dialect === 'postgresql' ? PostgreSQL : dialect === 'mysql' ? MySQL : SQLite
  return sql({ dialect: chosen, schema, upperCaseKeywords: true })
}

/**
 * The SQL editor: CodeMirror with the dialect's grammar, completion from the tables of the
 * schema, and two overlays — the clause of the picked node, and the problems the analysis found.
 */
export function SqlEditor({
  value,
  onChange,
  onRun,
  dialect,
  schema,
  highlight,
  diagnostics,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onRun: () => void
  readonly dialect: Dialect
  readonly schema: Schema
  readonly highlight: Range | null
  readonly diagnostics: readonly Diagnostic[]
}) {
  const host = useRef<HTMLDivElement | null>(null)
  const view = useRef<EditorView | null>(null)
  const language = useRef(new Compartment())
  const latest = useRef({ onChange, onRun })
  latest.current = { onChange, onRun }

  useEffect(() => {
    const element = host.current
    if (element === null) return undefined
    const editor = new EditorView({
      parent: element,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          placeholder('Type a statement — table and column names complete as you go'),
          history(),
          highlightActiveLine(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          syntaxHighlighting(classHighlighter),
          language.current.of(languageOf(dialect, schema)),
          highlightField,
          diagnosticsField,
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                latest.current.onRun()
                return true
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString())
          }),
          EditorView.lineWrapping,
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
    // The editor is created once; `value` afterwards is pushed through the effect below.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [])

  useEffect(() => {
    const editor = view.current
    if (editor === null) return
    const current = editor.state.doc.toString()
    if (current === value) return
    editor.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure(languageOf(dialect, schema)) })
  }, [dialect, schema])

  useEffect(() => {
    const editor = view.current
    if (editor === null) return
    editor.dispatch({ effects: setHighlight.of(highlight) })
    if (highlight !== null) {
      const { start } = clamp(highlight, editor.state.doc.length)
      editor.dispatch({ effects: EditorView.scrollIntoView(start, { y: 'nearest' }) })
    }
  }, [highlight])

  useEffect(() => {
    view.current?.dispatch({ effects: setDiagnostics.of(diagnostics) })
  }, [diagnostics])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />
}
