import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod'

import { SchemaView } from '../features/schema/schema-view.js'
import { SchemaGate } from '../features/shell/schema-gate.js'
import { useSchema } from '../hooks/index.js'

export const Route = createFileRoute('/')({
  validateSearch: z.object({
    focus: z
      .string()
      .optional()
      .meta({ description: 'The model to fit the diagram to', example: 'User' }),
  }),
  component: SchemaPage,
})

function SchemaPage() {
  const { focus } = Route.useSearch()
  const snapshotQuery = useSchema()
  return (
    <SchemaGate>
      {(schema) => (
        <SchemaView
          schema={schema}
          focus={focus ?? null}
          onRefresh={() => {
            void snapshotQuery.refetch()
          }}
        />
      )}
    </SchemaGate>
  )
}
