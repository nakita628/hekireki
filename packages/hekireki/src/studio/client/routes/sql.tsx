import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod'

import { SqlView } from '../features/sql/sql-view.js'

export const Route = createFileRoute('/sql')({
  validateSearch: z.object({
    sql: z
      .string()
      .optional()
      .meta({ description: 'A statement to open the editor with', example: 'SELECT 1' }),
    params: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .meta({ description: 'The values the statement was bound with, in bind order' }),
  }),
  component: SqlPage,
})

function SqlPage() {
  const { sql, params } = Route.useSearch()
  // A statement handed over from another page opens as a fresh editor, whatever was typed before.
  return <SqlView key={sql ?? ''} initialSql={sql ?? ''} initialParams={params ?? []} />
}
