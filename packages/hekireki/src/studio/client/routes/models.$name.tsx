import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod'

import { NotFound } from '../components/not-found.js'
import { ModelView } from '../features/data/model-view.js'
import { SchemaGate } from '../features/shell/schema-gate.js'

export const Route = createFileRoute('/models/$name')({
  validateSearch: z.object({
    tab: z
      .enum(['data', 'fields'])
      .optional()
      .meta({ description: 'The tab of the model page', example: 'fields' }),
    field: z
      .string()
      .optional()
      .meta({ description: 'The field to open the page on', example: 'email' }),
  }),
  component: ModelPage,
})

function ModelPage() {
  const { name } = Route.useParams()
  const { tab, field } = Route.useSearch()
  return (
    <SchemaGate>
      {(schema) => {
        const model = schema.models.find((m) => m.name === name)
        return model ? (
          <ModelView
            key={model.name}
            schema={schema}
            model={model}
            tab={tab ?? null}
            field={field ?? null}
          />
        ) : (
          <NotFound what="model" name={name} />
        )
      }}
    </SchemaGate>
  )
}
