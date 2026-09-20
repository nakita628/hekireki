import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod'

import { PrismaView } from '../features/editor/prisma-view.js'
import { useSchema } from '../hooks/index.js'

export const Route = createFileRoute('/prisma')({
  validateSearch: z.object({
    focus: z
      .string()
      .optional()
      .meta({ description: 'The block to scroll the editor to', example: 'User' }),
    file: z.string().optional().meta({
      description: 'The schema file to open, as Studio loaded it',
      example: 'user.prisma',
    }),
    line: z
      .number()
      .optional()
      .meta({ description: 'The 1-based line to put the cursor on', example: 12 }),
  }),
  component: PrismaPage,
})

// The editor is the one page that stays usable while the schema is broken, so it takes the
// snapshot as is rather than waiting for a parsed schema.
function PrismaPage() {
  const { focus, file, line } = Route.useSearch()
  const snapshotQuery = useSchema()
  const snapshot = snapshotQuery.data ?? null
  if (snapshotQuery.isError && snapshot === null) {
    return <pre className="error-box m-6">Could not load the schema.</pre>
  }
  if (snapshot === null) return <div className="p-10 text-muted">Loading schema…</div>
  return (
    <PrismaView snapshot={snapshot} focus={focus ?? null} file={file ?? null} line={line ?? null} />
  )
}
