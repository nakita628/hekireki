import { Link, Outlet, useLocation } from '@tanstack/react-router'

import { useStudioEvents } from '@/hooks/events.js'
import { useSchema } from '@/hooks/index.js'

import { Sidebar } from '../sidebar/sidebar.js'

/** The Studio frame around every page: the sidebar, the schema-error banner and the routed page. */
export function Shell() {
  useStudioEvents()
  const snapshot = useSchema().data ?? null
  const schema = snapshot?.schema ?? null
  const pathname = useLocation({ select: (location) => location.pathname })
  return (
    <div className="grid h-full grid-cols-[250px_minmax(0,1fr)]">
      <Sidebar schema={schema} schemaPath={snapshot?.files[0]?.path ?? null} />
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {snapshot?.error && schema !== null && pathname !== '/prisma' ? (
          <div className="border-b border-danger-line bg-danger-soft px-6 py-2.5 text-[13px] text-danger">
            <strong>Schema has errors</strong> — showing the last valid version.{' '}
            <Link className="underline" to="/prisma" search={{}}>
              Fix it in the editor
            </Link>
            <pre className="mt-1.5 mb-0 font-mono text-xs whitespace-pre-wrap text-ink">
              {snapshot.error}
            </pre>
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  )
}
