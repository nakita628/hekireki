import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { useSchema } from '../../hooks/index.js'

// The parsed schema as the API sends it; the pages below take the slices they read.
type Field = {
  readonly name: string
  readonly dbName: string | null
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  readonly isId: boolean
  readonly isUnique: boolean
  readonly isForeignKey: boolean
  readonly default: string | null
  readonly documentation: string | null
  readonly annotations: readonly string[]
  readonly attributes: readonly string[]
}

type Model = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation: string | null
  readonly annotations: readonly string[]
  readonly fields: readonly Field[]
  readonly primaryKey: readonly string[] | null
  readonly indexes: readonly {
    readonly type: 'id' | 'normal' | 'unique' | 'fulltext'
    readonly fields: readonly string[]
    readonly attribute: string
  }[]
  readonly attributes: readonly string[]
}

type Enum = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation: string | null
  readonly values: readonly { readonly name: string; readonly dbName: string | null }[]
}

type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

type Relation = {
  readonly id: string
  readonly origin: 'inferred' | 'annotated' | 'implicit-many-to-many'
  readonly onDelete: string | null
  readonly from: {
    readonly model: string
    readonly field: string
    readonly cardinality: Cardinality
  }
  readonly to: {
    readonly model: string
    readonly field: string
    readonly cardinality: Cardinality
  }
}

type Schema = {
  readonly files: readonly { readonly path: string }[]
  readonly models: readonly Model[]
  readonly enums: readonly Enum[]
  readonly relations: readonly Relation[]
}

/** Renders the page once a schema is available; loading, request errors and a schema that never parsed are shown instead. */
export function SchemaGate({ children }: { readonly children: (schema: Schema) => ReactNode }) {
  const snapshotQuery = useSchema()
  const snapshot = snapshotQuery.data ?? null
  if (snapshotQuery.isError && snapshot === null) {
    return <pre className="error-box m-6">Could not load the schema.</pre>
  }
  if (snapshot === null) return <div className="p-10 text-muted">Loading schema…</div>
  if (snapshot.schema === null) {
    return (
      <section className="p-6">
        <h1 className="m-0 mb-4 text-[22px] font-bold tracking-tight">
          Schema could not be parsed
        </h1>
        <pre className="error-box">{snapshot.error ?? 'Unknown error'}</pre>
        <Link className="btn mt-4" to="/prisma" search={{}}>
          Open the Prisma schema to fix it
        </Link>
      </section>
    )
  }
  return children(snapshot.schema)
}
