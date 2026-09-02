import { autocompletion, snippetCompletion } from '@codemirror/autocomplete'
import type { CompletionContext } from '@codemirror/autocomplete'
import { linter } from '@codemirror/lint'
import type { Diagnostic } from '@codemirror/lint'
import { Compartment, EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'

import type { Schema } from '../../../server/routes/index.js'
import type { Theme } from '../../lib/theme.js'
import { localCompletions } from './completion.js'
import { prismaLanguage } from './prisma-language.js'

export type ServerCompletion = {
  readonly label: string
  readonly detail: string | null
  readonly documentation: string | null
  readonly insertText: string
}

export type EditorServices = {
  readonly complete: (
    text: string,
    line: number,
    character: number,
  ) => Promise<readonly ServerCompletion[]>
  readonly lint: (text: string) => Promise<readonly Diagnostic[]>
  readonly format: () => void
}

const lightTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--c-surface)', color: 'var(--c-ink)' },
    '.cm-gutters': {
      backgroundColor: 'var(--c-surface)',
      color: 'var(--c-faint)',
      borderRight: '1px solid var(--c-line)',
    },
    '.cm-activeLineGutter': { backgroundColor: 'var(--c-accent-soft)' },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--c-accent-soft) 60%, transparent)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--c-accent-soft)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--c-surface)',
      border: '1px solid var(--c-line-strong)',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--c-accent-soft)',
      color: 'var(--c-ink)',
    },
  },
  { dark: false },
)

const layoutTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { padding: '12px 0' },
  '&.cm-focused': { outline: 'none' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono)', fontSize: '12px' },
})

function themeExtension(theme: Theme) {
  return theme === 'dark' ? oneDark : lightTheme
}

const KIND_TYPE: Readonly<Record<string, string>> = {
  keyword: 'keyword',
  type: 'type',
  attribute: 'property',
  function: 'function',
  field: 'variable',
  enum: 'enum',
  value: 'constant',
}

function completionSource(schema: () => Schema | null, services: () => EditorServices) {
  return async (context: CompletionContext) => {
    const text = context.state.doc.toString()
    const local = localCompletions(text, context.pos, schema())
    const line = context.state.doc.lineAt(context.pos)
    const remote =
      context.explicit || local !== null
        ? await services().complete(text, line.number - 1, context.pos - line.from)
        : []
    const word = context.matchBefore(/[@\w.]*/u)
    const from = local?.from ?? word?.from ?? context.pos
    const localOptions = (local?.options ?? []).map((option) =>
      option.snippet === null
        ? { label: option.label, type: KIND_TYPE[option.kind], detail: option.detail ?? undefined }
        : snippetCompletion(option.snippet, {
            label: option.label,
            type: KIND_TYPE[option.kind],
            detail: option.detail ?? undefined,
          }),
    )
    const seen = new Set(localOptions.map((o) => o.label))
    const remoteOptions = remote
      .filter((item) => !seen.has(item.label))
      .map((item) => ({
        label: item.label,
        apply: item.insertText,
        detail: item.detail ?? undefined,
        info: item.documentation ?? undefined,
        type: 'text',
      }))
    const options = [...localOptions, ...remoteOptions]
    if (options.length === 0) return null
    return { from, options, validFor: /^[@\w.]*$/u }
  }
}

export function CodeEditor({
  value,
  theme,
  schema,
  services,
  onChange,
  onCursorLine,
}: {
  readonly value: string
  readonly theme: Theme
  readonly schema: Schema | null
  readonly services: EditorServices
  readonly onChange: (text: string) => void
  readonly onCursorLine: (line: number) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const themeSlot = useRef(new Compartment())
  const latest = useRef({ onChange, onCursorLine, schema, services, value, theme })
  useEffect(() => {
    latest.current = { onChange, onCursorLine, schema, services, value, theme }
  })

  // The editor owns its document after mount; later `value` / `theme` changes are applied by
  // the effects below.
  useEffect(() => {
    if (!host.current) return undefined
    const initial = latest.current
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.value,
        extensions: [
          basicSetup,
          prismaLanguage,
          layoutTheme,
          themeSlot.current.of(themeExtension(initial.theme)),
          autocompletion({
            override: [
              completionSource(
                () => latest.current.schema,
                () => latest.current.services,
              ),
            ],
          }),
          linter((editorView) => latest.current.services.lint(editorView.state.doc.toString()), {
            delay: 500,
          }),
          keymap.of([
            {
              key: 'Shift-Alt-f',
              run: () => {
                latest.current.services.format()
                return true
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString())
            if (update.docChanged || update.selectionSet) {
              latest.current.onCursorLine(
                update.state.doc.lineAt(update.state.selection.main.head).number,
              )
            }
          }),
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [])

  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const current = editor.state.doc.toString()
    if (current === value) return
    const head = Math.min(editor.state.selection.main.head, value.length)
    editor.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: head },
    })
  }, [value])

  useEffect(() => {
    view.current?.dispatch({ effects: themeSlot.current.reconfigure(themeExtension(theme)) })
  }, [theme])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />
}
