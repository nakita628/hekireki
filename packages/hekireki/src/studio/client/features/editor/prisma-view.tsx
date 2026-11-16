import { Button, Tabs, toast, Tooltip } from '@heroui/react'
import { useQueryClient } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'
import type { editor as MonacoEditor } from 'monaco-editor/editor/editor.api.js'
import { useMemo, useRef, useState } from 'react'
import { LuCopy, LuWandSparkles } from 'react-icons/lu'

import type { Cardinality, RelationOrigin } from '../../../../types/index.js'
import { prismaClient } from '../../api/index.js'
import { SchemaErrorStatus } from '../../components/schema-error-status.js'
import { schemaProblems } from '../../components/schema-problems.js'
import type { PlainFileDiagnostic } from '../../components/schema-problems.js'
import { useCopy } from '../../hooks/copy.js'
import { getSchemaQueryKey, usePutSchemaFiles } from '../../hooks/index.js'
import { useSteady } from '../../hooks/steady.js'
import { loadString, saveString, useUiStore } from '../../lib/index.js'
import { SchemaCanvas } from '../schema/schema-view.js'
import { blockAtLine } from './blocks.js'
import { CodeEditor } from './code-editor.js'
import type { EditorServices, PlainSymbol } from './monaco.js'
import { saveStatus } from './save-status.js'

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
      readonly origin: RelationOrigin
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

/** Where a model or enum of the schema is declared, when the page is asked to open at one. */
function focusLocation(schema: Snapshot['schema'], focus: string | null): Location {
  if (schema === null) return null
  return (
    schema.models.find((m) => m.name === focus)?.location ??
    schema.enums.find((e) => e.name === focus)?.location ??
    null
  )
}

/** The datasource provider after the line count, when the schema names one. */
function providerSuffix(schema: Snapshot['schema']) {
  const provider = schema?.provider ?? ''
  return provider === '' ? '' : ` · ${provider}`
}

/** The file to show: the first one asked for, else the first file of the schema. */
function openingPath(asked: readonly (string | null | undefined)[], files: Snapshot['files']) {
  return asked.find((path) => path !== null && path !== undefined) ?? files[0]?.path ?? ''
}

/**
 * The problems the chip shows, once they have held for a moment: while a line is being typed the
 * schema is briefly invalid and every keystroke saves. What the chip shows is what tells one state
 * from the next: Prisma's error text quotes the lines around the problem, so it changes with every
 * keystroke even while the problem is the same one, and keying on it would hide the chip and show
 * it again for each.
 */
function useSteadyProblems(snapshot: Snapshot) {
  const problems = useMemo(
    () =>
      snapshot.error === null
        ? null
        : schemaProblems({ error: snapshot.error, diagnostics: snapshot.diagnostics }),
    [snapshot.error, snapshot.diagnostics],
  )
  return useSteady(
    snapshot.error === null ? null : snapshot,
    700,
    problems === null ? undefined : `${problems.count}\n${problems.summary}`,
  )
}

/**
 * The text in the editor and how it stands against the file: while there is no unsaved draft
 * the editor mirrors the file on disk, so changes made by other tools show up on their own.
 */
function draftState(draft: Draft | null, content: string | undefined) {
  if (draft === null) return { text: content ?? '', dirty: false, changedOnDisk: false }
  return {
    text: draft.text,
    dirty: draft.text !== (content ?? ''),
    changedOnDisk: content !== undefined && content !== draft.base,
  }
}

function DiskChangedBanner({ onReload }: { readonly onReload: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-danger-line bg-danger-soft px-6 py-2 text-code text-ink">
      <span className="flex-1">
        This file changed on disk while you were editing; your next save overwrites it.
      </span>
      <Button variant="outline" size="sm" onPress={onReload}>
        Load the disk version
      </Button>
    </div>
  )
}

function FileTabs({
  files,
  selected,
  onSelect,
}: {
  readonly files: Snapshot['files']
  readonly selected: string
  readonly onSelect: (path: string) => void
}) {
  if (files.length <= 1) return null
  return (
    <Tabs
      className="overflow-x-auto border-b border-line bg-surface px-6 py-2"
      selectedKey={selected}
      onSelectionChange={(key) => {
        onSelect(String(key))
      }}
    >
      <Tabs.ListContainer className="w-fit">
        <Tabs.List aria-label="Schema files">
          {files.map((f) => (
            <Tabs.Tab key={f.path} id={f.path} className="font-mono">
              {f.path}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )
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
  const location = focusLocation(schema, focus)
  const [chosenPath, setChosenPath] = useState<string | null>(null)
  const activePath = openingPath([chosenPath, requestedFile, location?.file], snapshot.files)
  const file = snapshot.files.find((f) => f.path === activePath) ?? snapshot.files[0]
  const [draft, setDraft] = useState<Draft | null>(null)
  const [cursorLine, setCursorLine] = useState(1)
  const [symbols, setSymbols] = useState<readonly PlainSymbol[]>([])
  const [revealLine, setRevealLine] = useState<number | null>(
    () => requestedLine ?? location?.line ?? null,
  )
  const [split, setSplit] = useState(initialSplit)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [editor, setEditor] = useState<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const queryClient = useQueryClient()
  const save = usePutSchemaFiles({
    mutation: {
      onSuccess: (saved) => queryClient.setQueryData(getSchemaQueryKey(), saved),
      onError: () => {
        toast.danger('The schema file could not be saved.')
      },
    },
  })
  const { copied, copy } = useCopy()
  const steadyProblems = useSteadyProblems(snapshot)
  const steadySaving = useSteady(save.isPending ? true : null, 300)

  const { text, dirty, changedOnDisk } = draftState(draft, file?.content)

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
        const body = await parseResponse(prismaClient.prisma.format.$post({ json: request }))
        return body.edits
      } catch {
        toast.danger('The schema could not be formatted.')
        return []
      }
    },
    symbols: async (request) => {
      try {
        const body = await parseResponse(prismaClient.prisma.symbols.$post({ json: request }))
        return body.symbols
      } catch {
        return []
      }
    },
    complete: async ({ triggerCharacter, ...request }) => {
      try {
        const body = await parseResponse(
          prismaClient.prisma.complete.$post({
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
        return await parseResponse(prismaClient.prisma.hover.$post({ json: request }))
      } catch {
        return { contents: null, range: null }
      }
    },
    definition: async (request) => {
      try {
        const body = await parseResponse(prismaClient.prisma.definition.$post({ json: request }))
        return body.locations
      } catch {
        return []
      }
    },
    references: async (request) => {
      try {
        const body = await parseResponse(prismaClient.prisma.references.$post({ json: request }))
        return body.locations
      } catch {
        return []
      }
    },
    rename: async (request) => {
      try {
        const body = await parseResponse(prismaClient.prisma.rename.$post({ json: request }))
        return body.changes
      } catch {
        toast.danger('The rename could not be computed.')
        return []
      }
    },
    codeActions: async (request) => {
      try {
        const body = await parseResponse(
          prismaClient.prisma['code-actions'].$post({
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
        const body = await parseResponse(prismaClient.prisma.lint.$post({ json: request }))
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
      {/*
        One line, whatever is on it. The error chip comes and goes while a line is half-typed, and
        a header that wrapped to fit it pushed the editor down the page mid-keystroke — the text
        moved under the cursor. Nothing here wraps: what has no room to be read is cut instead.
      */}
      <header className="flex flex-nowrap items-center gap-3.5 border-b border-line bg-surface px-6 py-3">
        <h1 className="page-title shrink-0">Prisma schema</h1>
        <span className="hidden shrink-0 text-lead text-muted sm:inline">
          {text.split('\n').length} lines
          {providerSuffix(schema)}
        </span>
        <span className="ml-auto flex min-w-0 items-center gap-3">
          <SchemaErrorStatus
            error={steadyProblems?.error ?? null}
            diagnostics={steadyProblems?.diagnostics ?? []}
          />
          <span className={`flex min-w-0 items-center gap-2 text-code ${statusClasses.text}`}>
            <span className={`size-2 shrink-0 rounded-full ${statusClasses.dot}`} />
            {/* The dot carries the state on its own when there is no room for the words. */}
            <span className="truncate">{status.label}</span>
          </span>
        </span>
        <Tooltip>
          <Button className="shrink-0" variant="ghost" onPress={formatDocument}>
            <LuWandSparkles size={15} />
            Format
          </Button>
          <Tooltip.Content>
            Format with the Prisma formatter: also adds missing relation fields, foreign keys and
            @relation attributes (Shift+Alt+F)
          </Tooltip.Content>
        </Tooltip>
        <Button
          className="shrink-0"
          variant="ghost"
          onPress={() => {
            copy(text)
          }}
        >
          <LuCopy size={15} />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </header>
      {changedOnDisk ? (
        <DiskChangedBanner
          onReload={() => {
            setDraft(null)
          }}
        />
      ) : null}
      <FileTabs
        files={snapshot.files}
        selected={file.path}
        onSelect={(path) => {
          setChosenPath(path)
          setDraft(null)
          setRevealLine(null)
        }}
      />
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
