import type { RouteHandler } from '@hono/zod-openapi'
import { Effect } from 'effect'

import type { getDocsRoute } from '../routes'
import { DocsSchema } from '../routes/index.js'
import * as DocsUseCase from '../usecases/index.js'

// The docs as last checked, by the object the state holds: a reload replaces that object, and
// between reloads every request would otherwise run the whole DMMF-sized contract check again.
const checked = new WeakMap<object, ReturnType<typeof DocsSchema.parse>>()

function checkDocs(docs: object) {
  const kept = checked.get(docs)
  if (kept !== undefined) return kept
  const parsed = DocsSchema.parse(docs)
  checked.set(docs, parsed)
  return parsed
}

/**
 * `GET /docs` handler. The documentation of the last schema that parsed: models, operations and
 * client API types.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DocsUseCase
 *   C->>H: GET /docs
 *   H->>U: readDocs()
 *   U-->>H: Docs
 *   H-->>C: 200 Docs
 * ```
 */
export const getDocsRouteHandler: RouteHandler<typeof getDocsRoute> = (c) =>
  Effect.runPromise(Effect.map(DocsUseCase.readDocs(), (value) => c.json(checkDocs(value), 200)))
