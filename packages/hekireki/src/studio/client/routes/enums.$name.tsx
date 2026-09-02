import { createFileRoute } from '@tanstack/react-router'

import { NotFound } from '@/components/not-found.js'
import { EnumView } from '@/features/data/enum-view.js'
import { SchemaGate } from '@/features/shell/schema-gate.js'

export const Route = createFileRoute('/enums/$name')({ component: EnumPage })

function EnumPage() {
  const { name } = Route.useParams()
  return (
    <SchemaGate>
      {(schema) => {
        const value = schema.enums.find((e) => e.name === name)
        return value ? (
          <EnumView schema={schema} value={value} />
        ) : (
          <NotFound what="enum" name={name} />
        )
      }}
    </SchemaGate>
  )
}
