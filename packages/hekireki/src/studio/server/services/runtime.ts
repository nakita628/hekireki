import { NodeFileSystem } from '@effect/platform-node'
import { Context, Layer, ManagedRuntime } from 'effect'
import type { FileSystem } from 'effect'
import * as z from 'zod'

import type * as ClientService from './client.js'
import type * as DatabaseService from './database.js'
import type * as StateService from './state.js'

// The instances use cases read from the Effect context; the runtime below provides them.
export class StudioStateTag extends Context.Service<
  StudioStateTag,
  ReturnType<typeof StateService.createStudioState>
>()('hekireki/StudioState') {}

export class DatabaseTag extends Context.Service<
  DatabaseTag,
  ReturnType<typeof DatabaseService.disconnectedDatabase>
>()('hekireki/Database') {}

export class ClientTag extends Context.Service<
  ClientTag,
  ReturnType<typeof ClientService.createProjectClient>
>()('hekireki/Client') {}

const ConfigureRuntimeInput = z
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
    description: 'The schema state, database connection and Prisma Client the handlers serve',
  })

const holder: {
  current: ManagedRuntime.ManagedRuntime<
    StudioStateTag | DatabaseTag | ClientTag | FileSystem.FileSystem,
    never
  > | null
} = { current: null }

/** Builds the runtime the handlers run use cases in; a previously configured runtime is disposed. */
export function configureRuntime(input: z.infer<typeof ConfigureRuntimeInput>) {
  const previous = holder.current
  // oxlint-disable-next-line custom/no-mutation -- the holder is the one mutable cell: handlers read the latest runtime
  holder.current = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(StudioStateTag, input.state),
      Layer.succeed(DatabaseTag, input.db),
      Layer.succeed(ClientTag, input.client),
      NodeFileSystem.layer,
    ),
  )
  if (previous !== null) void previous.dispose()
  return holder.current
}

/** The configured runtime; throws when no Studio app has been created yet. */
export function studioRuntime() {
  if (holder.current === null) {
    throw new Error(
      'Hekireki Studio runtime is not configured.\n   Create the app with createStudioApp() before serving requests.',
    )
  }
  return holder.current
}
