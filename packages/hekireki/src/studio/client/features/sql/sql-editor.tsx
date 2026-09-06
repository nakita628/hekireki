import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import type { Completion, CompletionContext } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  keywordCompletionSource,
  MySQL,
  PostgreSQL,
  schemaCompletionSource,
  SQLite,
} from '@codemirror/lang-sql'
import type { SQLNamespace } from '@codemirror/lang-sql'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  LanguageSupport,
  syntaxHighlighting,
} from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state'
import type { Range as CmRange } from '@codemirror/state'
import {
  crosshairCursor,
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  hoverTooltip,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { classHighlighter } from '@lezer/highlight'
import { useEffect, useRef } from 'react'

import type { Diagnostic, Range } from './analysis.js'

type Dialect = 'postgresql' | 'mysql' | 'sqlite' | null

/** A column as the editor completes and explains it: the name the database knows and its Prisma type. */
export type EditorColumn = {
  readonly name: string
  readonly detail: string
}

/** A table as the editor completes and explains it: the name the database knows, the model it is, and its columns. */
export type EditorTable = {
  readonly name: string
  readonly detail: string
  readonly columns: readonly EditorColumn[]
}

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

/** The completion tree: every table with its columns, each entry carrying its type as the detail. */
function namespaceOf(tables: readonly EditorTable[]): SQLNamespace {
  return Object.fromEntries(
    tables.map((table) => [
      table.name,
      {
        self: { label: table.name, detail: table.detail, type: 'class' } satisfies Completion,
        children: table.columns.map((column): Completion => ({
          label: column.name,
          detail: column.detail,
          type: 'property',
        })),
      },
    ]),
  )
}

/**
 * The dialect's grammar with two completion sources: the tables and columns of the schema, and
 * the keywords — which stay out of the way after a dot, where only a column can follow.
 */
function languageOf(dialect: Dialect, tables: readonly EditorTable[]) {
  const chosen = dialect === 'postgresql' ? PostgreSQL : dialect === 'mysql' ? MySQL : SQLite
  const schema = schemaCompletionSource({ dialect: chosen, schema: namespaceOf(tables) })
  const keywords = keywordCompletionSource(chosen, true)
  return new LanguageSupport(chosen.language, [
    chosen.language.data.of({ autocomplete: schema }),
    chosen.language.data.of({
      autocomplete: (context: CompletionContext) => {
        const before = context.matchBefore(/\.[\w$]*$/u)
        return before === null ? keywords(context) : null
      },
    }),
  ])
}

const WORD = /[\w$]/u

function fold(name: string) {
  return name.replaceAll(/^["`]|["`]$/gu, '').toLowerCase()
}

/** The table every alias in the text stands for (`FROM users u`, `JOIN "Post" AS p`), keyed by the folded alias. */
function aliasesOf(text: string, tables: readonly EditorTable[]) {
  const known = new Map(tables.map((table) => [fold(table.name), table]))
  const aliases = new Map<string, EditorTable>()
  for (const match of text.matchAll(
    /\b(?:from|join|update|into)\s+("[^"]+"|`[^`]+`|[\w$.]+)(?:\s+(?:as\s+)?("[^"]+"|`[^`]+`|(?!on\b|where\b|set\b|left\b|right\b|inner\b|cross\b|join\b|values\b)[a-z_$][\w$]*))?/giu,
  )) {
    const table = known.get(fold(match[1] ?? ''))
    if (table === undefined) continue
    aliases.set(fold(match[1] ?? ''), table)
    if (match[2] !== undefined) aliases.set(fold(match[2]), table)
  }
  return aliases
}

function tooltipDom(title: string, detail: string, lines: readonly string[]) {
  const dom = document.createElement('div')
  dom.className = 'cm-schema-tooltip'
  const head = dom.appendChild(document.createElement('div'))
  head.className = 'cm-schema-tooltip-head'
  head.appendChild(document.createElement('strong')).textContent = title
  head.appendChild(document.createElement('span')).textContent = detail
  for (const line of lines) {
    dom.appendChild(document.createElement('div')).textContent = line
  }
  return dom
}

/**
 * What the pointer rests on: a table shows its model and columns, a column its type, resolved
 * through the alias it is written with (`u.email`) or, bare, through every table in the text.
 */
function schemaHover(tables: readonly EditorTable[]) {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos)
    const text = line.text
    const at = pos - line.from
    let start = at
    let end = at
    while (start > 0 && WORD.test(text[start - 1] ?? '')) start -= 1
    while (end < text.length && WORD.test(text[end] ?? '')) end += 1
    if (start === end) return null
    const word = text.slice(start, end)
    const folded = word.toLowerCase()
    const aliases = aliasesOf(view.state.doc.toString(), tables)
    const from = line.from + start
    const to = line.from + end
    const qualified = text[start - 1] === '.' ? text.slice(0, start - 1).match(/[\w$"`]+$/u) : null
    if (qualified === null && text[start - 1] !== '.') {
      const table = tables.find((candidate) => fold(candidate.name) === folded)
      if (table !== undefined) {
        return {
          pos: from,
          end: to,
          above: true,
          create: () => ({
            dom: tooltipDom(
              table.name,
              table.detail,
              table.columns.map((column) => `${column.name}  ${column.detail}`),
            ),
          }),
        }
      }
    }
    const scope =
      qualified === null
        ? [...new Set(aliases.values())]
        : [
            aliases.get(fold(qualified[0])) ??
              tables.find((t) => fold(t.name) === fold(qualified[0])),
          ]
    for (const table of scope) {
      const column = table?.columns.find((candidate) => fold(candidate.name) === folded)
      if (table !== undefined && column !== undefined) {
        return {
          pos: from,
          end: to,
          above: true,
          create: () => ({
            dom: tooltipDom(`${table.name}.${column.name}`, column.detail, [table.detail]),
          }),
        }
      }
    }
    return null
  })
}

/**
 * The SQL editor: CodeMirror with the dialect's grammar, the editing that an IDE has (folding,
 * search, multiple cursors, matching brackets, selection matches), completion of the tables and
 * columns of the schema with their types, a hover over any name, and two overlays — the clause
 * of the picked node, and the problems the analysis found.
 */
export function SqlEditor({
  value,
  onChange,
  onRun,
  dialect,
  tables,
  highlight,
  diagnostics,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onRun: () => void
  readonly dialect: Dialect
  readonly tables: readonly EditorTable[]
  readonly highlight: Range | null
  readonly diagnostics: readonly Diagnostic[]
}) {
  const host = useRef<HTMLDivElement | null>(null)
  const view = useRef<EditorView | null>(null)
  const language = useRef(new Compartment())
  const hover = useRef(new Compartment())
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
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          EditorState.tabSize.of(2),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ activateOnTyping: true, icons: true }),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          placeholder('Type a statement — table and column names complete as you go'),
          syntaxHighlighting(classHighlighter),
          language.current.of(languageOf(dialect, tables)),
          hover.current.of(schemaHover(tables)),
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
            // Tab takes the picked completion, as it does in an IDE; otherwise it indents.
            { key: 'Tab', run: acceptCompletion },
            indentWithTab,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString())
          }),
          EditorView.lineWrapping,
        ],
      }),
    })
    view.current = editor
    // The document is a few lines in a tall pane: a click on the empty space under it, or on the
    // gutter beside it, still lands the cursor in the text, at its end, so typing can start.
    const focusOnClick = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null
      if (target !== null && editor.contentDOM.contains(target)) return
      if (target !== null && editor.dom.querySelector('.cm-gutters')?.contains(target) === true) {
        return
      }
      event.preventDefault()
      editor.dispatch({ selection: { anchor: editor.state.doc.length } })
      editor.focus()
    }
    element.addEventListener('mousedown', focusOnClick)
    editor.focus()
    return () => {
      element.removeEventListener('mousedown', focusOnClick)
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
    view.current?.dispatch({
      effects: [
        language.current.reconfigure(languageOf(dialect, tables)),
        hover.current.reconfigure(schemaHover(tables)),
      ],
    })
  }, [dialect, tables])

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
