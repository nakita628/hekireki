import path from 'node:path'

import { Console, Effect, Option, Schema, Stdio } from 'effect'
import { CliError, Command, Flag } from 'effect/unstable/cli'

import { exists } from '../file/index.js'
import { DEFAULT_PORT } from '../studio/server/constants/index.js'
import { ServerListenError } from '../studio/server/errors/index.js'
import { DEFAULT_SCHEMA_PATHS } from './constants.js'

const COMMAND_NAME = 'hekireki'

const STATIC_DIR = path.resolve(import.meta.dirname, '../studio')

// Checked while the command line is read, so a URL Studio has no driver for is answered by this
// sentence rather than by whatever the driver says. The schemes are the four `makeDialect` reads.
const DatabaseUrl = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^(?:postgres|postgresql|mysql|file):/u, {
      message: 'a postgres://, postgresql://, mysql:// or file: connection string',
    }),
  ),
)

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
      return yield* new CliError.UserError({
        cause: `Schema not found: ${explicit}\n   Check the path passed to --schema.`,
      })
    }
    for (const candidate of DEFAULT_SCHEMA_PATHS) {
      if (yield* exists(candidate)) return candidate
    }
    return yield* new CliError.ShowHelp({
      commandPath: [...commandPath],
      errors: [
        new CliError.UserError({
          cause: `No Prisma schema found (looked for ${DEFAULT_SCHEMA_PATHS.join(', ')}).\n   Pass --schema <path> to point at your schema.prisma or a directory of .prisma files.`,
        }),
      ],
    })
  })
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

// An integer in 1–65535, the same check `Config.Port` makes: a port no listener could bind is
// rejected while the command line is read.
const Port = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 }))

const studioFlags = {
  port: Flag.Int('port').pipe(
    Flag.withAlias('p'),
    Flag.withSchema(Port),
    Flag.withDescription(`Port to listen on (default: ${DEFAULT_PORT})`),
    Flag.withMetavar('port'),
    Flag.withDefault(DEFAULT_PORT),
  ),
  // `Flag.String`, not `Flag.Path`: the path primitive rewrites its value to an absolute one, and
  // this flag also takes a directory and reports a missing path in its own words.
  schema: Flag.String('schema').pipe(
    Flag.withAlias('s'),
    Flag.withDescription(
      `Path to schema.prisma or a directory of .prisma files (default: ${DEFAULT_SCHEMA_PATHS.join(', then ')})`,
    ),
    Flag.withMetavar('schema.prisma|dir'),
    Flag.optional,
  ),
  url: Flag.String('url').pipe(
    Flag.withAlias('u'),
    Flag.withSchema(DatabaseUrl),
    Flag.withDescription(
      'Database connection URL for browsing and editing data (default: `url` in hekireki.config.ts, then the variable datasource.url names in prisma.config.ts or the schema, read from the environment or .env; DATABASE_URL when it names none)',
    ),
    Flag.withMetavar('connection-string'),
    Flag.optional,
  ),
}

// The server pulls in Hono, the Prisma schema engine and the database drivers, which `--help`,
// `--version` and a rejected command line must not pay for, so it is imported when it runs.
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
    }).pipe(
      Effect.mapError(
        (error) =>
          new CliError.UserError({
            cause:
              error instanceof ServerListenError && error.code === 'EADDRINUSE'
                ? `Port ${error.port} is already in use. Pass -p <port> to use another port.`
                : error.message,
          }),
      ),
    )
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

const seedFlags = {
  config: Flag.String('config').pipe(
    Flag.withAlias('c'),
    Flag.withDescription(
      'Path to the config, a TypeScript file (default: hekireki.config.ts in the working directory)',
    ),
    Flag.withMetavar('hekireki.config.ts'),
    Flag.optional,
  ),
  schema: Flag.String('schema').pipe(
    Flag.withAlias('s'),
    Flag.withDescription(
      `Path to schema.prisma or a directory of .prisma files (default: \`schema\` in the config, then ${DEFAULT_SCHEMA_PATHS.join(', then ')})`,
    ),
    Flag.withMetavar('schema.prisma|dir'),
    Flag.optional,
  ),
  url: Flag.String('url').pipe(
    Flag.withAlias('u'),
    Flag.withSchema(DatabaseUrl),
    Flag.withDescription(
      'Database connection URL to insert into (default: `url` in hekireki.config.ts, then the variable datasource.url names in prisma.config.ts or the schema, read from the environment or .env; DATABASE_URL when it names none)',
    ),
    Flag.withMetavar('connection-string'),
    Flag.optional,
  ),
  sql: Flag.String('sql').pipe(
    Flag.withDescription('Write the rows to this SQL file instead of inserting them'),
    Flag.withMetavar('seed.sql'),
    Flag.optional,
  ),
  seed: Flag.Int('seed').pipe(
    Flag.withDescription(
      'The faker seed; the same seed always gives the same rows (left out: every run differs)',
    ),
    Flag.withMetavar('n'),
    Flag.optional,
  ),
  count: Flag.Int('count').pipe(
    Flag.withAlias('n'),
    Flag.withDescription(
      'Rows for every faker model, over the per-model counts of the config; models given as data keep their rows (left out: the config decides, and only the configured models are seeded)',
    ),
    Flag.withMetavar('rows'),
    Flag.optional,
  ),
  locale: Flag.String('locale').pipe(
    Flag.withAlias('l'),
    Flag.withDescription(
      "Faker locale, or a comma-separated list tried in order (left out: faker's English)",
    ),
    Flag.withMetavar('ja,en'),
    Flag.optional,
  ),
  reset: Flag.Boolean('reset').pipe(
    Flag.withDescription('Delete every row of the seeded tables before inserting'),
    Flag.withDefault(false),
  ),
}

// The seeder pulls in faker with every locale, the Prisma schema engine and the database drivers,
// so it is imported when it runs.
function runSeedCommand(args: Command.Command.Config.Infer<typeof seedFlags>) {
  return Effect.gen(function* () {
    const { runSeed, seedBanner } = yield* Effect.promise(() => import('../seed/run.js'))
    const report = yield* runSeed(
      {
        config: Option.getOrNull(args.config),
        schema: Option.getOrNull(args.schema),
        url: Option.getOrNull(args.url),
        output: Option.getOrNull(args.sql),
        seed: Option.getOrNull(args.seed),
        count: Option.getOrNull(args.count),
        locale: Option.getOrNull(args.locale),
        reset: args.reset,
      },
      process.cwd(),
    ).pipe(Effect.mapError((error) => new CliError.UserError({ cause: error.message })))
    yield* Console.log(seedBanner(report))
  })
}

const seed = Command.make('seed', seedFlags, runSeedCommand).pipe(
  Command.withDescription(
    'Fill the database with faker rows that follow the schema: relations, enums, unique keys and date ranges',
  ),
  Command.withExamples([
    {
      command: `${COMMAND_NAME} seed`,
      description: 'Read hekireki.config.ts and insert into the database named by DATABASE_URL',
    },
    {
      command: `${COMMAND_NAME} seed --sql prisma/seed.sql`,
      description: 'Write the same rows as a SQL script instead of inserting them',
    },
    {
      command: `${COMMAND_NAME} seed --reset --seed 7 --count 100`,
      description: 'Empty the seeded tables first, then insert 100 rows per model from seed 7',
    },
    {
      command: `${COMMAND_NAME} seed --locale ja`,
      description: 'Japanese names, addresses and text',
    },
  ]),
)

const migrateCheckFlags = {
  schema: Flag.String('schema').pipe(
    Flag.withAlias('s'),
    Flag.withDescription(
      `Path to the schema about to be migrated: schema.prisma or a directory of .prisma files (default: ${DEFAULT_SCHEMA_PATHS.join(', then ')})`,
    ),
    Flag.withMetavar('schema.prisma|dir'),
    Flag.optional,
  ),
  url: Flag.String('url').pipe(
    Flag.withAlias('u'),
    Flag.withSchema(DatabaseUrl),
    Flag.withDescription(
      'Database connection URL to check, read only (default: `url` in hekireki.config.ts, then the variable datasource.url names in prisma.config.ts or the schema, read from the environment or .env; DATABASE_URL when it names none)',
    ),
    Flag.withMetavar('connection-string'),
    Flag.optional,
  ),
  decisions: Flag.String('decisions').pipe(
    Flag.withAlias('d'),
    Flag.withDescription(
      'Path to the decisions made on the Migrate page of `hekireki studio`: what becomes of the rows that stand in the way (default: .hekireki/migrate.json beside the schema)',
    ),
    Flag.withMetavar('migrate.json'),
    Flag.optional,
  ),
  timeout: Flag.Int('timeout').pipe(
    Flag.withDescription(
      'How long one query may run, in milliseconds, on PostgreSQL and MySQL (default: no limit)',
    ),
    Flag.withMetavar('ms'),
    Flag.optional,
  ),
  json: Flag.Boolean('json').pipe(
    Flag.withDescription('Print the report as JSON, every check with its count and SQL'),
    Flag.withDefault(false),
  ),
}

/** The command line of `migrate check` as the runner reads it. */
function migrateInput(
  args: {
    readonly url: Option.Option<string>
    readonly decisions: Option.Option<string>
    readonly timeout: Option.Option<number>
  },
  schemaPath: string,
) {
  return {
    schemaPath,
    url: Option.getOrNull(args.url),
    decisions: Option.getOrNull(args.decisions),
    timeout: Option.getOrNull(args.timeout),
    cwd: process.cwd(),
    env: process.env,
  }
}

/** Why the data is not ready, as the command fails with it. */
function notReady(summary: { readonly blocking: number; readonly failed: number }) {
  return summary.blocking > 0
    ? `${summary.blocking} blocking problem${summary.blocking === 1 ? '' : 's'} in the data: fix the rows, or decide what becomes of them on the Migrate page of hekireki studio, before migrating.`
    : `${summary.failed} check${summary.failed === 1 ? '' : 's'} could not run.`
}

// The check pulls in the Prisma schema engine and the database drivers, so it is imported when it runs.
function runMigrateCheckCommand(args: Command.Command.Config.Infer<typeof migrateCheckFlags>) {
  return Effect.gen(function* () {
    const schemaPath = yield* resolveSchemaPath(Option.getOrNull(args.schema), [
      COMMAND_NAME,
      'migrate',
      'check',
    ])
    const { checkBanner, checkJson, runMigrateCheck, summarize } = yield* Effect.promise(
      () => import('../migrate/index.js'),
    )
    const report = yield* runMigrateCheck(migrateInput(args, schemaPath)).pipe(
      Effect.mapError((error) => new CliError.UserError({ cause: error.message })),
    )
    yield* Console.log(args.json ? checkJson(report) : checkBanner(report))
    const summary = summarize(report)
    if (!summary.ok) yield* new CliError.UserError({ cause: notReady(summary) })
  })
}

const migrateCheck = Command.make('check', migrateCheckFlags, runMigrateCheckCommand).pipe(
  Command.withDescription(
    'Check the rows of the database against the schema about to be migrated: NULLs in a column turning required, duplicates under a new unique key, orphans of a foreign key, values an enum drops, and the data a dropped table or column takes with it. Read only; fails when something blocks.',
  ),
  Command.withExamples([
    {
      command: `${COMMAND_NAME} migrate check`,
      description: 'Check the edited schema against the database named by DATABASE_URL',
    },
    {
      command: `${COMMAND_NAME} migrate check --url postgresql://readonly@prod/app`,
      description: 'Check the production data before `prisma migrate deploy` runs on it',
    },
    {
      command: `${COMMAND_NAME} migrate check --json`,
      description: 'A report for CI: every check, its count and the SQL that counted it',
    },
    {
      command: `${COMMAND_NAME} migrate check --timeout 30000`,
      description: 'Stop any query that runs longer than 30 seconds',
    },
  ]),
)

const migratePlanFlags = {
  schema: migrateCheckFlags.schema,
  url: migrateCheckFlags.url,
  decisions: migrateCheckFlags.decisions,
  timeout: migrateCheckFlags.timeout,
  migration: Flag.String('migration').pipe(
    Flag.withAlias('m'),
    Flag.withDescription(
      "The migration.sql Prisma wrote for the schema (`prisma migrate dev --create-only`): the plan is then the whole migration, the fixes first and what the migration itself has to do written into Prisma's statements",
    ),
    Flag.withMetavar('migration.sql'),
    Flag.optional,
  ),
  batch: Flag.Int('batch').pipe(
    Flag.withDescription(
      'Run a fix over more rows than this that many at a time, one statement after another, so none holds its locks for the whole table (default: every fix in one statement; no effect inside the one DO block of PostgreSQL)',
    ),
    Flag.withMetavar('rows'),
    Flag.optional,
  ),
  output: Flag.String('output').pipe(
    Flag.withAlias('o'),
    Flag.withDescription(
      'Write the SQL to this file and print the report (default: the SQL to stdout)',
    ),
    Flag.withMetavar('fixes.sql'),
    Flag.optional,
  ),
}

function runMigratePlanCommand(args: Command.Command.Config.Infer<typeof migratePlanFlags>) {
  return Effect.gen(function* () {
    const schemaPath = yield* resolveSchemaPath(Option.getOrNull(args.schema), [
      COMMAND_NAME,
      'migrate',
      'plan',
    ])
    const { checkBanner, planSql, readMigration, runMigrateCheck, summarize, writePlan } =
      yield* Effect.promise(() => import('../migrate/index.js'))
    const report = yield* runMigrateCheck(migrateInput(args, schemaPath)).pipe(
      Effect.mapError((error) => new CliError.UserError({ cause: error.message })),
    )
    const migrationPath = Option.getOrNull(args.migration)
    const migration =
      migrationPath === null
        ? null
        : yield* readMigration(path.resolve(migrationPath)).pipe(
            Effect.mapError((error) => new CliError.UserError({ cause: error.message })),
          )
    const batch = Option.getOrNull(args.batch)
    if (batch !== null && batch < 1) {
      yield* new CliError.UserError({ cause: '--batch takes a number of rows, 1 or more.' })
    }
    const { sql, errors, notes } = planSql(report, migration, batch)
    if (errors.length > 0) yield* new CliError.UserError({ cause: errors.join('\n') })
    const output = Option.getOrNull(args.output)
    const noted = notes.map((note) => `   ${note}`).join('\n')
    if (output === null) {
      // The SQL alone on stdout, to redirect into a file; what to know about it on stderr.
      yield* Console.log(sql.trimEnd())
      yield* Console.error(noted)
    } else {
      const file = path.resolve(output)
      yield* writePlan(sql, file).pipe(
        Effect.mapError((error) => new CliError.UserError({ cause: error.message })),
      )
      yield* Console.log(`${checkBanner(report)}\n\n   Plan: ${file}\n${noted}`)
    }
    const summary = summarize(report)
    if (!summary.ok) yield* new CliError.UserError({ cause: notReady(summary) })
  })
}

const migratePlan = Command.make('plan', migratePlanFlags, runMigratePlanCommand).pipe(
  Command.withDescription(
    'Write the fixes decided on the Migrate page of hekireki studio as SQL to run before the migration: the UPDATEs and DELETEs `migrate check` counted them by. With --migration, the whole migration Prisma wrote, the fixes first and the renames, conversions, fills and new enum members written into it. Reads the database, writes nothing to it; fails when something still blocks.',
  ),
  Command.withExamples([
    {
      command: `${COMMAND_NAME} migrate plan > fixes.sql`,
      description: 'The SQL on stdout, to paste at the top of the migration Prisma writes',
    },
    {
      command: `${COMMAND_NAME} migrate plan -o prisma/fixes.sql`,
      description: 'Write it to a file and print the report of the check',
    },
    {
      command: `${COMMAND_NAME} migrate plan -m prisma/migrations/20260915_rename/migration.sql -o prisma/migrations/20260915_rename/migration.sql`,
      description:
        'Rewrite the migration Prisma wrote: the fixes first, renames, conversions and fills in its statements',
    },
    {
      command: `${COMMAND_NAME} migrate plan --batch 10000 -o prisma/fixes.sql`,
      description: 'On a large table in use: a fix over more than 10000 rows runs 10000 at a time',
    },
  ]),
)

const migrate = Command.make('migrate').pipe(
  Command.withDescription('Data checks and fixes for a schema migration'),
  Command.withSubcommands([migrateCheck, migratePlan]),
)

const cli = Command.make(COMMAND_NAME).pipe(
  Command.withDescription('⚡️ Prisma schema tools'),
  Command.withSubcommands([studio, seed, migrate]),
)

export function hekirekiCli(argv: readonly string[], config: { readonly version: string }) {
  return Command.runWith(cli, config)(argv)
}

/** The entry point the bin runs, reading its arguments the way `Command.run` does. */
export function hekireki(config: { readonly version: string }) {
  return Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio
    const argv = yield* stdio.args
    return yield* hekirekiCli(argv, config)
  })
}
