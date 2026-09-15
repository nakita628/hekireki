import { stripVTControlCharacters } from 'node:util'

import { Effect, Semaphore } from 'effect'
import * as z from 'zod'

import type { SchemaFile } from '../../../seed/schema.js'
import { ClientQueryError } from '../errors/index.js'
import * as ClientLoadService from './client-load.js'
import * as TypescriptService from './typescript.js'

function messageOf(error: unknown) {
  return stripVTControlCharacters(error instanceof Error ? error.message : String(error)).trim()
}

/** A client that is never there: Studio without a database, and the tests that need none. */
export function unavailableClient(reason = 'No database is connected.') {
  return createProjectClient({ target: null, reason, schemaDir: '.', cwd: '.' })
}

const CreateProjectClientInput = z
  .object({
    target: z
      .object({
        url: z.string().meta({ description: 'The URL as found.', example: 'file:./dev.db' }),
        dialect: z
          .enum(['postgresql', 'mysql', 'sqlite'])
          .meta({ description: 'Which adapter to open.', example: 'sqlite' }),
      })
      .readonly()
      .nullable()
      .meta({ description: 'The database the client dials; null when none is connected.' }),
    reason: z.string().nullable().meta({
      description: 'Why no database is connected, when it is not.',
      example: 'No database connected.',
    }),
    schemaDir: z.string().meta({
      description: 'Where the generator output and sqlite files resolve from.',
      example: '/app/prisma',
    }),
    cwd: z.string().meta({
      description: 'Where the driver adapter package is resolved from.',
      example: '/app',
    }),
  })
  .readonly()
  .meta({ description: 'The database and the project the Prisma Client is loaded for' })

/**
 * The project's own Prisma Client, loaded the first time it is asked for (and again after a
 * failure, so a `prisma generate` run meanwhile is picked up), with query events on so every
 * statement it sends is reported. One call runs at a time: the events between its start and its
 * end are the statements that call sent.
 */
export function createProjectClient(input: z.infer<typeof CreateProjectClientInput>) {
  const lock = Semaphore.makeUnsafe(1)
  const typescript = TypescriptService.createTypeChecker({
    schemaDir: input.schemaDir,
    cwd: input.cwd,
  })
  const holder: {
    loaded: Effect.Success<ReturnType<typeof ClientLoadService.loadClient>> | null
    sink: Parameters<typeof ClientLoadService.loadClient>[0]['onQuery'] | null
  } = { loaded: null, sink: null }

  function load(files: readonly SchemaFile[]) {
    return Effect.gen(function* () {
      if (holder.loaded !== null) return holder.loaded
      const loaded = yield* ClientLoadService.loadClient({
        ...input,
        files,
        onQuery: (event) => holder.sink?.(event),
      })
      // oxlint-disable-next-line custom/no-mutation -- the client is opened once and kept for the life of Studio
      holder.loaded = loaded
      return loaded
    })
  }

  return {
    /**
     * Whether the client loads, and from where; and whether its types can be completed against.
     *
     * @param files - the schema files, whose generator block names the client
     * @returns available, source and the reason it is not available, with the TypeScript version
     */
    status(files: readonly SchemaFile[]) {
      return Effect.gen(function* () {
        const loaded = yield* load(files).pipe(
          Semaphore.withPermit(lock),
          Effect.match({
            onFailure: (error) => ({ source: null, error: error.reason }),
            onSuccess: ({ source }) => ({ source, error: null }),
          }),
        )
        const types = yield* typescript.status(files)
        return { available: loaded.error === null, ...loaded, ...types }
      })
    },
    /** The TypeScript language service over the project, for completion, hovers, signatures and checks. */
    typescript,
    /**
     * Runs the calls, one by one or as one batch `$transaction`, and collects the statements
     * the client sends meanwhile.
     *
     * @param files - the schema files, for loading the client the first time
     * @param query - the calls, whether they are a transaction, and its options
     * @returns what the client resolved to, the statements and the wall time
     */
    run(
      files: readonly SchemaFile[],
      query: {
        readonly calls: readonly {
          readonly delegate: string
          readonly operation: string
          readonly args: unknown
        }[]
        readonly transaction: boolean
        readonly options: unknown
      },
    ) {
      return Effect.gen(function* () {
        const { client } = yield* load(files)
        // The promises of the operations, not yet sent: Prisma Client runs each once it is awaited.
        const operations = yield* Effect.forEach(query.calls, (call) => {
          const delegate: unknown = Reflect.get(client, call.delegate)
          const operation: unknown =
            typeof delegate === 'object' && delegate !== null
              ? Reflect.get(delegate, call.operation)
              : undefined
          if (typeof operation !== 'function') {
            return Effect.fail(
              new ClientQueryError({
                message: `The loaded Prisma Client has no ${call.delegate}.${call.operation}.\n   Run \`prisma generate\` and restart Studio so the client matches the schema.`,
              }),
            )
          }
          return Effect.try({
            try: (): unknown =>
              Reflect.apply(operation, delegate, call.args === undefined ? [] : [call.args]),
            catch: (error) => new ClientQueryError({ message: messageOf(error) }),
          })
        })
        const events: Parameters<NonNullable<typeof holder.sink>>[0][] = []
        // oxlint-disable-next-line custom/no-mutation -- the query events of this call land here until it settles
        holder.sink = (event) => {
          // oxlint-disable-next-line custom/no-mutation -- collects the events the listener hands over one at a time
          events.push(event)
        }
        const started = performance.now()
        const value = yield* Effect.tryPromise({
          try: () =>
            query.transaction
              ? client.$transaction(operations, query.options)
              : Promise.resolve(operations[0]),
          catch: (error) => new ClientQueryError({ message: messageOf(error) }),
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              // oxlint-disable-next-line custom/no-mutation -- statements sent after this call are not its own
              holder.sink = null
            }),
          ),
        )
        return { value, queries: [...events], durationMs: performance.now() - started }
      }).pipe(Semaphore.withPermit(lock))
    },
    /** Disconnects the client, if one was opened. */
    close: Effect.tryPromise(async () => {
      await holder.loaded?.client.$disconnect()
    }).pipe(Effect.orElseSucceed(() => undefined)),
  }
}
