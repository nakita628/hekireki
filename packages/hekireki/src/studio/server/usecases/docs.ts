import { Effect } from 'effect'

import * as StudioService from '../services/index.js'

/**
 * The documentation of the last schema that parsed: models with their client operations, and the client API types.
 *
 * @returns the docs as the state holds them
 */
export function readDocs() {
  return Effect.sync(() => StudioService.studio().state.docs())
}
