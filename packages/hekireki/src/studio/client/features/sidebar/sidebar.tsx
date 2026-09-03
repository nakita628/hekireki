import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import type { Schema } from '../../../server/routes/index.js'
import {
  BoltIcon,
  BookIcon,
  DiagramIcon,
  FileIcon,
  ListIcon,
  MoonIcon,
  SunIcon,
  TableIcon,
  TerminalIcon,
} from '../../components/icons.js'
import { getDbCountsQueryOptions, useDb } from '../../hooks/index.js'
import { useUiStore } from '../../lib/index.js'
import { diagramFields } from '../schema/layout.js'

const NAV = 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14.5px]'
const NAV_ACTIVE = { className: `${NAV} bg-accent-soft font-semibold text-accent-text` }
const NAV_INACTIVE = { className: `${NAV} hover:bg-canvas` }

const ENTITY = 'flex items-center gap-2 rounded-lg border px-3 py-[7px] font-mono text-[13px]'
const ENTITY_ACTIVE = {
  className: `${ENTITY} border-accent bg-accent-soft font-semibold text-accent-text`,
}
const ENTITY_INACTIVE = { className: `${ENTITY} border-transparent hover:bg-canvas` }

function EntityLink({
  to,
  name,
  icon,
  count,
}: {
  readonly to: '/models/$name' | '/enums/$name'
  readonly name: string
  readonly icon: React.ReactNode
  readonly count: number | null
}) {
  return (
    <Link to={to} params={{ name }} activeProps={ENTITY_ACTIVE} inactiveProps={ENTITY_INACTIVE}>
      {({ isActive }) => (
        <>
          <span className={`shrink-0 ${isActive ? 'text-accent' : 'text-faint'}`}>{icon}</span>
          <span className="flex-1 truncate">{name}</span>
          {count === null ? null : (
            <span className="rounded-full border border-line bg-canvas px-2 py-px font-sans text-xs text-muted">
              {count}
            </span>
          )}
        </>
      )}
    </Link>
  )
}

function StatusDot({ on, warn = false }: { readonly on: boolean; readonly warn?: boolean }) {
  return (
    <span
      className={`size-2 shrink-0 rounded-full ${on ? 'bg-green-600 ring-[3px] ring-green-600/20' : warn ? 'bg-danger' : 'bg-faint'}`}
    />
  )
}

export function Sidebar({
  schema,
  schemaPath,
}: {
  readonly schema: Schema | null
  readonly schemaPath: string | null
}) {
  const connection = useUiStore((s) => s.connection)
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const database = useDb().data ?? null
  const connected = database?.connected ?? false
  const counts = useQuery({ ...getDbCountsQueryOptions(), enabled: connected }).data?.counts ?? null
  const models = schema?.models ?? []
  const enums = schema?.enums ?? []
  const status =
    connection === 'live' ? 'Watching' : connection === 'offline' ? 'Disconnected' : 'Connecting'
  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-[18px] pt-[18px] pb-3.5">
        <Link
          className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight"
          to="/"
          search={{}}
        >
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent text-white">
            <BoltIcon size={18} />
          </span>
          <span>Hekireki Studio</span>
        </Link>
        <button
          type="button"
          className="btn btn-ghost ml-auto h-8 px-2 text-muted"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        </button>
      </div>
      <nav className="flex flex-col gap-0.5 px-2.5 pb-3">
        <Link
          to="/"
          search={{}}
          activeOptions={{ exact: true }}
          activeProps={NAV_ACTIVE}
          inactiveProps={NAV_INACTIVE}
        >
          <span className="inline-flex opacity-85">
            <DiagramIcon />
          </span>
          <span>Schema</span>
        </Link>
        <Link to="/prisma" search={{}} activeProps={NAV_ACTIVE} inactiveProps={NAV_INACTIVE}>
          <span className="inline-flex opacity-85">
            <FileIcon />
          </span>
          <span>Prisma schema</span>
        </Link>
        <Link to="/sql" activeProps={NAV_ACTIVE} inactiveProps={NAV_INACTIVE}>
          <span className="inline-flex opacity-85">
            <TerminalIcon />
          </span>
          <span>SQL</span>
        </Link>
        <Link to="/docs" activeProps={NAV_ACTIVE} inactiveProps={NAV_INACTIVE}>
          <span className="inline-flex opacity-85">
            <BookIcon />
          </span>
          <span>Docs</span>
        </Link>
      </nav>
      <div className="px-2.5 pb-2.5">
        <div className="heading px-3 pt-2.5 pb-1.5">
          Models · {models.length}
          {connected ? <span className="ml-1 tracking-normal normal-case">(rows)</span> : null}
        </div>
        <ul className="m-0 list-none p-0">
          {models.map((model) => (
            <li key={model.name}>
              <EntityLink
                to="/models/$name"
                name={model.name}
                icon={<TableIcon size={15} />}
                count={connected ? (counts?.[model.name] ?? null) : diagramFields(model).length}
              />
            </li>
          ))}
        </ul>
      </div>
      {enums.length > 0 ? (
        <div className="px-2.5 pb-2.5">
          <div className="heading px-3 pt-2.5 pb-1.5">Enums · {enums.length}</div>
          <ul className="m-0 list-none p-0">
            {enums.map((value) => (
              <li key={value.name}>
                <EntityLink
                  to="/enums/$name"
                  name={value.name}
                  icon={<ListIcon size={15} />}
                  count={value.values.length}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-auto flex flex-col gap-1 border-t border-line px-[18px] py-3 text-xs text-muted">
        <div className="flex items-center gap-2">
          <StatusDot on={connection === 'live'} warn={connection === 'offline'} />
          <span className="truncate">
            {status}
            {schemaPath ? ` · ${schemaPath}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot on={connected} />
          <span className="truncate" title={database?.error ?? undefined}>
            {database === null
              ? 'Database: checking…'
              : connected
                ? `${database.dialect ?? 'database'} · ${database.url ?? ''}`
                : 'No database connected'}
          </span>
        </div>
      </div>
    </aside>
  )
}
