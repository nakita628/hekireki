import { Effect } from 'effect'

import { ContractViolationError } from '../errors/index.js'
import { DocsSchema } from '../routes/index.js'
import { StudioStateTag } from '../services/index.js'

/**
 * The documentation of the last schema that parsed: models with their client operations, and the client API types.
 *
 * @returns the docs, checked against the Docs contract
 */
export function readDocs() {
  return Effect.gen(function* () {
    const state = yield* StudioStateTag
    const result = DocsSchema.safeParse(state.docs())
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}
