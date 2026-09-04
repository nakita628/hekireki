import { useQueryClient } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

import { CopyIcon, WandIcon } from '../../components/icons.js'
import { SchemaErrorStatus } from '../../components/schema-error-status.js'
import type { PlainFileDiagnostic } from '../../components/schema-problems.js'
import { useCopy } from '../../hooks/copy.js'
import { getSchemaQueryKey, usePutSchemaFiles } from '../../hooks/index.js'
import { useSteady } from '../../hooks/steady.js'
import { client, loadString, saveString, useUiStore } from '../../lib/index.js'
import { SchemaCanvas } from '../schema/schema-view.js'
import { blockAtLine } from './blocks.js'
import { CodeEditor } from './code-editor.js'
import type { EditorServices, MonacoEditor, PlainSymbol } from './code-editor.js'
import { saveStatus } from './save-status.js'

type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

type Location = { readonly file: string; readonly line: number } | null

// The wire shape: the brand the server puts on a checked Snapshot does not survive JSON.
type Snapshot = {
  readonly schema: {
    readonly files: readonly { readonly path: string }[]
    readonly provider: string | null
    readonly models: readonly {
      readonly name: string
      readonly dbName: string | null
      readonly documentation: string | null
      readonly primaryKey: readonly string[] | null
      readonly fields: readonly {
        readonly name: string
        readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
        readonly type: string
        readonly isList: boolean
        readonly isRequired: boolean
        readonly isId: boolean
        readonly isUnique: boolean
        readonly isForeignKey: boolean
        readonly documentation: string | null
        readonly attributes: readonly string[]
      }[]
      readonly indexes: readonly {
        readonly type: 'id' | 'normal' | 'unique' | 'fulltext'
        readonly fields: readonly string[]
      }[]
      readonly location: Location
    }[]
    readonly enums: readonly {
      readonly name: string
      readonly dbName: string | null
      readonly documentation: string | null
      readonly values: readonly { readonly name: string; readonly dbName: string | null }[]
      readonly location: Location
    }[]
    readonly relations: readonly {
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
    }[]
  } | null
  readonly error: string | null
  readonly diagnostics: readonly PlainFileDiagnostic[]
  readonly files: readonly { readonly path: string; readonly content: string }[]
}

const SAVE_DEBOUNCE_MS = 400

const STATUS_CLASSES = {
  danger: { text: 'text-danger', dot: 'bg-danger' },
  busy: { text: 'text-busy', dot: 'bg-busy' },
  ok: { text: 'text-faint', dot: 'bg-ok' },
} as const
const SPLIT_KEY = 'hekireki-studio:split'

type Draft = { readonly base: string; readonly text: string }

function initialSplit() {
  const stored = Number(loadString(SPLIT_KEY))
  return Number.isNaN(stored) || stored < 20 || stored > 80 ? 50 : stored
}

export function PrismaView({
  snapshot,
  focus,
  file: requestedFile,
  line: requestedLine,
}: {
  readonly snapshot: Snapshot
  /** A model or enum to open the editor at */
  readonly focus: string | null
  /** A file to open, e.g. the one an error banner points at */
  readonly file: string | null
  /** The 1-based line to put the cursor on in that file */
  readonly line: number | null
}) {
  const schema = snapshot.schema
  const theme = useUiStore((s) => s.theme)
  const location =
    schema?.models.find((m) => m.name === focus)?.location ??
    schema?.enums.find((e) => e.name === focus)?.location ??
    null
  const [chosenPath, setChosenPath] = useState<string | null>(null)
  const activePath = chosenPath ?? requestedFile ?? location?.file ?? snapshot.files[0]?.path ?? ''
  const file = snapshot.files.find((f) => f.path === activePath) ?? snapshot.files[0]
  const [draft, setDraft] = useState<Draft | null>(null)
  const [cursorLine, setCursorLine] = useState(1)
  const [symbols, setSymbols] = useState<readonly PlainSymbol[]>([])
  const [revealLine, setRevealLine] = useState<number | null>(
    requestedLine ?? location?.line ?? null,
  )
  const [split, setSplit] = useState(initialSplit)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [editor, setEditor] = useState<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const queryClient = useQueryClient()
  const save = usePutSchemaFiles({
    mutation: {
      onSuccess: (saved) => queryClient.setQueryData(getSchemaQueryKey(), saved),
      onError: () => {
        toast.error('The schema file could not be saved.')
      },
    },
  })
  const { copied, copy } = useCopy()
  // While a line is being typed the schema is briefly invalid and every keystroke saves; the
  // error chip and the "Saving…" dot only show once those states have held for a moment.
  const steadyProblems = useSteady(snapshot.error === null ? null : snapshot, 700)
  const steadySaving = useSteady(save.isPending ? true : null, 300)

  // While there is no unsaved draft the editor mirrors the file on disk, so changes made by
  // other tools show up on their own.
  const text = draft?.text ?? file?.content ?? ''
  const dirty = draft !== null && draft.text !== (file?.content ?? '')
  const changedOnDisk = draft !== null && file !== undefined && file.content !== draft.base

  const scheduleSave = (path: string, content: string) => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      save.mutate(
        { json: { path, content } },
        {
          onSuccess: () => {
            setDraft((current) => (current?.text === content ? null : current))
          },
        },
      )
    }, SAVE_DEBOUNCE_MS)
  }

  const onChange = (next: string) => {
    if (!file) return
    setDraft((current) => ({ base: current?.base ?? file.content, text: next }))
    scheduleSave(file.path, next)
  }

  const services: EditorServices = {
    format: async (request) => {
      try {
        const body = await parseResponse(client.prisma.format.$post({ json: request }))
        return body.edits
      } catch {
        toast.error('The schema could not be formatted.')
        return []
      }
    },
    symbols: async (request) => {
      try {
        const body = await parseResponse(client.prisma.symbols.$post({ json: request }))
        return body.symbols
      } catch {
        return []
      }
    },
    complete: async ({ triggerCharacter, ...request }) => {
      try {
        const body = await parseResponse(
          client.prisma.complete.$post({
            json: triggerCharacter === null ? request : { ...request, triggerCharacter },
          }),
        )
        return body.items
      } catch {
        return []
      }
    },
    hover: async (request) => {
      try {
        return await parseResponse(client.prisma.hover.$post({ json: request }))
      } catch {
        return { contents: null, range: null }
      }
    },
    definition: async (request) => {
      try {
        const body = await parseResponse(client.prisma.definition.$post({ json: request }))
        return body.locations
      } catch {
        return []
      }
    },
    references: async (request) => {
      try {
        const body = await parseResponse(client.prisma.references.$post({ json: request }))
        return body.locations
      } catch {
        return []
      }
    },
    rename: async (request) => {
      try {
        const body = await parseResponse(client.prisma.rename.$post({ json: request }))
        return body.changes
      } catch {
        toast.error('The rename could not be computed.')
        return []
      }
    },
    codeActions: async (request) => {
      try {
        const body = await parseResponse(
          client.prisma['code-actions'].$post({
            json: { ...request, diagnostics: [...request.diagnostics] },
          }),
        )
        return body.actions
      } catch {
        return []
      }
    },
    openLocation: (path, line) => {
      if (!snapshot.files.some((f) => f.path === path)) return
      setChosenPath(path)
      setDraft(null)
      setRevealLine(line)
    },
    lint: async (request) => {
      try {
        const body = await parseResponse(client.prisma.lint.$post({ json: request }))
        return body.diagnostics
      } catch {
        return []
      }
    },
    save: (path, content) => {
      if (!snapshot.files.some((f) => f.path === path)) return
      save.mutate({ json: { path, content } })
    },
  }

  const highlight = useMemo(
    () => blockAtLine(symbols, cursorLine)?.name ?? null,
    [symbols, cursorLine],
  )

  // Monaco's own format command, backed by the Prisma formatter through the format provider.
  const formatDocument = () => {
    void editor?.getAction('editor.action.formatDocument')?.run()
  }

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget.parentElement
    if (!container) return
    const rect = container.getBoundingClientRect()
    const move = (e: PointerEvent) => {
      setSplit(Math.min(80, Math.max(20, ((e.clientX - rect.left) / rect.width) * 100)))
    }
    const stop = () => {
      globalThis.removeEventListener('pointermove', move)
      globalThis.removeEventListener('pointerup', stop)
      setSplit((current) => {
        saveString(SPLIT_KEY, String(Math.round(current)))
        return current
      })
    }
    globalThis.addEventListener('pointermove', move)
    globalThis.addEventListener('pointerup', stop)
  }

  if (!file) return <section className="p-6 text-muted">No schema files loaded.</section>

  const status = saveStatus({
    pending: steadySaving === true,
    dirty,
    failed: save.isError,
    saved: save.isSuccess,
  })
  const statusClasses = STATUS_CLASSES[status.tone]

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3">
        <h1 className="page-title">Prisma schema</h1>
        <span className="text-lead text-muted">
          {text.split('\n').length} lines
          {schema?.provider ? ` · ${schema.provider}` : ''}
        </span>
        <span className="ml-auto flex min-w-0 items-center gap-3">
          <SchemaErrorStatus
            error={steadyProblems?.error ?? null}
            diagnostics={steadyProblems?.diagnostics ?? []}
          />
          <span className={`flex shrink-0 items-center gap-2 text-code ${statusClasses.text}`}>
            <span className={`size-2 rounded-full ${statusClasses.dot}`} />
            {status.label}
          </span>
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          title="Format with the Prisma formatter: also adds missing relation fields, foreign keys and @relation attributes (Shift+Alt+F)"
          onClick={formatDocument}
        >
          <WandIcon size={15} />
          Format
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            copy(text)
          }}
        >
          <CopyIcon size={15} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </header>
      {changedOnDisk ? (
        <div className="flex items-center gap-3 border-b border-danger-line bg-danger-soft px-6 py-2 text-code text-ink">
          <span className="flex-1">
            This file changed on disk while you were editing; your next save overwrites it.
          </span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setDraft(null)
            }}
          >
            Load the disk version
          </button>
        </div>
      ) : null}
      {snapshot.files.length > 1 ? (
        <div className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-6 pt-2">
          {snapshot.files.map((f) => (
            <button
              key={f.path}
              type="button"
              className={`tab${f.path === file.path ? ' tab-active' : ''}`}
              onClick={() => {
                setChosenPath(f.path)
                setDraft(null)
                setRevealLine(null)
              }}
            >
              {f.path}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `minmax(0, ${split}fr) 6px minmax(0, ${100 - split}fr)` }}
      >
        <div className="min-h-0 min-w-0 border-r border-line bg-surface">
          <CodeEditor
            key={file.path}
            value={text}
            path={file.path}
            files={snapshot.files}
            theme={theme}
            services={services}
            revealLine={revealLine}
            onReady={setEditor}
            onChange={onChange}
            onCursorLine={setCursorLine}
            onSymbols={setSymbols}
          />
        </div>
        <div
          className="cursor-col-resize bg-line hover:bg-accent"
          title="Drag to resize"
          onPointerDown={startResize}
        />
        <div className="flex min-h-0 min-w-0 flex-col">
          {schema ? (
            <SchemaCanvas schema={schema} focus={null} highlight={highlight} compact />
          ) : (
            <div className="p-6 text-muted">The diagram appears once the schema parses.</div>
          )}
        </div>
      </div>
    </section>
  )
}
