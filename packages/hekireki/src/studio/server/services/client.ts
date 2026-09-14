import { stripVTControlCharacters } from 'node:util'

import { Effect, Semaphore } from 'effect'
import * as z from 'zod'

import { ADAPTERS, discoverClient } from '../../../seed/discover.js'
import { withTypeScriptImports } from '../../../seed/resolve.js'
import { parseSchema } from '../../../seed/schema.js'
import { ClientQueryError, ClientUnavailableError } from '../errors/index.js'
import * as TypescriptService from './typescript.js'

/** What Prisma Client reports for each statement it sends, once `log` asks for query events. */
const QueryEvent = z
  .object({
    query: z.string().meta({ description: 'The statement.', example: 'SELECT 1' }),
    params: z.string().meta({ description: 'The bound values as JSON text.', example: '[1]' }),
    duration: z.number().meta({ description: 'Milliseconds the database took.', example: 0.4 }),
  })
  .meta({ description: 'A query event of Prisma Client' })

type SqlEvent = { readonly sql: string; readonly params: string; readonly durationMs: number }

/** The part of a Prisma Client Studio calls, besides the model delegates. */
type StudioClient = {
  readonly $on: (event: 'query', listener: (event: unknown) => void) => void
  readonly $transaction: (operations: readonly unknown[], options?: unknown) => Promise<unknown>
  readonly $disconnect: () => Promise<void>
}

function isStudioClient(value: unknown): value is StudioClient {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['$on', '$transaction', '$disconnect'].every(
      (name) => typeof Reflect.get(value, name) === 'function',
    )
  )
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function'
}

function messageOf(error: unknown) {
  return stripVTControlCharacters(error instanceof Error ? error.message : String(error)).trim()
}

/** The promise of one model operation, not yet sent: Prisma Client runs it once it is awaited. */
function operationOf(
  client: StudioClient,
  call: { readonly delegate: string; readonly operation: string; readonly args: unknown },
) {
  const delegate: unknown = Reflect.get(client, call.delegate)
  const operation: unknown =
    typeof delegate === 'object' && delegate !== null
      ? Reflect.get(delegate, call.operation)
      : undefined
  if (!isFunction(operation)) {
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
    loaded: { readonly client: StudioClient; readonly source: string } | null
    sink: ((event: SqlEvent) => void) | null
  } = { loaded: null, sink: null }

  function load(files: readonly { readonly path: string; readonly content: string }[]) {
    return Effect.gen(function* () {
      if (holder.loaded !== null) return holder.loaded
      if (input.target === null) {
        return yield* new ClientUnavailableError({
          reason: input.reason ?? 'No database is connected.',
        })
      }
      const { url, dialect } = input.target
      const schema = yield* parseSchema(files).pipe(
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
        const parsed = QueryEvent.safeParse(event)
        if (!parsed.success) return
        const { query, params, duration } = parsed.data
        holder.sink?.({ sql: query, params, durationMs: duration })
      })
      const loaded = { client: found.client, source: found.source ?? 'generated' }
      // oxlint-disable-next-line custom/no-mutation -- the client is opened once and kept for the life of Studio
      holder.loaded = loaded
      return loaded
    }).pipe(withTypeScriptImports)
  }

  return {
    /**
     * Whether the client loads, and from where; and whether its types can be completed against.
     *
     * @param files - the schema files, whose generator block names the client
     * @returns available, source and the reason it is not available, with the TypeScript version
     */
    status(files: readonly { readonly path: string; readonly content: string }[]) {
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
      files: readonly { readonly path: string; readonly content: string }[],
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
        const operations = yield* Effect.forEach(query.calls, (call) => operationOf(client, call))
        const events: SqlEvent[] = []
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
