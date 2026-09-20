import { Duration, Effect, Schedule, Stream } from 'effect'
import * as z from 'zod'

import { watch } from '../../../file/index.js'
import { migrationsStamp } from '../../../migrate/adapter/migrations-dir.js'
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

const WatchMigrationsInput = z
  .object({
    state: z
      .custom<ReturnType<typeof StateService.createStudioState>>()
      .meta({ description: 'The state whose migrations stamp is moved on.' }),
    dir: z
      .string()
      .meta({ description: 'The migrations directory.', example: 'prisma/migrations' }),
    intervalMs: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'How often the directory is read.', example: 1000 }),
  })
  .readonly()
  .meta({ description: 'The state to tell, the migrations directory and how often to read it' })

/**
 * Tells the state whenever the migrations directory changes: a migration added by `prisma migrate
 * dev`, one edited by hand, a `git pull` that brings others. The directory is read on an interval
 * rather than watched, because it may not exist until the first migration is written, and
 * watching the directory above it would mean watching everything beside it.
 */
export function watchMigrations(input: z.infer<typeof WatchMigrationsInput>) {
  return Stream.fromEffectSchedule(
    migrationsStamp(input.dir),
    Schedule.spaced(Duration.millis(input.intervalMs)),
  ).pipe(
    Stream.changes,
    // The first reading is how the directory was when Studio started, not a change to it.
    Stream.drop(1),
    Stream.runForEach(() => Effect.sync(input.state.touchMigrations)),
    Effect.forkScoped,
    Effect.asVoid,
  )
}
