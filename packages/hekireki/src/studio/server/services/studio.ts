import * as z from 'zod'

import type * as ClientService from './client.js'
import type * as DatabaseService from './database.js'
import type * as StateService from './state.js'

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
  })
  .readonly()
  .meta({
    description: 'The schema state, database connection and Prisma Client the use cases serve',
  })

// The one mutable cell of the server: a process serves one Studio, and the use cases read
// whichever app was created last.
const holder: { current: z.infer<typeof StudioInstances> | null } = { current: null }

/** Makes the given state, database and client the ones the use cases read; the app calls it once. */
export function configureStudio(input: z.infer<typeof StudioInstances>) {
  // oxlint-disable-next-line custom/no-mutation -- the holder is the one mutable cell: use cases read the latest app
  holder.current = input
}

/** The configured instances; throws when no Studio app has been created yet. */
export function studio() {
  if (holder.current === null) {
    throw new Error(
      'Hekireki Studio is not configured.\n   Create the app with createStudioApp() before serving requests.',
    )
  }
  return holder.current
}
