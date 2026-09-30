import { buttonVariants } from '@heroui/react'
import { Link } from '@tanstack/react-router'
import type { InferResponseType } from 'hono/client'
import type { ReactNode } from 'react'

import { useSchema } from '../../hooks/index.js'
import type { client } from '../../lib/index.js'

// The parsed schema as the API sends it; the pages below take the slices they read.
type Schema = NonNullable<InferResponseType<typeof client.schema.$get, 200>['schema']>

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
        <h1 className="page-title mb-4">Schema could not be parsed</h1>
        <pre className="error-box">{snapshot.error ?? 'Unknown error'}</pre>
        <Link className={`${buttonVariants({ variant: 'outline' })} mt-4`} to="/prisma" search={{}}>
          Open the Prisma schema to fix it
        </Link>
      </section>
    )
  }
  return children(snapshot.schema)
}
