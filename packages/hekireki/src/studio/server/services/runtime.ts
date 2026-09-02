import { Context, Layer, ManagedRuntime } from 'effect'
import type { FileSystem } from 'effect'
import * as z from 'zod'

import { fileSystemLayer } from '../../../file/index.js'
import type { disconnectedDbState } from './database.js'
import type { createStudioState } from './state.js'

// The instances use cases read from the Effect context; the runtime below provides them.
export class StudioStateTag extends Context.Service<
  StudioStateTag,
  ReturnType<typeof createStudioState>
>()('hekireki/StudioState') {}

export class DatabaseTag extends Context.Service<
  DatabaseTag,
  ReturnType<typeof disconnectedDbState>
>()('hekireki/Database') {}

const ConfigureRuntimeInput = z
  .object({
    state: z
      .custom<ReturnType<typeof createStudioState>>()
      .meta({ description: 'The snapshot store.' }),
    db: z
      .custom<ReturnType<typeof disconnectedDbState>>()
      .meta({ description: 'The database connection state.' }),
  })
  .readonly()
  .meta({ description: 'The schema state and database connection the handlers serve' })

const holder: {
  current: ManagedRuntime.ManagedRuntime<
    StudioStateTag | DatabaseTag | FileSystem.FileSystem,
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
      fileSystemLayer,
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
