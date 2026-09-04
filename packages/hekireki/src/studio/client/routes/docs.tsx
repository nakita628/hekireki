import { createFileRoute } from '@tanstack/react-router'

import { DocsView } from '../features/docs/docs-view.js'
import { useDocs } from '../hooks/index.js'

export const Route = createFileRoute('/docs')({ component: DocsPage })

// The docs describe the last schema that parsed, so they stay up while an edit is broken.
function DocsPage() {
  const docsQuery = useDocs()
  const docs = docsQuery.data ?? null
  if (docsQuery.isError && docs === null) {
    return <pre className="error-box m-6">Could not load the documentation.</pre>
  }
  if (docs === null) return <div className="p-10 text-muted">Loading schema…</div>
  return <DocsView docs={docs} />
}
