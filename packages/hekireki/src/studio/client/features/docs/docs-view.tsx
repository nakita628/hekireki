import type * as z from 'zod'

import type { DocsSchema } from '../../../server/routes/index.js'
import { Models } from './models.js'
import { Toc } from './toc.js'
import { Types } from './types.js'

/** The generated documentation: a table of contents, the models with their client operations, then the client API types. */
export function DocsView({ docs }: { readonly docs: z.input<typeof DocsSchema> }) {
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
