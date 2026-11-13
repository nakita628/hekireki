import { Duration, Effect, Schedule, Stream } from 'effect'
import * as z from 'zod'

import { watch } from '../../../file/index.js'
import { migrationsStamp } from '../../../migrate/adapter/migrations-dir.js'

const WatchSchemaInput = z
  .object({
    onChange: z
      .custom<() => Effect.Effect<unknown>>((value) => typeof value === 'function')
      .meta({ description: 'What runs after a burst of changes: the reload.' }),
    dir: z.string().meta({ description: 'The directory to watch.', example: 'prisma' }),
    recursive: z.boolean().meta({
      description:
        'Whether to watch below the directory too: a schema directory is read down through its subdirectories, where the directory of a single schema file holds the whole project.',
      example: true,
    }),
    debounceMs: z
      .number()
      .int()
      .min(0)
      .meta({ description: 'Quiet time after the last event.', example: 80 }),
  })
  .readonly()
  .meta({ description: 'What to run, the directory to watch and the debounce window' })

/**
 * Runs `onChange` after a burst of `.prisma` changes; the watcher lives as long as the surrounding
 * scope.
 *
 * ```mermaid
 * flowchart LR
 *   fs[(schema directory)] -->|.prisma events| debounce[debounce] --> onChange
 * ```
 *
 * @param input.onChange - what runs once the burst is over
 * @param input.dir - the directory to watch
 * @param input.recursive - whether its subdirectories are watched too
 * @param input.debounceMs - the quiet time after the last event
 * @returns the forked watcher, released with the scope
 */
export function watchSchema(input: z.infer<typeof WatchSchemaInput>) {
  return watch(input.dir, { recursive: input.recursive }).pipe(
    Stream.filter((event) => event.path.endsWith('.prisma')),
    Stream.debounce(Duration.millis(input.debounceMs)),
    Stream.runForEach(input.onChange),
    Effect.forkScoped,
    Effect.asVoid,
  )
}

const WatchMigrationsInput = z
  .object({
    onChange: z
      .custom<() => void>((value) => typeof value === 'function')
      .meta({ description: 'What runs when the directory changed: the state is told.' }),
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
  .meta({ description: 'What to run, the migrations directory and how often to read it' })

/**
 * Runs `onChange` whenever the migrations directory changes: a migration added by `prisma migrate
 * dev`, one edited by hand, a `git pull` that brings others. The directory is read on an interval
 * rather than watched, because it may not exist until the first migration is written, and
 * watching the directory above it would mean watching everything beside it.
 *
 * ```mermaid
 * flowchart LR
 *   fs[(migrations directory)] -->|stamp every intervalMs| changes[changed?] --> onChange
 * ```
 *
 * @param input.onChange - what runs when the directory changed
 * @param input.dir - the migrations directory
 * @param input.intervalMs - how often it is read
 * @returns the forked poller, released with the scope
 */
export function watchMigrations(input: z.infer<typeof WatchMigrationsInput>) {
  return Stream.fromEffectSchedule(
    migrationsStamp(input.dir),
    Schedule.spaced(Duration.millis(input.intervalMs)),
  ).pipe(
    Stream.changes,
    // The first reading is how the directory was when Studio started, not a change to it.
    Stream.drop(1),
    Stream.runForEach(() => Effect.sync(input.onChange)),
    Effect.forkScoped,
    Effect.asVoid,
  )
}
