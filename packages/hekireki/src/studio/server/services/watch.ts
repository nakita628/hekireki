import { Duration, Effect, Stream } from 'effect'
import * as z from 'zod'

import { watch } from '../../../file/index.js'
import type * as StateService from './state.js'

const WatchSchemaInput = z
  .object({
    state: z
      .custom<ReturnType<typeof StateService.createStudioState>>()
      .meta({ description: 'The snapshot store to reload.' }),
    dir: z.string().meta({ description: 'The directory to watch.', example: 'prisma' }),
    debounceMs: z
      .number()
      .int()
      .min(0)
      .meta({ description: 'Quiet time after the last event.', example: 80 }),
  })
  .readonly()
  .meta({ description: 'The state to reload, the directory to watch and the debounce window' })

/** Reloads the state after a burst of `.prisma` changes; the watcher lives as long as the surrounding scope. */
export function watchSchema(input: z.infer<typeof WatchSchemaInput>) {
  return watch(input.dir).pipe(
    Stream.filter((event) => event.path.endsWith('.prisma')),
    Stream.debounce(Duration.millis(input.debounceMs)),
    Stream.runForEach(() => input.state.reload()),
    Effect.forkScoped,
    Effect.asVoid,
  )
}
