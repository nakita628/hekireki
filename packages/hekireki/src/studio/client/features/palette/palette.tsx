import { Button, Kbd, ListBox, Modal, SearchField } from '@heroui/react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Autocomplete } from 'react-aria-components'
import {
  LuBook,
  LuDot,
  LuFileText,
  LuGitCompare,
  LuKey,
  LuLink,
  LuList,
  LuSearch,
  LuTable,
  LuTerminal,
} from 'react-icons/lu'

import { useUiStore } from '../../lib/index.js'
import { search, segments } from './match.js'

type Schema = {
  readonly models: readonly {
    readonly name: string
    readonly primaryKey: readonly string[] | null
    readonly fields: readonly {
      readonly name: string
      readonly isId: boolean
      readonly isForeignKey: boolean
    }[]
  }[]
  readonly enums: readonly { readonly name: string }[]
}

type Entry = {
  readonly id: string
  readonly label: string
  readonly kind: string
  readonly icon: ReactNode
  readonly go: () => void
}

/**
 * The chord the palette opens on, spelled the way the platform writes it. Only the label differs:
 * both Meta and Control are accepted everywhere, so a Mac keyboard on Linux is not left out.
 */
function shortcutLabel() {
  const apple = /mac|iphone|ipad/iu.test(globalThis.navigator?.platform ?? '')
  return apple ? '⌘K' : 'Ctrl K'
}

/**
 * How many entries the list draws. A schema with a hundred models has well over a thousand fields
 * and nobody reads past the first screen of them; what a query cannot narrow to this many is
 * narrowed by typing one more letter, not by scrolling.
 */
const SHOWN = 50

/** The three marks the grid and the fields table already use, so a key is a key everywhere. */
function fieldIcon(
  model: Schema['models'][number],
  field: Schema['models'][number]['fields'][number],
) {
  if (field.isId || (model.primaryKey ?? []).includes(field.name)) return <LuKey />
  if (field.isForeignKey) return <LuLink />
  return <LuDot />
}

/** The button that says the palette exists: in the sidebar, and on the rail it folds down to. */
export function PaletteButton({ compact = false }: { readonly compact?: boolean }) {
  const openPalette = useUiStore((s) => s.openPalette)
  const label = 'Search the schema'
  if (compact) {
    return (
      <Button
        variant="ghost"
        isIconOnly
        aria-label={`${label} (${shortcutLabel()})`}
        onPress={openPalette}
      >
        <LuSearch />
      </Button>
    )
  }
  return (
    <Button variant="ghost" fullWidth className="justify-start text-muted" onPress={openPalette}>
      <LuSearch size={15} />
      <span>{label}</span>
      <Kbd className="ml-auto">{shortcutLabel()}</Kbd>
    </Button>
  )
}

/**
 * Jump to any page, model, enum or field by name. A schema of sixty models turns the sidebar into
 * a long scroll and the diagram into a haystack, and this is the way through both that does not
 * depend on spotting the thing first — fields especially, which no other view lists across models.
 * Mounted once by the shell, so the chord reaches it from every page.
 */
export function CommandPalette({ schema }: { readonly schema: Schema | null }) {
  const open = useUiStore((s) => s.paletteOpen)
  const openPalette = useUiStore((s) => s.openPalette)
  const closePalette = useUiStore((s) => s.closePalette)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'k' && event.key !== 'K') return
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      openPalette()
    }
    globalThis.addEventListener('keydown', onKeyDown)
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown)
    }
  }, [openPalette])

  const entries = useMemo<readonly Entry[]>(
    () => [
      {
        id: 'page:schema',
        label: 'Schema',
        kind: 'Page',
        icon: <LuGitCompare />,
        go: () => {
          void navigate({ to: '/', search: {} })
        },
      },
      {
        id: 'page:prisma',
        label: 'Prisma schema',
        kind: 'Page',
        icon: <LuFileText />,
        go: () => {
          void navigate({ to: '/prisma', search: {} })
        },
      },
      {
        id: 'page:sql',
        label: 'SQL',
        kind: 'Page',
        icon: <LuTerminal />,
        go: () => {
          void navigate({ to: '/sql' })
        },
      },
      {
        id: 'page:docs',
        label: 'Docs',
        kind: 'Page',
        icon: <LuBook />,
        go: () => {
          void navigate({ to: '/docs' })
        },
      },
      ...(schema?.models ?? []).map((model) => ({
        id: `model:${model.name}`,
        label: model.name,
        kind: 'Model',
        icon: <LuTable />,
        go: () => {
          void navigate({ to: '/models/$name', params: { name: model.name }, search: {} })
        },
      })),
      ...(schema?.enums ?? []).map((value) => ({
        id: `enum:${value.name}`,
        label: value.name,
        kind: 'Enum',
        icon: <LuList />,
        go: () => {
          void navigate({ to: '/enums/$name', params: { name: value.name } })
        },
      })),
      // Last, because they are the many: a schema's fields outnumber everything above them, and
      // an empty query should open on the pages rather than on `Account.id`. Written with their
      // model in front, so `usemail` reaches `User.email` and `email` reaches every model that has
      // one.
      ...(schema?.models ?? []).flatMap((model) =>
        model.fields.map((field) => ({
          id: `field:${model.name}.${field.name}`,
          label: `${model.name}.${field.name}`,
          kind: 'Field',
          icon: fieldIcon(model, field),
          go: () => {
            void navigate({
              to: '/models/$name',
              params: { name: model.name },
              search: { tab: 'fields', field: field.name },
            })
          },
        })),
      ),
    ],
    [schema, navigate],
  )

  const found = useMemo(() => search(entries, query), [entries, query])
  const matches = found.slice(0, SHOWN)

  const close = () => {
    closePalette()
    setQuery('')
  }

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) close()
      }}
    >
      <Modal.Container placement="top" size="lg">
        <Modal.Dialog aria-label="Search the schema" className="p-0">
          {/*
            The ranking is Studio's (features/palette/match.ts), so the list is handed over already
            sorted and the autocomplete is left to do what it is for: carrying the arrow keys from
            the box to the list, and telling a screen reader which entry they are standing on.
          */}
          {/*
            The search box clears itself on Escape before anything else sees the key, which would
            make leaving a palette with something typed in it take two presses. The panel says
            `Esc`, so Escape leaves.
          */}
          <div
            onKeyDownCapture={(event) => {
              if (event.key === 'Escape') close()
            }}
          >
            <Autocomplete inputValue={query} onInputChange={setQuery}>
              {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- a palette opened by a chord is a
                box to type in; the focus is what was asked for */}
              <SearchField autoFocus aria-label="Search pages, models, enums and fields">
                <SearchField.Group className="rounded-none border-0 border-b border-line shadow-none">
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="Search pages, models, enums and fields…" />
                  <Kbd>Esc</Kbd>
                </SearchField.Group>
              </SearchField>
              <ListBox
                aria-label="Results"
                items={matches}
                className="max-h-[50vh] overflow-y-auto p-1.5"
                renderEmptyState={() => (
                  <p className="m-0 px-4 py-6 text-center text-body text-muted">
                    Nothing matches “{query.trim()}”.
                  </p>
                )}
                onAction={(key) => {
                  const entry = matches.find((match) => match.item.id === key)?.item
                  close()
                  entry?.go()
                }}
              >
                {({ item, indices }) => (
                  <ListBox.Item id={item.id} textValue={item.label} className="gap-2.5">
                    <span className="shrink-0 text-faint">{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {segments(item.label, indices).map((run) =>
                        run.matched ? (
                          <b key={run.start} className="font-semibold text-accent-text underline">
                            {run.text}
                          </b>
                        ) : (
                          <span key={run.start}>{run.text}</span>
                        ),
                      )}
                    </span>
                    <span className="shrink-0 text-caption text-faint uppercase">{item.kind}</span>
                  </ListBox.Item>
                )}
              </ListBox>
            </Autocomplete>
          </div>
          {found.length > matches.length ? (
            <p className="m-0 border-t border-line px-4 py-2 text-center text-caption text-faint">
              {(found.length - matches.length).toLocaleString()} more — keep typing to narrow them
            </p>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
