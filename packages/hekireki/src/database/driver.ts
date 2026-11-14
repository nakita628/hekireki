import { tmpdir } from 'node:os'
import path from 'node:path'

import { layer as nodeFileSystemLayer } from '@effect/platform-node/NodeFileSystem'
import { Effect } from 'effect'
import * as z from 'zod'

import { DISCONNECTED, NO_SQLITE, READ_STATEMENT } from '../constants/index.js'
import { importFromProject, removePath } from '../file/index.js'
import { quoteIdentifier, stringLiteral } from '../sql/index.js'
import type { Dialect, UrlSource } from '../types/index.js'
import {
  LibsqlResultSet,
  makeLibsqlQueryResult,
  makeLibsqlRawResult,
  makeMysqlChanges,
  makeMysqlQueryResult,
  makeMysqlRawResult,
  makePgChanges,
  makePgQueryResult,
  makePgRawResult,
  makeSqliteChanges,
  makeSqliteRawResult,
  makeSqliteReadResult,
} from './domain/results.js'
import {
  isLibsqlUrl,
  makeDialect,
  makePostgresSchema,
  makeRedactedUrl,
  makeSqliteFilePath,
} from './domain/url.js'
import { DatabaseError, DatabaseUnavailableError } from './errors.js'
import { resolveDatabaseUrl } from './resolve.js'

/** An open connection: every operation is an Effect that fails with the driver's message. */
export type Driver = {
  readonly dialect: Dialect
  readonly query: (statement: {
    readonly sql: string
    readonly params: readonly unknown[]
  }) => Effect.Effect<
    {
      readonly columns: readonly string[]
      readonly rows: readonly Readonly<Record<string, unknown>>[]
      readonly rowCount: number
    },
    DatabaseError
  >
  /**
   * One statement, its rows positional and its columns described as the database itself types
   * them: the PostgreSQL type OID, the MySQL type code, the declared type on SQLite. What reads
   * this needs the type, which `query` does not carry, and the order, which keying by name loses.
   */
  readonly queryRaw: (statement: {
    readonly sql: string
    readonly params: readonly unknown[]
  }) => Effect.Effect<
    {
      readonly columns: readonly {
        readonly name: string
        readonly nativeType: string | number | null
      }[]
      readonly rows: readonly (readonly unknown[])[]
    },
    DatabaseError
  >
  /** One writing statement; the number of rows it changed. */
  readonly executeRaw: (statement: {
    readonly sql: string
    readonly params: readonly unknown[]
  }) => Effect.Effect<number, DatabaseError>
  /** Several statements separated by semicolons, run as one script. */
  readonly executeScript: (script: string) => Effect.Effect<void, DatabaseError>
  readonly close: Effect.Effect<void>
  /**
   * A SQLite database reached over the network (Turso, a libSQL server) rather than a file: there
   * is no file to copy for a backup or a rehearsal, and `VACUUM INTO` would write on the server.
   */
  readonly remote?: boolean
}

const ModuleNamespace = z
  .object({
    default: z.unknown().meta({ description: 'The default export, when the package is CommonJS.' }),
  })
  .meta({ description: 'An imported module namespace' })

/**
 * A database driver as the user's project resolves it (Studio ships none of its own), the default
 * export of a CommonJS package taken for the module, and a package that is not there said with
 * the way out.
 */
function importDriver(specifier: string, cwd: string) {
  return importFromProject(specifier, cwd).pipe(
    Effect.map((namespace) => {
      const result = ModuleNamespace.safeParse(namespace)
      return result.success ? result.data.default : namespace
    }),
    Effect.mapError(
      (error) =>
        new DatabaseUnavailableError({
          reason: `Cannot load "${specifier}" from ${cwd}: ${error.message}\n   Install it in your project (npm install ${specifier}) so Hekireki can connect to the database.`,
        }),
    ),
  )
}

const SqliteModule = z
  .object({
    DatabaseSync: z
      .custom<
        new (file: string) => {
          readonly prepare: (sql: string) => {
            readonly all: (...params: unknown[]) => unknown
            readonly run: (...params: unknown[]) => unknown
            readonly columns: () => unknown
          }
          readonly exec: (sql: string) => void
          readonly close: () => void
        }
      >((value) => typeof value === 'function')
      .meta({ description: 'The synchronous database class of node:sqlite.' }),
  })
  .meta({ description: 'The node:sqlite module' })

function openSqlite(url: string, baseDir: string) {
  return Effect.gen(function* () {
    const sqlite = yield* Effect.tryPromise({
      try: () => import('node:sqlite'),
      catch: () => new DatabaseUnavailableError({ reason: NO_SQLITE }),
    })
    const result = SqliteModule.safeParse(sqlite)
    if (!result.success) return yield* new DatabaseUnavailableError({ reason: NO_SQLITE })
    const db = yield* Effect.try({
      try: () => new result.data.DatabaseSync(makeSqliteFilePath({ url, baseDir })),
      catch: (error) =>
        new DatabaseUnavailableError({
          reason: error instanceof Error ? error.message : String(error),
        }),
    })
    const driver: Driver = {
      dialect: 'sqlite',
      query: (statement) =>
        Effect.try({
          try: () => {
            const prepared = db.prepare(statement.sql)
            return READ_STATEMENT.test(statement.sql)
              ? makeSqliteReadResult({ rows: prepared.all(...statement.params) })
              : {
                  columns: [],
                  rows: [],
                  rowCount: makeSqliteChanges({ info: prepared.run(...statement.params) }),
                }
          },
          catch: driverError,
        }),
      queryRaw: (statement) =>
        Effect.try({
          try: () => {
            const prepared = db.prepare(statement.sql)
            return makeSqliteRawResult({
              rows: prepared.all(...statement.params),
              columns: prepared.columns(),
            })
          },
          catch: driverError,
        }),
      executeRaw: (statement) =>
        Effect.try({
          try: () =>
            makeSqliteChanges({ info: db.prepare(statement.sql).run(...statement.params) }),
          catch: driverError,
        }),
      executeScript: (script) =>
        Effect.try({
          try: () => {
            db.exec(script)
          },
          catch: driverError,
        }),
      close: Effect.sync(() => {
        db.close()
      }),
    }
    return driver
  })
}

const LibsqlModule = z
  .object({
    createClient: z
      .custom<
        (config: { readonly url: string }) => {
          readonly execute: (statement: {
            readonly sql: string
            readonly args: readonly unknown[]
          }) => Promise<unknown>
          readonly executeMultiple: (sql: string) => Promise<void>
          readonly close: () => void
        }
      >((value) => typeof value === 'function')
      .meta({ description: 'The client factory of @libsql/client.' }),
  })
  .meta({ description: 'The @libsql/client module' })

/**
 * A libSQL server (Turso, or `sqld`) through the project's `@libsql/client`: SQLite's SQL over
 * the network, the `?authToken=` of the URL read by the client itself.
 */
function openLibsql(url: string, cwd: string) {
  return Effect.gen(function* () {
    const module = yield* importDriver('@libsql/client', cwd)
    const result = LibsqlModule.safeParse(module)
    if (!result.success) {
      return yield* new DatabaseUnavailableError({
        reason: 'The "@libsql/client" package does not export createClient.',
      })
    }
    const client = yield* Effect.try({
      try: () => result.data.createClient({ url }),
      catch: (error) =>
        new DatabaseUnavailableError({
          reason: error instanceof Error ? error.message : String(error),
        }),
    })
    const execute = (statement: { readonly sql: string; readonly params: readonly unknown[] }) =>
      Effect.tryPromise({
        try: async () =>
          LibsqlResultSet.parse(
            await client.execute({ sql: statement.sql, args: statement.params }),
          ),
        catch: driverError,
      })
    // A remote database refuses no connection until it is asked something: ask now, so a wrong
    // URL or token is said when Studio starts rather than at the first page.
    yield* execute({ sql: 'SELECT 1', params: [] }).pipe(
      Effect.mapError((error) => new DatabaseUnavailableError({ reason: error.cause })),
      Effect.tapError(() =>
        Effect.sync(() => {
          client.close()
        }),
      ),
    )
    const driver: Driver = {
      dialect: 'sqlite',
      remote: true,
      query: (statement) =>
        execute(statement).pipe(
          Effect.map((set) => makeLibsqlQueryResult({ sql: statement.sql, set })),
        ),
      queryRaw: (statement) =>
        execute(statement).pipe(Effect.map((set) => makeLibsqlRawResult({ set }))),
      executeRaw: (statement) => execute(statement).pipe(Effect.map((set) => set.rowsAffected)),
      executeScript: (script) =>
        Effect.tryPromise({ try: () => client.executeMultiple(script), catch: driverError }),
      close: Effect.sync(() => {
        client.close()
      }),
    }
    return driver
  })
}

const PgModule = z
  .object({
    Client: z
      .custom<
        new (options: { connectionString: string }) => {
          readonly connect: () => Promise<void>
          readonly end: () => Promise<void>
          readonly query: (
            sql:
              | string
              | {
                  readonly text: string
                  readonly values: readonly unknown[]
                  readonly rowMode: 'array'
                },
            params?: readonly unknown[],
          ) => Promise<unknown>
        }
      >((value) => typeof value === 'function')
      .meta({ description: 'The pg Client class.' }),
  })
  .meta({ description: 'The pg module' })

function openPostgres(url: string, cwd: string) {
  return Effect.gen(function* () {
    const result = PgModule.safeParse(yield* importDriver('pg', cwd))
    if (!result.success) {
      return yield* new DatabaseUnavailableError({
        reason: 'The "pg" package does not export Client.',
      })
    }
    const client = yield* Effect.tryPromise({
      try: async () => {
        const opened = new result.data.Client({ connectionString: url })
        await opened.connect()
        // `pg` ignores Prisma's `?schema=`; without this the tables of a non-public namespace are
        // invisible and every query reports a missing relation.
        const schema = makePostgresSchema({ url })
        if (schema !== null) {
          const name = quoteIdentifier('postgresql', schema)
          await opened.query(`SET search_path TO ${name}, public`, [])
        }
        return opened
      },
      catch: (error) =>
        new DatabaseUnavailableError({
          reason: error instanceof Error ? error.message : String(error),
        }),
    })
    const driver: Driver = {
      dialect: 'postgresql',
      query: (statement) =>
        Effect.tryPromise({
          try: async () =>
            makePgQueryResult({ result: await client.query(statement.sql, statement.params) }),
          catch: driverError,
        }),
      queryRaw: (statement) =>
        Effect.tryPromise({
          try: async () =>
            makePgRawResult({
              result: await client.query({
                text: statement.sql,
                values: statement.params,
                rowMode: 'array',
              }),
            }),
          catch: driverError,
        }),
      executeRaw: (statement) =>
        Effect.tryPromise({
          try: async () =>
            makePgChanges({ result: await client.query(statement.sql, statement.params) }),
          catch: driverError,
        }),
      executeScript: (script) =>
        Effect.tryPromise({
          try: async () => {
            await client.query(script, [])
          },
          catch: driverError,
        }),
      close: Effect.promise(() => client.end()),
    }
    return driver
  })
}

const MysqlModule = z
  .object({
    createConnection: z
      .custom<
        (url: string) => Promise<{
          readonly end: () => Promise<void>
          readonly query: (
            sql:
              | string
              | {
                  readonly sql: string
                  readonly values: readonly unknown[]
                  readonly rowsAsArray: true
                },
            params?: readonly unknown[],
          ) => Promise<unknown>
        }>
      >((value) => typeof value === 'function')
      .meta({ description: 'The mysql2/promise connection factory.' }),
  })
  .meta({ description: 'The mysql2/promise module' })

function openMysql(url: string, cwd: string) {
  return Effect.gen(function* () {
    const result = MysqlModule.safeParse(yield* importDriver('mysql2/promise', cwd))
    if (!result.success) {
      return yield* new DatabaseUnavailableError({
        reason: 'The "mysql2/promise" module does not export createConnection.',
      })
    }
    const connection = yield* Effect.tryPromise({
      try: () => result.data.createConnection(url),
      catch: (error) =>
        new DatabaseUnavailableError({
          reason: error instanceof Error ? error.message : String(error),
        }),
    })
    const driver: Driver = {
      dialect: 'mysql',
      query: (statement) =>
        Effect.tryPromise({
          try: async () =>
            makeMysqlQueryResult({
              result: await connection.query(statement.sql, statement.params),
            }),
          catch: driverError,
        }),
      queryRaw: (statement) =>
        Effect.tryPromise({
          try: async () =>
            makeMysqlRawResult({
              result: await connection.query({
                sql: statement.sql,
                values: statement.params,
                rowsAsArray: true,
              }),
            }),
          catch: driverError,
        }),
      executeRaw: (statement) =>
        Effect.tryPromise({
          try: async () =>
            makeMysqlChanges({ result: await connection.query(statement.sql, statement.params) }),
          catch: driverError,
        }),
      executeScript: (script) =>
        Effect.tryPromise({
          try: async () => {
            await connection.query(script, [])
          },
          catch: driverError,
        }),
      close: Effect.promise(() => connection.end()),
    }
    return driver
  })
}

/**
 * The database as the use cases see it while none is open: its status, a driver that fails with
 * why, and nothing to close.
 *
 * ```mermaid
 * flowchart LR
 *   reason --> status[status: not connected, error] & driver[driver: DatabaseUnavailableError]
 * ```
 *
 * @param input.reason - why no database is open, or null when none was asked for
 * @returns the status, the failing driver, no target and a close that does nothing
 */
export function disconnectedDatabase(input?: { readonly reason: string | null }): {
  readonly status: {
    readonly connected: boolean
    readonly dialect: Dialect | null
    readonly url: string | null
    readonly source: UrlSource | null
    readonly error: string | null
  }
  readonly driver: Effect.Effect<Driver, DatabaseUnavailableError>
  /** The URL as found (password included) and its dialect, for a client that dials on its own. */
  readonly target: { readonly url: string; readonly dialect: Driver['dialect'] } | null
  readonly close: Effect.Effect<void>
} {
  return {
    status: { ...DISCONNECTED, error: input?.reason ?? null },
    driver: Effect.fail(
      new DatabaseUnavailableError({ reason: input?.reason ?? 'No database connected.' }),
    ),
    target: null,
    close: Effect.void,
  }
}

const ConnectDatabaseInput = z
  .object({
    explicitUrl: z
      .string()
      .nullable()
      .meta({ description: 'The --url flag, when given.', example: 'file:./dev.db' }),
    configUrl: z.string().nullable().meta({
      description: 'The `url` of hekireki.config.ts, when set.',
      example: 'file:./dev.db',
    }),
    configError: z.string().nullable().meta({
      description: 'Why hekireki.config.ts could not be read, when it could not.',
      example: null,
    }),
    schemaText: z.string().nullable().meta({
      description: 'The text of the schema files, for the `url` of a datasource block.',
      example: null,
    }),
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
  })
  .readonly()
  .meta({
    description: 'Where to look for the database URL and how to resolve relative sqlite files',
  })

// What a statement failed with: the driver's own message. The schema engine parses it to tell a
// missing table from a broken database, and the database use case words it for a person.
function driverError(error: unknown) {
  return new DatabaseError({ cause: error instanceof Error ? error.message : String(error) })
}

/**
 * A copy of a SQLite database, taken through the open connection (`VACUUM INTO`, so it is
 * consistent whatever else holds the file) into the temporary directory, for a migration to be
 * rehearsed on. Closing the returned driver removes the copy.
 *
 * ```mermaid
 * flowchart LR
 *   driver[open SQLite connection] -->|VACUUM INTO| fs[(temporary directory)] --> copy[(node:sqlite on the copy)]
 *   driver -->|copy fails| fail[DatabaseUnavailableError]
 *   copy --> out[driver on the copy]
 *   out -->|close| remove["close + delete the file, a failure to delete only logged"]
 * ```
 *
 * @param input.driver - the open connection to copy
 * @param input.cwd - where drivers are found
 * @returns a driver on the copy; closing it deletes the file
 */
export function openSqliteCopy(input: { readonly driver: Driver; readonly cwd: string }) {
  return Effect.gen(function* () {
    if (input.driver.remote === true) {
      return yield* new DatabaseUnavailableError({
        reason:
          'A rehearsal runs on a copy of the database file, and a remote SQLite database (Turso, a libSQL server) has none here to copy.',
      })
    }
    const file = path.join(tmpdir(), `hekireki-rehearsal-${globalThis.crypto.randomUUID()}.db`)
    yield* input.driver.executeScript(`VACUUM INTO ${stringLiteral('sqlite', file)}`).pipe(
      Effect.mapError(
        (error) =>
          new DatabaseUnavailableError({
            reason: `The database could not be copied for the rehearsal: ${error.cause}`,
          }),
      ),
    )
    const copy = yield* openSqlite(`file:${file}`, input.cwd)
    const remove = removePath(file).pipe(
      Effect.provide(nodeFileSystemLayer),
      Effect.catchTag('PlatformError', (error) =>
        Effect.logDebug(`cannot remove the copy ${file}`, error),
      ),
    )
    return { ...copy, close: Effect.all([copy.close, remove], { concurrency: 1, discard: true }) }
  })
}

/**
 * A copy of the MySQL database Studio is on, for a rehearsal: a database of its own beside it,
 * with every table made as `SHOW CREATE TABLE` gives it (foreign keys and `CHECK`s included), its
 * rows, and its triggers. MySQL commits a DDL statement as it runs, so a rehearsal cannot be a
 * transaction taken back as it is on PostgreSQL. Views and routines are not copied, and a large
 * database takes as long to copy as its rows do. Making it takes the CREATE privilege on
 * databases, which MySQL refuses in so many words when it is missing.
 *
 * @example
 * ```sql
 * CREATE DATABASE `hk_rehearsal_4f0c…`;
 * -- on a connection to the copy, foreign key checks off while the rows go in
 * CREATE TABLE `User` (`id` int NOT NULL AUTO_INCREMENT, …, PRIMARY KEY (`id`)) ENGINE=InnoDB …;
 * INSERT INTO `User` (`id`, `email`) SELECT `id`, `email` FROM `app`.`User`;
 * CREATE TRIGGER `User_audit` BEFORE UPDATE ON `User` FOR EACH ROW …;
 * -- closing the copy
 * DROP DATABASE IF EXISTS `hk_rehearsal_4f0c…`
 * ```
 *
 * ```mermaid
 * flowchart LR
 *   in[url + open connection] -->|CREATE DATABASE| db[(MySQL server)]
 *   db --> copy[(mysql2 on the copy)] -->|tables, rows, triggers| filled[driver on the copy + its URL]
 *   db & copy -->|DatabaseError, copy dropped| fail[DatabaseUnavailableError]
 *   filled -->|close| drop["close + DROP DATABASE, a failure to drop only logged"]
 * ```
 *
 * @param input.url - the URL of the database Studio is on
 * @param input.driver - the open connection to that database
 * @param input.cwd - where drivers are found
 * @returns a driver on the copy and the copy's URL; closing it removes the copy
 */
export function openMysqlCopy(input: {
  readonly url: string
  readonly driver: Driver
  readonly cwd: string
}) {
  return Effect.gen(function* () {
    const { driver } = input
    const found = yield* driver.query({ sql: 'SELECT DATABASE() AS `name`', params: [] })
    const source = found.rows[0]?.name
    const name = `hk_rehearsal_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
    const quoted = quoteIdentifier('mysql', name)
    yield* driver.executeScript(`CREATE DATABASE ${quoted}`)
    const drop = driver
      .executeScript(`DROP DATABASE IF EXISTS ${quoted}`)
      .pipe(
        Effect.catchTag('DatabaseError', (error) =>
          Effect.logDebug(`cannot drop the database ${quoted}`, error),
        ),
      )
    const copy = yield* openMysql(
      Object.assign(new URL(input.url), { pathname: `/${name}` }).toString(),
      input.cwd,
    ).pipe(Effect.tapError(() => drop))
    const close = Effect.all([copy.close, drop], { concurrency: 1, discard: true })
    yield* fillMysqlCopy({ driver, copy, source: typeof source === 'string' ? source : '' }).pipe(
      Effect.tapError(() => close),
    )
    // The copy's own URL, for the native schema engine to compare what a rehearsal leaves in it.
    return {
      ...copy,
      close,
      url: Object.assign(new URL(input.url), { pathname: `/${name}` }).toString(),
    }
  }).pipe(
    Effect.catchTag('DatabaseError', (error) =>
      Effect.fail(
        new DatabaseUnavailableError({
          reason: `The database could not be copied for the rehearsal: ${error.cause}`,
        }),
      ),
    ),
  )
}

/** Every table of `source` made in the copy with its rows, foreign key checks off meanwhile, then its triggers. */
function fillMysqlCopy(input: {
  readonly driver: Driver
  readonly copy: Driver
  readonly source: string
}) {
  return Effect.gen(function* () {
    const { driver, copy } = input
    const tables = yield* driver.query({
      sql: "SELECT table_name AS `table` FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name",
      params: [],
    })
    yield* copy.executeRaw({ sql: 'SET FOREIGN_KEY_CHECKS = 0', params: [] })
    yield* Effect.forEach(
      tables.rows.flatMap((row) => (typeof row.table === 'string' ? [row.table] : [])),
      (table) => copyMysqlTable({ ...input, table }),
      { concurrency: 1, discard: true },
    )
    yield* copy.executeRaw({ sql: 'SET FOREIGN_KEY_CHECKS = 1', params: [] })
    const triggers = yield* driver.query({
      sql: 'SELECT trigger_name AS `name` FROM information_schema.triggers WHERE trigger_schema = DATABASE() ORDER BY 1',
      params: [],
    })
    yield* Effect.forEach(
      triggers.rows.flatMap((row) => (typeof row.name === 'string' ? [row.name] : [])),
      (trigger) => copyMysqlTrigger({ driver, copy, trigger }),
      { concurrency: 1, discard: true },
    )
  })
}

/** One trigger made again in the copy, as `SHOW CREATE TRIGGER` gives the statement that made it. */
function copyMysqlTrigger(input: {
  readonly driver: Driver
  readonly copy: Driver
  readonly trigger: string
}) {
  return Effect.gen(function* () {
    const created = yield* input.driver.query({
      sql: `SHOW CREATE TRIGGER ${quoteIdentifier('mysql', input.trigger)}`,
      params: [],
    })
    const statement = created.rows[0]?.['SQL Original Statement']
    yield* input.copy.executeRaw({
      sql: typeof statement === 'string' ? statement : '',
      params: [],
    })
  })
}

/** One table made in the copy as `SHOW CREATE TABLE` gives it, and its rows copied over but for generated columns. */
function copyMysqlTable(input: {
  readonly driver: Driver
  readonly copy: Driver
  readonly source: string
  readonly table: string
}) {
  return Effect.gen(function* () {
    const table = quoteIdentifier('mysql', input.table)
    const created = yield* input.driver.query({
      sql: `SHOW CREATE TABLE ${table}`,
      params: [],
    })
    const statement = created.rows[0]?.['Create Table']
    yield* input.copy.executeRaw({
      sql: typeof statement === 'string' ? statement : '',
      params: [],
    })
    // A generated column is worked out again in the copy, and takes no value.
    const columns = yield* input.driver.query({
      sql: "SELECT column_name AS `column` FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND COALESCE(generation_expression, '') = '' ORDER BY ordinal_position",
      params: [input.table],
    })
    const names = columns.rows
      .flatMap((row) =>
        typeof row.column === 'string' ? [quoteIdentifier('mysql', row.column)] : [],
      )
      .join(', ')
    yield* input.copy.executeRaw({
      sql: `INSERT INTO ${table} (${names}) SELECT ${names} FROM ${quoteIdentifier('mysql', input.source)}.${table}`,
      params: [],
    })
  })
}

/**
 * An empty database beside the one Studio is on, for the schema engine to replay a migrations
 * directory into and compare with: SQLite in memory, and on PostgreSQL a database of its own,
 * created on the open connection and dropped again when the returned driver is closed. Creating
 * one takes the CREATEDB privilege, which the database refuses in so many words when it is missing.
 *
 * ```mermaid
 * flowchart LR
 *   in[url + open connection] --> dialect{dialect}
 *   dialect -->|sqlite| memory[(node:sqlite in memory)]
 *   dialect -->|mysql| fail[DatabaseUnavailableError]
 *   dialect -->|postgresql| create[CREATE DATABASE on the open connection] --> pg[(pg on the new database)]
 *   create -->|refused, e.g. no CREATEDB| fail
 *   memory & pg --> out[driver on the empty database]
 *   out -->|close| drop["close + DROP DATABASE, a failure to drop only logged"]
 * ```
 *
 * @param input.url - the URL of the database Studio is on
 * @param input.driver - the open connection to that database
 * @param input.cwd - where drivers are found
 * @returns a driver on the empty database; closing it removes the database
 */
export function openShadowDatabase(input: {
  readonly url: string
  readonly driver: Driver
  readonly cwd: string
}) {
  return Effect.gen(function* () {
    if (input.driver.dialect === 'sqlite') return yield* openSqlite('file::memory:', input.cwd)
    if (input.driver.dialect === 'mysql') {
      return yield* new DatabaseUnavailableError({
        reason: 'Studio cannot make a shadow database on MySQL.',
      })
    }
    const name = `prisma_migrate_shadow_db_${globalThis.crypto.randomUUID()}`
    const quoted = quoteIdentifier('postgresql', name)
    yield* input.driver.executeScript(`CREATE DATABASE ${quoted}`).pipe(
      Effect.mapError(
        (error) =>
          new DatabaseUnavailableError({
            reason: `A shadow database could not be created: ${error.cause}`,
          }),
      ),
    )
    const url = new URL(input.url)
    // The shadow is a database of its own, read from its `public` schema.
    const shadowUrl = Object.assign(url, { pathname: `/${name}` })
    shadowUrl.searchParams.delete('schema')
    const drop = input.driver
      .executeScript(`DROP DATABASE IF EXISTS ${quoted}`)
      .pipe(
        Effect.catchTag('DatabaseError', (error) =>
          Effect.logDebug(`cannot drop the database ${quoted}`, error),
        ),
      )
    const shadow = yield* openPostgres(shadowUrl.toString(), input.cwd).pipe(
      Effect.tapError(() => drop),
    )
    // In that order: a database cannot be dropped while a connection to it is open.
    return { ...shadow, close: Effect.all([shadow.close, drop], { concurrency: 1, discard: true }) }
  })
}

/**
 * Resolves the URL, picks the dialect and opens the driver. A failure is kept, not raised: the
 * database comes back disconnected and its status says why, so Studio still edits the schema.
 *
 * ```mermaid
 * flowchart LR
 *   urls[--url, config, .env, schema] --> resolve[resolveDatabaseUrl] --> dialect{dialect}
 *   dialect -->|sqlite| sqlite[(node:sqlite)]
 *   dialect -->|postgresql| pg[(pg)]
 *   dialect -->|mysql| mysql[(mysql2)]
 *   resolve & dialect & sqlite & pg & mysql -->|DatabaseUnavailableError| off[disconnected, with the reason]
 * ```
 *
 * @param input.explicitUrl - the --url flag, when given
 * @param input.configUrl - the `url` of hekireki.config.ts, when set
 * @param input.configError - why hekireki.config.ts could not be read, when it could not
 * @param input.schemaText - the schema files' text, for a datasource `url`
 * @param input.schemaProvider - the datasource provider of the schema
 * @param input.cwd - where .env, prisma.config.ts and the drivers are looked up
 * @param input.schemaDir - where relative sqlite files resolve from
 * @returns the status, the driver, the URL as found and how to close it
 */
export function connectDatabase(input: z.infer<typeof ConnectDatabaseInput>) {
  return Effect.gen(function* () {
    const found = yield* resolveDatabaseUrl(input).pipe(
      Effect.mapError((error) => new DatabaseUnavailableError({ reason: error.reason })),
    )
    const url = makeRedactedUrl({ url: found.url })
    const dialect = makeDialect({
      url: found.url,
      schemaProvider: input.schemaProvider,
    })
    if (dialect === null) {
      return yield* new DatabaseUnavailableError({
        reason: `Cannot tell which database "${url}" points at.\n   Use a postgresql://, mysql:// or file: URL.`,
      })
    }
    const driver =
      dialect === 'sqlite'
        ? isLibsqlUrl({ url: found.url })
          ? yield* openLibsql(found.url, input.cwd)
          : yield* openSqlite(found.url, input.schemaDir)
        : dialect === 'postgresql'
          ? yield* openPostgres(found.url, input.cwd)
          : yield* openMysql(found.url, input.cwd)
    return {
      status: { connected: true, dialect, url, source: found.source, error: null },
      driver: Effect.succeed(driver),
      target: { url: found.url, dialect },
      close: driver.close,
    }
  }).pipe(
    Effect.match({
      onFailure: (error) => disconnectedDatabase({ reason: error.reason }),
      onSuccess: (connected) => connected,
    }),
  )
}
