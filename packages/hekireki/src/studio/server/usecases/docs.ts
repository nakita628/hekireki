import { Effect } from 'effect'
import type * as z from 'zod'

import { ContractViolationError } from '../errors/index.js'
import { DocsSchema } from '../routes/index.js'
import * as StudioService from '../services/index.js'

// The docs as last checked, by the object the state holds: a reload replaces that object, and
// between reloads every request would otherwise run the whole DMMF-sized contract check again.
const checked = new WeakMap<object, z.infer<typeof DocsSchema>>()

/**
 * The documentation of the last schema that parsed: models with their client operations, and the client API types.
 *
 * @returns the docs, checked against the Docs contract
 */
export function readDocs() {
  return Effect.gen(function* () {
    const docs = StudioService.studio().state.docs()
    const kept = checked.get(docs)
    if (kept !== undefined) return kept
    const result = DocsSchema.safeParse(docs)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    checked.set(docs, result.data)
    return result.data
  })
}
