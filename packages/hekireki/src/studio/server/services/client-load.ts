import { Effect } from 'effect'
import * as z from 'zod'

import { ADAPTERS, discoverClient } from '../../../seed/discover.js'
import { withTypeScriptImports } from '../../../seed/resolve.js'
import { parseSchema } from '../../../seed/schema.js'
import type { SchemaFile } from '../../../seed/schema.js'
import { ClientUnavailableError } from '../errors/index.js'

/** What Prisma Client reports for each statement it sends, once `log` asks for query events. */
const QueryEvent = z
  .object({
    query: z.string().meta({ description: 'The statement.', example: 'SELECT 1' }),
    params: z.string().meta({ description: 'The bound values as JSON text.', example: '[1]' }),
    duration: z.number().meta({ description: 'Milliseconds the database took.', example: 0.4 }),
  })
  .meta({ description: 'A query event of Prisma Client' })

/** The part of a Prisma Client Studio calls, besides the model delegates. */
export type StudioClient = {
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

const LoadClientInput = z
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
  .meta({ description: 'The database and the project the Prisma Client is loaded for' })

/**
 * The project's Prisma Client the schema names, opened through the project's driver adapter
 * with query events on, each reported to `onQuery`; or why it cannot be opened.
 *
 * @param input - the database, the project, the schema files and where the statements go
 * @returns the client and where it was loaded from
 */
export function loadClient(input: z.infer<typeof LoadClientInput>) {
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
