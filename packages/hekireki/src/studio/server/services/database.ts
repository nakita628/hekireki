import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Effect } from 'effect'
import * as z from 'zod'

import { readFile } from '../../../file/index.js'
import {
  makeDatabaseUrl,
  makeDialect,
  makeDotenv,
  makeRedactedUrl,
  makeSqliteFilePath,
} from '../domain/index.js'

type Driver = {
  readonly dialect: 'postgresql' | 'mysql' | 'sqlite'
  readonly query: (
    sql: string,
    params: readonly unknown[],
  ) => Promise<{
    readonly columns: readonly string[]
    readonly rows: readonly Readonly<Record<string, unknown>>[]
    readonly rowCount: number
  }>
  readonly close: () => Promise<void>
}

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string }

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

function columnsOf(rows: readonly Readonly<Record<string, unknown>>[], fields: readonly string[]) {
  return fields.length > 0 ? fields : Object.keys(rows[0] ?? {})
}

async function importFromProject(specifier: string, cwd: string): Promise<Result<unknown>> {
  const resolver = createRequire(path.join(cwd, 'package.json'))
  try {
    const resolved = resolver.resolve(specifier)
    const namespace: unknown = await import(pathToFileURL(resolved).href)
    const result = ModuleNamespace.safeParse(namespace)
    return { ok: true, value: result.success ? result.data.default : namespace }
  } catch (e) {
    return {
      ok: false,
      error: `Cannot load "${specifier}" from ${cwd}: ${e instanceof Error ? e.message : String(e)}\n   Install it in your project (npm install ${specifier}) so Hekireki Studio can connect to the database.`,
    }
  }
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

function isReadStatement(sql: string) {
  return /^\s*(?:select|with|pragma|explain|show|describe|values)\b/iu.test(sql)
}

async function openSqlite(url: string, baseDir: string): Promise<Result<Driver>> {
  const result = SqliteModule.safeParse(await import('node:sqlite').catch((e: unknown) => e))
  if (!result.success) {
    return {
      ok: false,
      error:
        'SQLite support needs the built-in node:sqlite module (Node.js 22.13 or newer).\n   Upgrade Node.js or pass --url pointing at a PostgreSQL/MySQL database.',
    }
  }
  try {
    const db = new result.data.DatabaseSync(makeSqliteFilePath({ url, baseDir }))
    return {
      ok: true,
      value: {
        dialect: 'sqlite',
        query: (sql, params) => {
          const statement = db.prepare(sql)
          if (isReadStatement(sql)) {
            // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
            const rows = DriverRows.catch([]).parse(statement.all(...params))
            return Promise.resolve({ columns: columnsOf(rows, []), rows, rowCount: rows.length })
          }
          // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
          const { changes } = SqliteRunInfo.catch({ changes: 0 }).parse(statement.run(...params))
          return Promise.resolve({ columns: [], rows: [], rowCount: changes })
        },
        close: () => {
          db.close()
          return Promise.resolve()
        },
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
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

async function openPostgres(url: string, cwd: string): Promise<Result<Driver>> {
  const mod = await importFromProject('pg', cwd)
  if (!mod.ok) return mod
  const result = PgModule.safeParse(mod.value)
  if (!result.success) {
    return { ok: false, error: 'The "pg" package does not export Client.' }
  }
  try {
    const client = new result.data.Client({ connectionString: url })
    await client.connect()
    return {
      ok: true,
      value: {
        dialect: 'postgresql',
        query: async (sql, params) => {
          // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
          const { rows, fields, rowCount } = PgResult.catch({ rows: [] }).parse(
            await client.query(sql, params),
          )
          const columns = columnsOf(
            rows,
            (fields ?? []).map((f) => f.name),
          )
          return { columns, rows, rowCount: rowCount ?? rows.length }
        },
        close: () => client.end(),
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
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

async function openMysql(url: string, cwd: string): Promise<Result<Driver>> {
  const mod = await importFromProject('mysql2/promise', cwd)
  if (!mod.ok) return mod
  const result = MysqlModule.safeParse(mod.value)
  if (!result.success) {
    return { ok: false, error: 'The "mysql2/promise" module does not export createConnection.' }
  }
  try {
    const connection = await result.data.createConnection(url)
    return {
      ok: true,
      value: {
        dialect: 'mysql',
        query: async (sql, params) => {
          // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
          const [data, fields] = MysqlResult.catch([[], undefined]).parse(
            await connection.query(sql, params),
          )
          if (Array.isArray(data)) {
            const names = (fields ?? []).map((f) => f.name)
            return { columns: columnsOf(data, names), rows: data, rowCount: data.length }
          }
          return { columns: [], rows: [], rowCount: data.affectedRows }
        },
        close: () => connection.end(),
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const OpenDriverInput = z
  .object({
    dialect: z
      .enum(['postgresql', 'mysql', 'sqlite'])
      .meta({ description: 'The driver to open.', example: 'sqlite' }),
    url: z.string().meta({ description: 'The connection URL.', example: 'file:./dev.db' }),
    cwd: z.string().meta({ description: 'Where pg / mysql2 are resolved from.', example: '/app' }),
    schemaDir: z
      .string()
      .meta({ description: 'Where relative sqlite files resolve from.', example: '/app/prisma' }),
  })
  .readonly()
  .meta({
    description:
      'The dialect to open, its URL, and the directories drivers and sqlite files resolve against',
  })

/** Opens sqlite through node:sqlite, or pg / mysql2 loaded from the project in cwd. */
export function openDriver(options: z.infer<typeof OpenDriverInput>): Promise<Result<Driver>> {
  switch (options.dialect) {
    case 'sqlite':
      return openSqlite(options.url, options.schemaDir)
    case 'postgresql':
      return openPostgres(options.url, options.cwd)
    case 'mysql':
      return openMysql(options.url, options.cwd)
    default:
      return Promise.resolve({
        ok: false,
        error: `Unsupported dialect: ${String(options.dialect)}`,
      })
  }
}

const CLOSED = Promise.resolve()

const DISCONNECTED = {
  connected: false,
  dialect: null,
  url: null,
  source: null,
  error: null,
} as const

export function disconnectedDbState(error: string | null = null): {
  readonly status: () => {
    readonly connected: boolean
    readonly dialect: 'postgresql' | 'mysql' | 'sqlite' | null
    readonly url: string | null
    readonly source: 'flag' | 'env' | 'config' | null
    readonly error: string | null
  }
  readonly driver: () => Driver | null
  readonly close: () => Promise<void>
} {
  return {
    status: () => ({ ...DISCONNECTED, error }),
    driver: () => null,
    close: () => CLOSED,
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

/** Resolves the URL, picks the dialect and opens the driver; failures become a disconnected state with the reason. */
export function connectDatabase(options: z.infer<typeof ConnectDatabaseInput>) {
  return Effect.gen(function* () {
    const dotenv = yield* readFile(path.join(options.cwd, '.env')).pipe(
      Effect.map((text) => makeDotenv({ text })),
      Effect.orElseSucceed(() => ({})),
    )
    const configText = yield* readFile(path.join(options.cwd, 'prisma.config.ts')).pipe(
      Effect.orElseSucceed(() => null),
    )
    const resolved = makeDatabaseUrl({
      explicit: options.explicitUrl,
      env: options.env,
      dotenv,
      configText,
    })
    if (!resolved.ok) return disconnectedDbState(resolved.error)
    const dialect = makeDialect({
      url: resolved.value.url,
      schemaProvider: options.schemaProvider,
    })
    if (dialect === null) {
      return disconnectedDbState(
        `Cannot tell which database "${makeRedactedUrl({ url: resolved.value.url })}" points at.\n   Use a postgresql://, mysql:// or file: URL.`,
      )
    }
    const driver = yield* Effect.promise(() =>
      openDriver({
        dialect,
        url: resolved.value.url,
        cwd: options.cwd,
        schemaDir: options.schemaDir,
      }),
    )
    if (!driver.ok) return disconnectedDbState(driver.error)
    const status = {
      connected: true,
      dialect,
      url: makeRedactedUrl({ url: resolved.value.url }),
      source: resolved.value.source,
      error: null,
    }
    return {
      status: () => status,
      driver: () => driver.value,
      close: () => driver.value.close(),
    }
  })
}
