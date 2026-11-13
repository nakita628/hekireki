import { stripVTControlCharacters } from 'node:util'

import { Effect, Semaphore } from 'effect'
import * as z from 'zod'

import { parseSchema } from '../../../schema/index.js'
import type { SchemaFile } from '../../../schema/index.js'
import { ADAPTERS, discoverClient } from '../../../seed/discover.js'
import { withTypeScriptImports } from '../../../seed/resolve.js'
import { ClientQueryError, ClientUnavailableError } from '../errors/index.js'

/** What Prisma Client reports for each statement it sends, once `log` asks for query events. */
const QueryEvent = z
  .object({
    query: z.string().meta({ description: 'The statement.', example: 'SELECT 1' }),
    params: z.string().meta({ description: 'The bound values as JSON text.', example: '[1]' }),
    duration: z.number().meta({ description: 'Milliseconds the database took.', example: 0.4 }),
  })
  .meta({ description: 'A query event of Prisma Client' })

/** Whether the value has the part of a Prisma Client Studio calls, besides the model delegates. */
function isStudioClient(value: unknown): value is {
  readonly $on: (event: 'query', listener: (event: unknown) => void) => void
  readonly $transaction: (operations: readonly unknown[], options?: unknown) => Promise<unknown>
  readonly $disconnect: () => Promise<void>
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['$on', '$transaction', '$disconnect'].every(
      (name) => typeof Reflect.get(value, name) === 'function',
    )
  )
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

const LoadClientInput = z
  .object({
    ...CreateProjectClientInput.unwrap().shape,
    files: z
      .custom<readonly SchemaFile[]>(Array.isArray)
      .meta({ description: 'The schema files, whose generator block names the client.' }),
    onQuery: z
      .custom<
        (event: {
          readonly sql: string
          readonly params: string
          readonly durationMs: number
        }) => void
      >((value) => typeof value === 'function')
      .meta({ description: 'Receives every statement the client sends.' }),
  })
  .readonly()
  .meta({ description: 'The client to load, the schema naming it and where its statements go' })

/**
 * The project's Prisma Client the schema names, opened through the project's driver adapter
 * with query events on, each reported to `onQuery`; or why it cannot be opened.
 *
 * @param input - the database, the project, the schema files and where the statements go
 * @returns the client and where it was loaded from
 */
function loadClient(input: z.infer<typeof LoadClientInput>) {
  return Effect.gen(function* () {
    if (input.target === null) {
      return yield* new ClientUnavailableError({
        reason: input.reason ?? 'No database is connected.',
      })
    }
    const { url, dialect } = input.target
    const schema = yield* parseSchema(input.files).pipe(
      Effect.mapError((error) => new ClientUnavailableError({ reason: error.message })),
    )
    const found = yield* discoverClient({
      generators: schema.generators,
      schemaDir: input.schemaDir,
      cwd: input.cwd,
      url,
      dialect,
      options: { log: [{ emit: 'event', level: 'query' }], errorFormat: 'minimal' },
    })
    if (found.client === null) {
      return yield* new ClientUnavailableError({
        reason: `Prisma Client not found: ${found.reason ?? 'unknown'}.\n   Add a \`prisma-client\` generator to the schema, run \`prisma generate\` and install ${ADAPTERS[dialect].pkg}.`,
      })
    }
    if (!isStudioClient(found.client)) {
      return yield* new ClientUnavailableError({
        reason: `${found.source ?? 'The client'} does not export a Prisma Client with $on, $transaction and $disconnect.`,
      })
    }
    found.client.$on('query', (event) => {
      const result = QueryEvent.safeParse(event)
      if (!result.success) return
      const { query, params, duration } = result.data
      input.onQuery({ sql: query, params, durationMs: duration })
    })
    return { client: found.client, source: found.source ?? 'generated' }
  }).pipe(withTypeScriptImports)
}

/** What Prisma Client threw, as a message: it colours its messages for a terminal. */
function clientError(error: unknown) {
  return new ClientQueryError({
    message: stripVTControlCharacters(
      error instanceof Error ? error.message : String(error),
    ).trim(),
  })
}

/**
 * The project's own Prisma Client, loaded the first time it is asked for (and again after a
 * failure, so a `prisma generate` run meanwhile is picked up), with query events on so every
 * statement it sends is reported. One call runs at a time: the events between its start and its
 * end are the statements that call sent.
 *
 * ```mermaid
 * flowchart LR
 *   in[target + schemaDir + cwd] --> load[parse the schema, find the generated client]
 *   load --> client[(the project's Prisma Client + driver adapter)]
 *   load -->|no database / not generated / no adapter| unavailable[ClientUnavailableError]
 *   client -->|run| out[value + query events + wall time]
 *   client -->|missing delegate / throws| failed[ClientQueryError]
 *   client -->|close| disconnect["$disconnect, a failure only logged"]
 * ```
 *
 * @param input.target - the database the client dials; null when none is connected
 * @param input.reason - why no database is connected, when it is not
 * @param input.schemaDir - where the generator output and sqlite files resolve from
 * @param input.cwd - where the driver adapter package is resolved from
 * @returns `status`, `run` and `close` over the one client, loaded on first use
 */
export function createProjectClient(input: z.infer<typeof CreateProjectClientInput>) {
  const lock = Semaphore.makeUnsafe(1)
  const holder: {
    loaded: Effect.Success<ReturnType<typeof loadClient>> | null
    sink: Parameters<typeof loadClient>[0]['onQuery'] | null
  } = { loaded: null, sink: null }

  function load(files: readonly SchemaFile[]) {
    return Effect.gen(function* () {
      if (holder.loaded !== null) return holder.loaded
      const loaded = yield* loadClient({
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
     * Whether the client loads, and from where.
     *
     * @param files - the schema files, whose generator block names the client
     * @returns available, source and the reason it is not available
     */
    status(files: readonly SchemaFile[]) {
      return load(files).pipe(
        Semaphore.withPermit(lock),
        Effect.match({
          onFailure: (error) => ({ available: false, source: null, error: error.reason }),
          onSuccess: ({ source }) => ({ available: true, source, error: null }),
        }),
      )
    },
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
        const operations = yield* Effect.forEach(
          query.calls,
          (call) => {
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
              catch: clientError,
            })
          },
          { concurrency: 1 },
        )
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
          catch: clientError,
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
    }).pipe(
      Effect.catchTag('UnknownError', (error) =>
        Effect.logDebug('the Prisma Client did not disconnect', error),
      ),
    ),
  }
}
