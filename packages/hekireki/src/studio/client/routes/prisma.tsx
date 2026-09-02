import { createFileRoute } from '@tanstack/react-router'
import * as v from 'valibot'

import { PrismaView } from '@/features/editor/prisma-view.js'
import { useSchema } from '@/hooks/index.js'
import { errorMessage } from '@/lib/error.js'

export const Route = createFileRoute('/prisma')({
  validateSearch: v.object({
    focus: v.optional(v.pipe(v.string(), v.description('The block to scroll the editor to'))),
  }),
  component: PrismaPage,
})

// The editor is the one page that stays usable while the schema is broken, so it takes the
// snapshot as is rather than waiting for a parsed schema.
function PrismaPage() {
  const { focus } = Route.useSearch()
  const snapshotQuery = useSchema()
  const snapshot = snapshotQuery.data ?? null
  if (snapshotQuery.isError && snapshot === null) {
    return <pre className="error-box m-6">{errorMessage(snapshotQuery.error)}</pre>
  }
  if (snapshot === null) return <div className="p-10 text-muted">Loading schema…</div>
  return <PrismaView snapshot={snapshot} focus={focus ?? null} />
}
