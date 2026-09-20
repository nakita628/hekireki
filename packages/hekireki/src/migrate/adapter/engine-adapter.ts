import { Effect, Result } from 'effect'

import type { Dialect } from '../../database/url.js'
import { splitStatements } from '../../sql/index.js'
import type { Driver } from '../../studio/server/services/database.js'
import { COLUMN_TYPE, columnTypeOfNative, columnTypeOfValue } from './column-types.js'

/**
 * What the engine reads back from every adapter call: the shape `@prisma/driver-adapter-utils`
 * wraps its adapters in. The engine reaches for `.valueOf()` on what it is given, so a bare value
 * makes it fail with `Cannot read properties of undefined`. Inside the adapter an outcome is
 * Effect's `Result`; this is only what it is handed to the engine as.
 */
type EngineResult<A> = {
  readonly map: <B>(fn: (value: A) => B) => EngineResult<B>
  readonly flatMap: <B>(fn: (value: A) => EngineResult<B>) => EngineResult<B>
} & (
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly error: AdapterError }
)

function engineResult<A>(result: Result.Result<A, AdapterError>): EngineResult<A> {
  return Result.isSuccess(result)
    ? {
        ok: true,
        value: result.success,
        map: (fn) => engineResult(Result.map(result, fn)),
        flatMap: (fn) => fn(result.success),
      }
    : {
        ok: false,
        error: result.failure,
        map: () => engineResult(Result.fail(result.failure)),
        flatMap: () => engineResult(Result.fail(result.failure)),
      }
}

/**
 * The errors the engine knows how to read. Each dialect has its own shape, and the engine reads
 * the message itself to tell a missing table from a database that is broken, so the message it is
 * given is the driver's own.
 */
type AdapterError =
  | { readonly kind: 'sqlite'; readonly extendedCode: number; readonly message: string }
  | {
      readonly kind: 'postgres'
      readonly code: string
      readonly severity: string
      readonly message: string
      readonly detail: undefined
      readonly column: undefined
      readonly hint: undefined
    }
  | {
      readonly kind: 'mysql'
      readonly code: number
      readonly message: string
      readonly state: string
    }

/**
 * A driver failure as the engine reads it. The message is what reaches the user; the codes are
 * each dialect's "unspecified error", because `Driver` reports a failure as its message and the
 * engine acts on none of the others.
 */
function adapterError(dialect: Dialect, message: string): AdapterError {
  if (dialect === 'postgresql') {
    return {
      kind: 'postgres',
      code: 'XX000',
      severity: 'ERROR',
      message,
      detail: undefined,
      column: undefined,
      hint: undefined,
    }
  }
  if (dialect === 'mysql') return { kind: 'mysql', code: 1105, message, state: 'HY000' }
  return { kind: 'sqlite', extendedCode: 1, message }
}

/** The three column types the engine reads as a string, whatever the database keeps them as. */
const INSTANTS: ReadonlySet<number> = new Set([
  COLUMN_TYPE.datetime,
  COLUMN_TYPE.date,
  COLUMN_TYPE.time,
])

/** What the engine sends to hold a SQLite file for itself: `PRAGMA main.locking_mode=EXCLUSIVE`. */
const EXCLUSIVE_LOCK = /^\s*PRAGMA\s+(?:\w+\.)?locking_mode\s*=\s*EXCLUSIVE\s*;?\s*$/iu

/** A statement as the engine sends it: the SQL and its arguments. */
type EngineQuery = { readonly sql: string; readonly args: readonly unknown[] }

/** Runs a driver operation for the engine, its failure handed back as an error the engine reads. */
function runForEngine<A>(
  dialect: Dialect,
  operation: Effect.Effect<A, { readonly cause: string }>,
) {
  return Effect.runPromise(
    operation.pipe(
      Effect.mapError((error) => adapterError(dialect, error.cause)),
      Effect.result,
      Effect.map(engineResult),
    ),
  )
}

/**
 * The open connection the engine sends its statements through. Only `queryRaw`, `executeRaw` and
 * `executeScript` are ever reached for: the schema engine reads catalogues and runs DDL, and does
 * none of the value conversion the query engine needs a full adapter for.
 */
function connection(
  driver: Driver,
  /** What closing the connection does; the connection Studio is on outlives any one command. */
  dispose: () => Promise<EngineResult<undefined>> = () =>
    Promise.resolve(engineResult(Result.succeed(undefined))),
) {
  return {
    // PostgreSQL is `postgres` to the engine, not `postgresql`.
    provider: driver.dialect === 'postgresql' ? 'postgres' : driver.dialect,
    adapterName: 'hekireki',
    queryRaw: (query: EngineQuery) =>
      runForEngine(
        driver.dialect,
        driver.queryRaw({ sql: query.sql, params: query.args }).pipe(
          Effect.map((rows) => {
            const columnTypes = rows.columns.map((column, index) => {
              const declared = columnTypeOfNative(driver.dialect, column.nativeType)
              if (declared !== null) return declared
              // A PRAGMA and an expression have no declared type; the first value that is there
              // says what the column holds, and an all-null column is read as text.
              const row = rows.rows.find((candidate) => candidate[index] !== null)
              return columnTypeOfValue(row?.[index] ?? null)
            })
            return {
              columnNames: rows.columns.map((column) => column.name),
              columnTypes,
              // A bigint is a value the engine cannot convert, so it is a number; and an instant
              // reaches it as a string, which is not what it is always stored as. SQLite has no
              // date type: Prisma Migrate writes `_prisma_migrations.finished_at` as a count of
              // milliseconds, while a column the same table declares `DATETIME` may hold an ISO
              // string, so the value decides.
              rows: rows.rows.map((row) =>
                row.map((value, index) => {
                  const plain = typeof value === 'bigint' ? Number(value) : value
                  return INSTANTS.has(columnTypes[index] ?? COLUMN_TYPE.text) &&
                    typeof plain === 'number'
                    ? new Date(plain).toISOString()
                    : plain
                }),
              ),
            }
          }),
        ),
      ),
    // The engine replays a migration file into a shadow database as one raw statement. A driver
    // prepares one statement at a time and would run only the first of the file, so a statement
    // with no arguments that is several is run as the script it is.
    executeRaw: (query: EngineQuery) =>
      // The engine takes an exclusive lock on a SQLite file as it connects, which a connection of
      // its own gives back when the command closes it. Studio's connection is not closed: the lock
      // would outlast the command and keep every other process (the app, `prisma migrate status`)
      // from reading the file until Studio stops. The file stays shared, as it is for the rest of
      // Studio.
      driver.dialect === 'sqlite' && EXCLUSIVE_LOCK.test(query.sql)
        ? Promise.resolve(engineResult(Result.succeed(0)))
        : query.args.length === 0 &&
            splitStatements(query.sql).filter((statement) => statement.trim() !== '').length > 1
          ? runForEngine(driver.dialect, driver.executeScript(query.sql).pipe(Effect.as(0)))
          : runForEngine(driver.dialect, driver.executeRaw({ sql: query.sql, params: query.args })),
    executeScript: (script: string) => runForEngine(driver.dialect, driver.executeScript(script)),
    dispose,
  }
}

/**
 * The database Studio already has open, as the Prisma schema engine takes it. Studio ships no
 * driver adapter of its own and reaches for none in the project: the connection the rest of
 * Studio reads and writes through is the one the engine migrates. `dispose` does nothing, because
 * the connection outlives any one command and is closed with Studio itself.
 *
 * @param driver - the open connection every statement of the engine goes through
 * @returns the adapter factory `openSchemaEngine` is given
 */
export function makeSchemaEngineAdapter(
  driver: Driver,
  /**
   * Opens an empty database for the engine to replay migrations into, closed again when the
   * engine is done with it; without one, a command that needs a shadow database is refused.
   */
  openShadow?: () => Effect.Effect<Driver, { readonly reason: string }>,
) {
  const opened = connection(driver)
  return {
    provider: opened.provider,
    adapterName: opened.adapterName,
    connect: () => Promise.resolve(engineResult(Result.succeed(opened))),
    ...(openShadow === undefined
      ? {}
      : {
          connectToShadowDb: () =>
            runForEngine(
              driver.dialect,
              openShadow().pipe(
                Effect.mapError((error) => ({ cause: error.reason })),
                Effect.map((shadow) =>
                  connection(shadow, () =>
                    Effect.runPromise(
                      shadow.close.pipe(Effect.as(engineResult(Result.succeed(undefined)))),
                    ),
                  ),
                ),
              ),
            ),
        }),
  }
}
