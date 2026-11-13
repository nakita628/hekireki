import { Effect } from 'effect'

import * as StudioService from '../services/index.js'

/**
 * The documentation of the last schema that parsed: models with their client operations, and the client API types.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as DocsUseCase
 *   participant S as StudioService
 *   H->>U: readDocs()
 *   U->>S: studio().state.docs()
 *   S-->>U: models with their operations, client API types
 *   U-->>H: docs
 * ```
 *
 * @returns the docs as the state holds them
 */
export function readDocs() {
  return Effect.sync(() => StudioService.studio().state.docs())
}
