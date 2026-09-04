import path from 'node:path'

import { Config, Console, Effect, Option, Schema, Stdio } from 'effect'
import { CliError, Command, Flag } from 'effect/unstable/cli'

import { exists } from '../file/index.js'
import { DEFAULT_PORT } from '../studio/server/constants/index.js'
import { ServerListenError } from '../studio/server/errors/index.js'
import type { startStudioServer } from '../studio/server/start.js'

const COMMAND_NAME = 'hekireki'

/** Where `--schema` looks when it is omitted, in order. */
export const DEFAULT_SCHEMA_PATHS = ['prisma/schema.prisma', 'schema.prisma'] as const

// The schemes Studio opens a connection for; `makeDialect` reads the dialect from the same four.
const DATABASE_URL_SCHEMES = ['postgres', 'postgresql', 'mysql', 'file'] as const

const STATIC_DIR = path.resolve(import.meta.dirname, '../studio')

// `Schema.refine` rejects the value while the command line is still being read, so a URL Studio
// has no driver for is answered by the sentence below rather than by whatever the driver says
// when it is handed something it cannot dial.
const databaseUrlSchema = Schema.String.pipe(
  Schema.refine(
    (value): value is string =>
      DATABASE_URL_SCHEMES.some((scheme) => value.startsWith(`${scheme}:`)),
    { message: 'a postgres://, postgresql://, mysql:// or file: connection string' },
  ),
)

function userError(message: string) {
  return new CliError.UserError({ cause: new Error(message), userMessage: message })
}

/** The usage block, with the sentence that asked for it — what the runner renders for a bad line. */
function showHelp(commandPath: readonly string[], message: string) {
  return new CliError.ShowHelp({ commandPath: [...commandPath], errors: [userError(message)] })
}

/**
 * The explicit schema when it exists, else the first default path that does.
 *
 * A path that was typed out and is not there names itself, and the usage block would only bury
 * it. Nothing typed and nothing found is the other case — the command was run somewhere without
 * a schema — and there the usage block is the answer.
 */
export function resolveSchemaPath(explicit: string | null, commandPath: readonly string[]) {
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
    return yield* showHelp(
      commandPath,
      `No Prisma schema found (looked for ${DEFAULT_SCHEMA_PATHS.join(', ')}).\n   Pass --schema <path> to point at your schema.prisma or a directory of .prisma files.`,
    )
  })
}

/** Every way the server can refuse to start, as the one sentence the runner prints. */
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
    `   Schema: ${path.resolve(options.schemaPath)} (watching for changes)`,
    options.database.connected
      ? `   Database: ${options.database.dialect ?? ''} ${options.database.url ?? ''}`.trimEnd()
      : `   Database: not connected (schema only)\n   ${options.database.error ?? ''}`.trimEnd(),
    ...(options.error === null
      ? []
      : [`   Schema has errors, fix them and Studio will reload:\n${options.error}`]),
  ]
  return lines.join('\n')
}

/**
 * The command line itself: what Studio accepts, what each piece means, and the schema every
 * value is decoded through before the handler below ever sees it.
 */
const studioFlags = {
  // `Config.Port` is Effect's own port schema — an integer in 1–65535 — so a port no listener
  // could bind is rejected while the command line is still being read.
  port: Flag.integer('port').pipe(
    Flag.withAlias('p'),
    Flag.withSchema(Config.Port),
    Flag.withDescription(`Port to listen on (default: ${DEFAULT_PORT})`),
    Flag.withMetavar('port'),
    Flag.withDefault(DEFAULT_PORT),
  ),
  // `Flag.string`, not `Flag.path`: the path primitive rewrites its value to an absolute one, and
  // this flag also takes a directory and reports a missing path in its own words, next to the
  // defaults it looked through.
  schema: Flag.string('schema').pipe(
    Flag.withAlias('s'),
    Flag.withDescription(
      `Path to schema.prisma or a directory of .prisma files (default: ${DEFAULT_SCHEMA_PATHS.join(', then ')})`,
    ),
    Flag.withMetavar('schema.prisma|dir'),
    Flag.optional,
  ),
  url: Flag.string('url').pipe(
    Flag.withAlias('u'),
    Flag.withSchema(databaseUrlSchema),
    Flag.withDescription(
      'Database connection URL for browsing and editing data (default: DATABASE_URL from the environment or .env, then datasource.url in prisma.config.ts)',
    ),
    Flag.withMetavar('connection-string'),
    Flag.optional,
  ),
}

/**
 * Studio itself, listening until it is interrupted.
 *
 * It pulls in Hono, the Prisma schema engine and the database drivers. `--help`, `--version`,
 * `--completions` and every rejected command line must not pay for that, so it is imported here
 * rather than at module scope.
 */
function runStudio(args: Command.Command.Config.Infer<typeof studioFlags>) {
  return Effect.gen(function* () {
    const schemaPath = yield* resolveSchemaPath(Option.getOrNull(args.schema), [
      COMMAND_NAME,
      'studio',
    ])
    const { startStudioServer } = yield* Effect.promise(() => import('../studio/server/start.js'))
    const started = yield* startStudioServer({
      schemaPath,
      port: args.port,
      staticDir: STATIC_DIR,
      databaseUrl: Option.getOrNull(args.url),
    }).pipe(Effect.mapError(startError))
    yield* Console.log(
      studioBanner({
        port: args.port,
        schemaPath,
        error: started.snapshot.error,
        database: started.database,
      }),
    )
    yield* Effect.never
  }).pipe(Effect.scoped)
}

const studio = Command.make('studio', studioFlags, runStudio).pipe(
  Command.withDescription(
    'Open Hekireki Studio: ER diagram, docs, model data and SQL for a Prisma schema',
  ),
  Command.withExamples([
    {
      command: `${COMMAND_NAME} studio`,
      description: `Open ./${DEFAULT_SCHEMA_PATHS[0]}, with the database URL from .env`,
    },
    {
      command: `${COMMAND_NAME} studio --schema prisma/schema`,
      description: 'Read a multi-file schema: every .prisma file of the directory, together',
    },
    {
      command: `${COMMAND_NAME} studio --url file:./dev.db`,
      description: 'Browse a SQLite file, resolved from the schema directory as Prisma resolves it',
    },
    { command: `${COMMAND_NAME} studio -p 3000`, description: 'Listen on another port' },
  ]),
)

/** The `hekireki` command tree; run it with {@link hekirekiCli}. */
const cli = Command.make(COMMAND_NAME).pipe(
  Command.withDescription('⚡️ Prisma schema tools'),
  Command.withSubcommands([studio]),
)

/**
 * `help` spelled as Effect's own `--help` action, wherever it sits in the command path: `hekireki
 * help`, `hekireki help studio` and `hekireki studio help` all render the document the CLI already
 * builds, so there is no second copy of the help text to keep in step with the commands.
 *
 * Only the words before the first flag are a command path, so a value that happens to read `help`
 * (`--schema help`) is left alone.
 */
export function helpAsFlag(args: readonly string[]): readonly string[] {
  const flag = args.findIndex((arg) => arg.startsWith('-'))
  const verbs = flag === -1 ? args : args.slice(0, flag)
  const at = verbs.indexOf('help')
  return at === -1 ? args : [...args.slice(0, at), ...args.slice(at + 1), '--help']
}

/**
 * Runs `hekireki` against an argument list: parsing, validation, `--help`, `--version` and shell
 * completions are owned by `effect/unstable/cli`, the commands above are the rest.
 */
export function hekirekiCli(argv: readonly string[], config: { readonly version: string }) {
  return Command.runWith(cli, config)(helpAsFlag(argv))
}

/** The entry point the bin runs, reading its arguments the way `Command.run` does. */
export function hekireki(config: { readonly version: string }) {
  return Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio
    const argv = yield* stdio.args
    return yield* hekirekiCli(argv, config)
  })
}
