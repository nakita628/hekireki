import { Link, Outlet, useLocation } from '@tanstack/react-router'

import { SchemaErrorBanner } from '../../components/schema-error-banner.js'
import { useStudioEvents } from '../../hooks/events.js'
import { useSchema } from '../../hooks/index.js'
import { Sidebar } from '../sidebar/sidebar.js'

/** The Studio frame around every page: the sidebar, the schema-error banner and the routed page. */
export function Shell() {
  useStudioEvents()
  const snapshot = useSchema().data ?? null
  const schema = snapshot?.schema ?? null
  const pathname = useLocation({ select: (location) => location.pathname })
  const firstError = snapshot?.diagnostics.find((diagnostic) => diagnostic.severity === 'error')
  return (
    <div className="grid h-full grid-cols-[250px_minmax(0,1fr)]">
      <Sidebar schema={schema} schemaPath={snapshot?.files[0]?.path ?? null} />
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
