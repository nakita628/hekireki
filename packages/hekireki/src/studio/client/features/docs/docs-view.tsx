import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'
import type * as z from 'zod'

import type { DocsSchema } from '../../../server/routes/index.js'
import { Models } from './models.js'
import { Toc } from './toc.js'
import { Types } from './types.js'

/** The generated documentation: a table of contents, the models with their client operations, then the client API types. */
export function DocsView({ docs }: { readonly docs: z.input<typeof DocsSchema> }) {
  const hash = useLocation({ select: (location) => location.hash })

  // The docs arrive after the page, so a hash in the opening URL (or one the router restored)
  // has nothing to scroll to until the sections exist; the browser only scrolls on a click.
  useEffect(() => {
    if (hash === '' || docs.models.length === 0) return
    document.getElementById(decodeURIComponent(hash))?.scrollIntoView()
  }, [hash, docs])

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <Toc docs={docs} />
      <article className="min-h-0 flex-1 overflow-y-auto">
        <Models docs={docs} />
        <Types docs={docs} />
      </article>
    </div>
  )
}
