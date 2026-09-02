import path from 'node:path'

import { Console, Effect, Option } from 'effect'
import { CliError, Command, Flag } from 'effect/unstable/cli'

import { exists } from '../file/index.js'
import { DEFAULT_PORT } from '../studio/server/constants/index.js'
import { ServerListenError } from '../studio/server/errors/index.js'
import { startStudioServer } from '../studio/server/start.js'

export const DEFAULT_SCHEMA_PATHS = ['prisma/schema.prisma', 'schema.prisma'] as const

const STATIC_DIR = path.resolve(import.meta.dirname, '../studio')

function userError(message: string) {
  return new CliError.UserError({ cause: new Error(message), userMessage: message })
}

/** The explicit schema when it exists, else the first default path that does. */
export function resolveSchemaPath(explicit: string | null) {
  return Effect.gen(function* () {
    if (explicit !== null) {
      if (yield* exists(explicit)) return explicit
      return yield* userError(
        `Schema not found: ${explicit}\n   Check the path passed to --schema.`,
      )
    }
    for (const candidate of DEFAULT_SCHEMA_PATHS) {
      if (yield* exists(candidate)) return candidate
    }
    return yield* userError(
      `No Prisma schema found (looked for ${DEFAULT_SCHEMA_PATHS.join(', ')}).\n   Pass --schema <path> to point at your schema.prisma or a directory of .prisma files.`,
    )
  })
}

function startError(error: Effect.Error<ReturnType<typeof startStudioServer>>) {
  return error instanceof ServerListenError && error.code === 'EADDRINUSE'
    ? userError(`Port ${error.port} is already in use. Pass -p <port> to use another port.`)
    : userError(error.message)
}

export function studioBanner(options: {
  readonly port: number
  readonly schemaPath: string
  readonly error: string | null
  readonly database: {
    readonly connected: boolean
    readonly dialect: string | null
    readonly url: string | null
    readonly error: string | null
  }
}) {
  const lines = [
    `⚡️ Hekireki Studio started at http://localhost:${options.port}`,
    `📄 Schema: ${path.resolve(options.schemaPath)} (watching for changes)`,
    options.database.connected
      ? `🗄️  Database: ${options.database.dialect ?? ''} ${options.database.url ?? ''}`.trimEnd()
      : `🗄️  Database: not connected (schema only)\n   ${options.database.error ?? ''}`.trimEnd(),
    ...(options.error === null
      ? []
      : [`⚠️  Schema has errors, fix them and Studio will reload:\n${options.error}`]),
  ]
  return lines.join('\n')
}

export function docsBanner(options: {
  readonly port: number
  readonly schemaPath: string
  readonly error: string | null
}) {
  const lines = [
    `⚡️ Hekireki Docs started at http://localhost:${options.port}/docs`,
    `📄 Schema: ${path.resolve(options.schemaPath)} (watching for changes)`,
    ...(options.error === null
      ? []
      : [`⚠️  Schema has errors, fix them and the docs will reload:\n${options.error}`]),
  ]
  return lines.join('\n')
}

const port = Flag.integer('port').pipe(
  Flag.withAlias('p'),
  Flag.withDescription('Port to listen on'),
  Flag.withDefault(DEFAULT_PORT),
)

const schema = Flag.string('schema').pipe(
  Flag.withAlias('s'),
  Flag.withDescription(
    `Path to schema.prisma or a directory of .prisma files (default: ${DEFAULT_SCHEMA_PATHS.join(', then ')})`,
  ),
  Flag.optional,
)

const url = Flag.string('url').pipe(
  Flag.withAlias('u'),
  Flag.withDescription(
    'Database connection URL for browsing and editing data (default: DATABASE_URL from the environment or .env, then datasource.url in prisma.config.ts)',
  ),
  Flag.optional,
)

function runStudio(config: {
  readonly port: number
  readonly schema: Option.Option<string>
  readonly url: Option.Option<string>
}) {
  return Effect.gen(function* () {
    const schemaPath = yield* resolveSchemaPath(Option.getOrNull(config.schema))
    const started = yield* startStudioServer({
      schemaPath,
      port: config.port,
      staticDir: STATIC_DIR,
      databaseUrl: Option.getOrNull(config.url),
    }).pipe(Effect.mapError(startError))
    yield* Console.log(
      studioBanner({
        port: config.port,
        schemaPath,
        error: started.snapshot.error,
        database: started.database,
      }),
    )
    yield* Effect.never
  }).pipe(Effect.scoped)
}

// Docs are Studio's /docs page served straight from the schema: nothing is generated and no
// database is opened.
function runDocs(config: { readonly port: number; readonly schema: Option.Option<string> }) {
  return Effect.gen(function* () {
    const schemaPath = yield* resolveSchemaPath(Option.getOrNull(config.schema))
    const started = yield* startStudioServer({
      schemaPath,
      port: config.port,
      staticDir: STATIC_DIR,
      databaseUrl: null,
      database: false,
    }).pipe(Effect.mapError(startError))
    yield* Console.log(docsBanner({ port: config.port, schemaPath, error: started.snapshot.error }))
    yield* Effect.never
  }).pipe(Effect.scoped)
}

const studio = Command.make('studio', { port, schema, url }, runStudio).pipe(
  Command.withDescription(
    'Open Hekireki Studio: ER diagram, model data and SQL for a Prisma schema',
  ),
)

const docsServe = Command.make('serve', { port, schema }, runDocs).pipe(
  Command.withDescription('Serve the schema documentation, live from schema.prisma'),
)

const docs = Command.make('docs').pipe(
  Command.withDescription('Documentation tools'),
  Command.withSubcommands([docsServe]),
)

/** The `hekireki` command tree; run it with `Command.run` / `Command.runWith`. */
export const hekireki = Command.make('hekireki').pipe(
  Command.withDescription('⚡️ Prisma schema tools'),
  Command.withSubcommands([studio, docs]),
)
