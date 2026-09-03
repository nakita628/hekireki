import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Effect } from 'effect'
import * as z from 'zod'

import { readFile } from '../../../file/index.js'
import * as DatabaseErrorDomain from '../domain/database-error.js'
import * as SqlDomain from '../domain/sql.js'
import * as UrlDomain from '../domain/url.js'
import { DatabaseError, DatabaseUnavailableError } from '../errors/index.js'

type Statement = { readonly sql: string; readonly params: readonly unknown[] }

type QueryResult = {
  readonly columns: readonly string[]
  readonly rows: readonly Readonly<Record<string, unknown>>[]
  readonly rowCount: number
}

/** An open connection: every query is an Effect that fails with the driver's message. */
type Driver = {
  readonly dialect: 'postgresql' | 'mysql' | 'sqlite'
  readonly query: (statement: Statement) => Effect.Effect<QueryResult, DatabaseError>
  readonly close: Effect.Effect<void>
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function databaseError(error: unknown) {
  return new DatabaseError({
    cause: DatabaseErrorDomain.makeDatabaseErrorMessage({ message: messageOf(error) }),
  })
}

function unavailable(error: unknown) {
  return new DatabaseUnavailableError({ reason: messageOf(error) })
}

// Driver results as the packages return them, read through zod rather than hand-written guards.
const DriverRows = z
  .array(z.record(z.string(), z.unknown()))
  .meta({ description: 'Rows keyed by column name, as a driver returns them' })

const DriverFields = z
  .array(z.object({ name: z.string().meta({ description: 'The column name.', example: 'id' }) }))
  .meta({ description: 'The column descriptors of a result set' })

const ModuleNamespace = z
  .object({
    default: z.unknown().meta({ description: 'The default export, when the package is CommonJS.' }),
  })
  .meta({ description: 'An imported module namespace' })

/** The package as the user's project resolves it: Studio ships no database drivers of its own. */
function importFromProject(specifier: string, cwd: string) {
  return Effect.tryPromise({
    try: async (): Promise<unknown> => {
      const resolved = createRequire(path.join(cwd, 'package.json')).resolve(specifier)
      const namespace: unknown = await import(pathToFileURL(resolved).href)
      const parsed = ModuleNamespace.safeParse(namespace)
      return parsed.success ? parsed.data.default : namespace
    },
    catch: (error) =>
      new DatabaseUnavailableError({
        reason: `Cannot load "${specifier}" from ${cwd}: ${messageOf(error)}\n   Install it in your project (npm install ${specifier}) so Hekireki Studio can connect to the database.`,
      }),
  })
}

type SqliteStatement = {
  readonly all: (...params: unknown[]) => unknown
  readonly run: (...params: unknown[]) => unknown
}

type SqliteDatabase = {
  readonly prepare: (sql: string) => SqliteStatement
  readonly close: () => void
}

const SqliteModule = z
  .object({
    DatabaseSync: z
      .custom<new (file: string) => SqliteDatabase>((value) => typeof value === 'function')
      .meta({ description: 'The synchronous database class of node:sqlite.' }),
  })
  .meta({ description: 'The node:sqlite module' })

const SqliteRunInfo = z
  .object({ changes: z.number().meta({ description: 'Rows the statement changed.', example: 1 }) })
  .meta({ description: 'What node:sqlite returns from statement.run()' })

const NO_SQLITE =
  'SQLite support needs the built-in node:sqlite module (Node.js 22.13 or newer).\n   Upgrade Node.js or pass --url pointing at a PostgreSQL/MySQL database.'

function openSqlite(url: string, baseDir: string) {
  return Effect.gen(function* () {
    const sqlite = yield* Effect.tryPromise({
      try: () => import('node:sqlite'),
      catch: () => new DatabaseUnavailableError({ reason: NO_SQLITE }),
    })
    const parsed = SqliteModule.safeParse(sqlite)
    if (!parsed.success) return yield* new DatabaseUnavailableError({ reason: NO_SQLITE })
    const db = yield* Effect.try({
      try: () => new parsed.data.DatabaseSync(UrlDomain.makeSqliteFilePath({ url, baseDir })),
      catch: unavailable,
    })
    const driver: Driver = {
      dialect: 'sqlite',
      query: (statement) =>
        Effect.try({
          try: () => {
            const prepared = db.prepare(statement.sql)
            if (SqlDomain.isReadStatement({ sql: statement.sql })) {
              // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
              const rows = DriverRows.catch([]).parse(prepared.all(...statement.params))
              return { columns: Object.keys(rows[0] ?? {}), rows, rowCount: rows.length }
            }
            // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
            const info = SqliteRunInfo.catch({ changes: 0 }).parse(
              prepared.run(...statement.params),
            )
            return { columns: [], rows: [], rowCount: info.changes }
          },
          catch: databaseError,
        }),
      close: Effect.sync(() => {
        db.close()
      }),
    }
    return driver
  })
}

type PgClient = {
  readonly connect: () => Promise<void>
  readonly end: () => Promise<void>
  readonly query: (sql: string, params: readonly unknown[]) => Promise<unknown>
}

const PgModule = z
  .object({
    Client: z
      .custom<new (options: { connectionString: string }) => PgClient>(
        (value) => typeof value === 'function',
      )
      .meta({ description: 'The pg Client class.' }),
  })
  .meta({ description: 'The pg module' })

const PgResult = z
  .object({
    rows: DriverRows,
    fields: DriverFields.optional(),
    rowCount: z
      .number()
      .nullable()
      .optional()
      .meta({ description: 'Rows affected or returned.', example: 1 }),
  })
  .meta({ description: 'What pg returns from client.query()' })

function openPostgres(url: string, cwd: string) {
  return Effect.gen(function* () {
    const parsed = PgModule.safeParse(yield* importFromProject('pg', cwd))
    if (!parsed.success) {
      return yield* new DatabaseUnavailableError({
        reason: 'The "pg" package does not export Client.',
      })
    }
    const client = yield* Effect.tryPromise({
      try: async () => {
        const opened = new parsed.data.Client({ connectionString: url })
        await opened.connect()
        // `pg` ignores Prisma's `?schema=`; without this the tables of a non-public namespace are
        // invisible and every query reports a missing relation.
        const schema = UrlDomain.makePostgresSchema({ url })
        if (schema !== null) {
          const name = SqlDomain.makeIdentifier({ dialect: 'postgresql', name: schema })
          await opened.query(`SET search_path TO ${name}, public`, [])
        }
        return opened
      },
      catch: unavailable,
    })
    const driver: Driver = {
      dialect: 'postgresql',
      query: (statement) =>
        Effect.tryPromise({
          try: async () => {
            // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
            const { rows, fields, rowCount } = PgResult.catch({ rows: [] }).parse(
              await client.query(statement.sql, statement.params),
            )
            const columns = (fields ?? []).map((field) => field.name)
            return {
              columns: columns.length > 0 ? columns : Object.keys(rows[0] ?? {}),
              rows,
              rowCount: rowCount ?? rows.length,
            }
          },
          catch: databaseError,
        }),
      close: Effect.promise(() => client.end()),
    }
    return driver
  })
}

type MysqlConnection = {
  readonly end: () => Promise<void>
  readonly query: (sql: string, params: readonly unknown[]) => Promise<unknown>
}

const MysqlModule = z
  .object({
    createConnection: z
      .custom<(url: string) => Promise<MysqlConnection>>((value) => typeof value === 'function')
      .meta({ description: 'The mysql2/promise connection factory.' }),
  })
  .meta({ description: 'The mysql2/promise module' })

const MysqlResult = z
  .tuple([
    z.union([
      DriverRows,
      z.object({
        affectedRows: z.number().meta({ description: 'Rows a write changed.', example: 1 }),
      }),
    ]),
    DriverFields.optional(),
  ])
  .meta({ description: 'What mysql2 returns from connection.query(): [rows or header, fields]' })

function openMysql(url: string, cwd: string) {
  return Effect.gen(function* () {
    const parsed = MysqlModule.safeParse(yield* importFromProject('mysql2/promise', cwd))
    if (!parsed.success) {
      return yield* new DatabaseUnavailableError({
        reason: 'The "mysql2/promise" module does not export createConnection.',
      })
    }
    const connection = yield* Effect.tryPromise({
      try: () => parsed.data.createConnection(url),
      catch: unavailable,
    })
    const driver: Driver = {
      dialect: 'mysql',
      query: (statement) =>
        Effect.tryPromise({
          try: async () => {
            // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
            const [data, fields] = MysqlResult.catch([[], undefined]).parse(
              await connection.query(statement.sql, statement.params),
            )
            if (!Array.isArray(data)) return { columns: [], rows: [], rowCount: data.affectedRows }
            const columns = (fields ?? []).map((field) => field.name)
            return {
              columns: columns.length > 0 ? columns : Object.keys(data[0] ?? {}),
              rows: data,
              rowCount: data.length,
            }
          },
          catch: databaseError,
        }),
      close: Effect.promise(() => connection.end()),
    }
    return driver
  })
}

const DISCONNECTED = {
  connected: false,
  dialect: null,
  url: null,
  source: null,
  error: null,
} as const

/** The database as the use cases see it: its status, the driver (or why there is none) and how to close it. */
export function disconnectedDatabase(reason: string | null = null): {
  readonly status: {
    readonly connected: boolean
    readonly dialect: 'postgresql' | 'mysql' | 'sqlite' | null
    readonly url: string | null
    readonly source: 'flag' | 'env' | 'config' | null
    readonly error: string | null
  }
  readonly driver: Effect.Effect<Driver, DatabaseUnavailableError>
  readonly close: Effect.Effect<void>
} {
  return {
    status: { ...DISCONNECTED, error: reason },
    driver: Effect.fail(
      new DatabaseUnavailableError({ reason: reason ?? 'No database connected.' }),
    ),
    close: Effect.void,
  }
}

const ConnectDatabaseInput = z
  .object({
    explicitUrl: z
      .string()
      .nullable()
      .meta({ description: 'The --url flag, when given.', example: 'file:./dev.db' }),
    schemaProvider: z
      .string()
      .nullable()
      .meta({ description: 'The datasource provider of the schema.', example: 'sqlite' }),
    cwd: z.string().meta({
      description: 'Where .env, prisma.config.ts and drivers are looked up.',
      example: '/app',
    }),
    schemaDir: z
      .string()
      .meta({ description: 'Where relative sqlite files resolve from.', example: '/app/prisma' }),
    env: z
      .record(z.string(), z.string().optional())
      .readonly()
      .meta({ description: 'The process environment.' }),
  })
  .readonly()
  .meta({
    description: 'Where to look for the database URL and how to resolve relative sqlite files',
  })

/** Resolves the URL, picks the dialect and opens the driver; a failure is a disconnected database that says why. */
export function connectDatabase(options: z.infer<typeof ConnectDatabaseInput>) {
  return Effect.gen(function* () {
    const dotenv = yield* readFile(path.join(options.cwd, '.env')).pipe(
      Effect.map((text) => UrlDomain.makeDotenv({ text })),
      Effect.orElseSucceed(() => ({})),
    )
    const configText = yield* readFile(path.join(options.cwd, 'prisma.config.ts')).pipe(
      Effect.orElseSucceed(() => null),
    )
    const resolved = UrlDomain.makeDatabaseUrl({
      explicit: options.explicitUrl,
      env: options.env,
      dotenv,
      configText,
    })
    if (!resolved.ok) return yield* new DatabaseUnavailableError({ reason: resolved.error })
    const url = UrlDomain.makeRedactedUrl({ url: resolved.value.url })
    const dialect = UrlDomain.makeDialect({
      url: resolved.value.url,
      schemaProvider: options.schemaProvider,
    })
    if (dialect === null) {
      return yield* new DatabaseUnavailableError({
        reason: `Cannot tell which database "${url}" points at.\n   Use a postgresql://, mysql:// or file: URL.`,
      })
    }
    const driver =
      dialect === 'sqlite'
        ? yield* openSqlite(resolved.value.url, options.schemaDir)
        : dialect === 'postgresql'
          ? yield* openPostgres(resolved.value.url, options.cwd)
          : yield* openMysql(resolved.value.url, options.cwd)
    return {
      status: { connected: true, dialect, url, source: resolved.value.source, error: null },
      driver: Effect.succeed(driver),
      close: driver.close,
    }
  }).pipe(
    Effect.catchTag('DatabaseUnavailableError', (error) =>
      Effect.succeed(disconnectedDatabase(error.reason)),
    ),
  )
}
