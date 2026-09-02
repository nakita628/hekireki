import { createFileRoute } from '@tanstack/react-router'
import * as v from 'valibot'

import { NotFound } from '@/components/not-found.js'
import { ModelView } from '@/features/data/model-view.js'
import { SchemaGate } from '@/features/shell/schema-gate.js'

export const Route = createFileRoute('/models/$name')({
  validateSearch: v.object({
    tab: v.optional(
      v.pipe(v.picklist(['data', 'fields']), v.description('The tab of the model page')),
    ),
  }),
  component: ModelPage,
})

function ModelPage() {
  const { name } = Route.useParams()
  const { tab } = Route.useSearch()
  return (
    <SchemaGate>
      {(schema) => {
        const model = schema.models.find((m) => m.name === name)
        return model ? (
          <ModelView key={model.name} schema={schema} model={model} tab={tab ?? null} />
        ) : (
          <NotFound what="model" name={name} />
        )
      }}
    </SchemaGate>
  )
}
