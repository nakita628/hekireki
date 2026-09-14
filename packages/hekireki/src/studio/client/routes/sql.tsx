import { createFileRoute } from '@tanstack/react-router'
import * as v from 'valibot'

import { SqlView } from '../features/sql/sql-view.js'

export const Route = createFileRoute('/sql')({
  validateSearch: v.object({
    sql: v.optional(v.pipe(v.string(), v.description('A statement to open the editor with'))),
    params: v.optional(
      v.pipe(
        v.array(v.union([v.string(), v.number(), v.boolean(), v.null()])),
        v.description('The values the statement was bound with, in bind order'),
      ),
    ),
  }),
  component: SqlPage,
})

function SqlPage() {
  const { sql, params } = Route.useSearch()
  // A statement handed over from another page opens as a fresh editor, whatever was typed before.
  return <SqlView key={sql ?? ''} initialSql={sql ?? ''} initialParams={params ?? []} />
}
