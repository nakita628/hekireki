import * as z from 'zod'

import type * as ClientService from './client.js'
import type * as DatabaseService from './database.js'
import type * as StateService from './state.js'
import type * as TypescriptService from './typescript.js'

const StudioInstances = z
  .object({
    state: z
      .custom<ReturnType<typeof StateService.createStudioState>>()
      .meta({ description: 'The snapshot store.' }),
    db: z
      .custom<ReturnType<typeof DatabaseService.disconnectedDatabase>>()
      .meta({ description: 'The database connection state.' }),
    client: z
      .custom<ReturnType<typeof ClientService.createProjectClient>>()
      .meta({ description: "The project's Prisma Client, loaded on first use." }),
    typescript: z
      .custom<ReturnType<typeof TypescriptService.createTypeChecker>>()
      .meta({ description: "The TypeScript language service over the client's types." }),
  })
  .readonly()
  .meta({
    description:
      'The schema state, database connection, Prisma Client and type checker the use cases serve',
  })

// The one mutable cell of the server: a process serves one Studio, and the use cases read
// whichever app was created last.
const holder: { current: z.infer<typeof StudioInstances> | null } = { current: null }

/**
 * Makes the given instances the ones the use cases read; the app calls it once.
 *
 * ```mermaid
 * flowchart LR
 *   instances[state, db, client, typescript] --> holder[(the one Studio of the process)]
 * ```
 *
 * @param input.state - the snapshot store
 * @param input.db - the database connection
 * @param input.client - the project's Prisma Client
 * @param input.typescript - the type checker over the client's types
 * @returns nothing; every later use case reads them through studio()
 */
export function configureStudio(input: z.infer<typeof StudioInstances>) {
  // oxlint-disable-next-line custom/no-mutation -- the holder is the one mutable cell: use cases read the latest app
  holder.current = input
}

/**
 * The configured instances.
 *
 * ```mermaid
 * flowchart LR
 *   holder[(the one Studio of the process)] --> instances[state, db, client, typescript]
 * ```
 *
 * @returns what configureStudio was given; a defect when the app was never created
 */
export function studio() {
  if (holder.current === null) {
    // oxlint-disable-next-line custom/no-throw -- a defect (read before the app exists), not a request failure
    throw new Error(
      'Hekireki Studio is not configured.\n   Create the app with createStudioApp() before serving requests.',
    )
  }
  return holder.current
}
