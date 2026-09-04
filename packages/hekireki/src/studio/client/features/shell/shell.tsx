import { Link, Outlet, useLocation } from '@tanstack/react-router'

import { PanelIcon } from '../../components/icons.js'
import { SchemaErrorBanner } from '../../components/schema-error-banner.js'
import { useStudioEvents } from '../../hooks/events.js'
import { useSchema } from '../../hooks/index.js'
import { useUiStore } from '../../lib/index.js'
import { Sidebar } from '../sidebar/sidebar.js'

/** The Studio frame around every page: the sidebar, the schema-error banner and the routed page. */
export function Shell() {
  useStudioEvents()
  const snapshot = useSchema().data ?? null
  const schema = snapshot?.schema ?? null
  const pathname = useLocation({ select: (location) => location.pathname })
  const firstError = snapshot?.diagnostics.find((diagnostic) => diagnostic.severity === 'error')
  const open = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  return (
    <div
      className={`grid h-full ${open ? 'grid-cols-[250px_minmax(0,1fr)]' : 'grid-cols-[40px_minmax(0,1fr)]'}`}
    >
      {open ? (
        <Sidebar schema={schema} schemaPath={snapshot?.files[0]?.path ?? null} />
      ) : (
        // Folded away, the sidebar leaves a rail behind: the page keeps its place and the way
        // back is where the way out was.
        <div className="flex flex-col items-center border-r border-line bg-surface pt-3">
          <button
            type="button"
            className="btn btn-ghost size-8 px-0 text-muted"
            aria-label="Show the sidebar"
            title="Show the sidebar"
            onClick={toggleSidebar}
          >
            <PanelIcon size={16} />
          </button>
        </div>
      )}
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {snapshot?.error && schema !== null && pathname !== '/prisma' ? (
          <SchemaErrorBanner
            error={snapshot.error}
            diagnostics={snapshot.diagnostics}
            note="Showing the last valid version."
            action={
              <Link
                className="shrink-0 underline"
                to="/prisma"
                search={
                  firstError ? { file: firstError.path, line: firstError.range.start.line + 1 } : {}
                }
              >
                Fix it in the editor
              </Link>
            }
          />
        ) : null}
        <Outlet />
      </main>
    </div>
  )
}
