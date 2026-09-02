import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { useSchema } from '@/hooks/index.js'
import { errorMessage } from '@/lib/error.js'

import type { Schema } from '../../../server/routes/index.js'

/** Renders the page once a schema is available; loading, request errors and a schema that never parsed are shown instead. */
export function SchemaGate({ children }: { readonly children: (schema: Schema) => ReactNode }) {
  const snapshotQuery = useSchema()
  const snapshot = snapshotQuery.data ?? null
  if (snapshotQuery.isError && snapshot === null) {
    return <pre className="error-box m-6">{errorMessage(snapshotQuery.error)}</pre>
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
