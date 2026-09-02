import { useQueryClient } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import type * as z from 'zod'

import type { SnapshotSchema } from '../../../server/routes/index.js'
import { CopyIcon, WandIcon } from '../../components/icons.js'
import { useCopy } from '../../hooks/copy.js'
import { getSchemaQueryKey, usePostPrismaFormat, usePutSchemaFiles } from '../../hooks/index.js'
import { client } from '../../lib/client.js'
import { errorMessage } from '../../lib/error.js'
import { loadString, saveString } from '../../lib/storage.js'
import { useUiStore } from '../../lib/store.js'
import { SchemaCanvas } from '../schema/schema-view.js'
import { blockAtLine } from './blocks.js'
import { CodeEditor } from './code-editor.js'
import type { EditorServices } from './code-editor.js'
import { saveStatus } from './save-status.js'

const SAVE_DEBOUNCE_MS = 400

const STATUS_CLASSES = {
  danger: { text: 'text-danger', dot: 'bg-danger' },
  busy: { text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  ok: { text: 'text-faint', dot: 'bg-green-600' },
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
}: {
  // The wire shape: the brand the server puts on a checked Snapshot does not survive JSON.
  readonly snapshot: z.input<typeof SnapshotSchema>
  readonly focus: string | null
}) {
  const schema = snapshot.schema
  const theme = useUiStore((s) => s.theme)
  const location =
    schema?.models.find((m) => m.name === focus)?.location ??
    schema?.enums.find((e) => e.name === focus)?.location ??
    null
  const [chosenPath, setChosenPath] = useState<string | null>(null)
  const activePath = chosenPath ?? location?.file ?? snapshot.files[0]?.path ?? ''
  const file = snapshot.files.find((f) => f.path === activePath) ?? snapshot.files[0]
  const [draft, setDraft] = useState<Draft | null>(null)
  const [cursorLine, setCursorLine] = useState(1)
  const [split, setSplit] = useState(initialSplit)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryClient = useQueryClient()
  const save = usePutSchemaFiles({
    mutation: {
      onSuccess: (saved) => queryClient.setQueryData(getSchemaQueryKey(), saved),
      onError: (error) => {
        toast.error(errorMessage(error))
      },
    },
  })
  const format = usePostPrismaFormat()
  const { copied, copy } = useCopy()

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
    complete: async (source, line, character) => {
      try {
        const body = await parseResponse(
          client.prisma.complete.$post({ json: { text: source, line, character } }),
        )
        return body.items
      } catch {
        return []
      }
    },
    lint: async (source) => {
      if (!file) return []
      try {
        const body = await parseResponse(
          client.prisma.lint.$post({ json: { path: file.path, text: source } }),
        )
        return body.diagnostics
      } catch {
        return []
      }
    },
    format: () => {
      format.mutate(
        { json: { text } },
        {
          onSuccess: (result) => {
            if (result.text !== text) onChange(result.text)
          },
        },
      )
    },
  }

  const highlight = useMemo(() => blockAtLine(text, cursorLine)?.name ?? null, [text, cursorLine])

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
    pending: save.isPending,
    dirty,
    failed: save.isError,
    saved: save.isSuccess,
  })
  const statusClasses = STATUS_CLASSES[status.tone]

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3">
        <h1 className="m-0 text-[22px] font-bold tracking-tight">Prisma schema</h1>
        <span className="text-[15px] text-muted">
          {text.split('\n').length} lines
          {schema?.provider ? ` · ${schema.provider}` : ''}
        </span>
        <span className={`ml-auto flex items-center gap-2 text-[12.5px] ${statusClasses.text}`}>
          <span className={`size-2 rounded-full ${statusClasses.dot}`} />
          {status.label}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          title="Format with the Prisma formatter (Shift+Alt+F)"
          disabled={format.isPending}
          onClick={services.format}
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
      {snapshot.error ? (
        <div className="border-b border-danger-line bg-danger-soft px-6 py-2 text-[13px] text-danger">
          <strong>Schema has errors</strong> — the diagram shows the last valid version.
          <pre className="mt-1 mb-0 font-mono text-xs whitespace-pre-wrap text-ink">
            {snapshot.error}
          </pre>
        </div>
      ) : null}
      {changedOnDisk ? (
        <div className="flex items-center gap-3 border-b border-danger-line bg-danger-soft px-6 py-2 text-xs text-ink">
          <span className="flex-1">
            This file changed on disk while you were editing; your next save overwrites it.
          </span>
          <button
            type="button"
            className="btn h-7 px-2.5 text-xs"
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
            theme={theme}
            schema={schema}
            services={services}
            onChange={onChange}
            onCursorLine={setCursorLine}
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
