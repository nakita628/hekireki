import * as z from 'zod'

// What a driver package hands back, turned into the shapes `Driver` answers with. Pure: the
// result of a statement in, rows out. driver.ts runs the statement; this only reads its result,
// so every shape can be tested without a database. A result that does not read as the package
// documents it is taken as empty, as the driver took it before: zod's `.catch()`, not a promise.

/**
 * A statement SQLite answers with rows rather than a change count: what node:sqlite needs to
 * know to call `all` rather than `run`, and what the count of a libSQL result is.
 *
 * @example
 * READ_STATEMENT.test('  with t as (select 1) select * from t') // true
 * READ_STATEMENT.test('UPDATE users SET name = ?') // false
 */
export const READ_STATEMENT = /^\s*(?:select|with|pragma|explain|show|describe|values)\b/iu

const DriverRows = z
  .array(z.record(z.string(), z.unknown()))
  .meta({ description: 'Rows keyed by column name, as a driver returns them' })

const DriverFields = z
  .array(z.object({ name: z.string().meta({ description: 'The column name.', example: 'id' }) }))
  .meta({ description: 'The column descriptors of a result set' })

const SqliteColumns = z
  .array(
    z.object({
      name: z.string().meta({ description: 'The column name in the result.', example: 'id' }),
      type: z
        .string()
        .nullable()
        .meta({ description: 'The declared type, null for an expression.', example: 'TEXT' }),
    }),
  )
  .meta({ description: 'What node:sqlite returns from statement.columns()' })

const SqliteRunInfo = z
  .object({ changes: z.number().meta({ description: 'Rows the statement changed.', example: 1 }) })
  .meta({ description: 'What node:sqlite returns from statement.run()' })

/**
 * The rows node:sqlite returned from `all()`, as `Driver.query` answers them: the columns are the
 * keys of the first row (node:sqlite gives no descriptors for keyed rows).
 *
 * @example
 * makeSqliteReadResult({ rows: [{ id: 1 }] }) // { columns: ['id'], rows: [{ id: 1 }], rowCount: 1 }
 */
export function makeSqliteReadResult(input: { readonly rows: unknown }) {
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
  const rows = DriverRows.catch([]).parse(input.rows)
  return { columns: Object.keys(rows[0] ?? {}), rows, rowCount: rows.length }
}

/**
 * The rows a node:sqlite `run()` changed.
 *
 * @example
 * makeSqliteChanges({ info: { changes: 2, lastInsertRowid: 7 } }) // 2
 */
export function makeSqliteChanges(input: { readonly info: unknown }) {
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
  return SqliteRunInfo.catch({ changes: 0 }).parse(input.info).changes
}

/**
 * The rows of a node:sqlite statement as `Driver.queryRaw` answers them: positional in the order of
 * `columns()`, each column with its declared type (null for an expression).
 *
 * @example
 * makeSqliteRawResult({ rows: [{ n: 1 }], columns: [{ name: 'n', type: null }] })
 * // { columns: [{ name: 'n', nativeType: null }], rows: [[1]] }
 */
export function makeSqliteRawResult(input: { readonly rows: unknown; readonly columns: unknown }) {
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
  const rows = DriverRows.catch([]).parse(input.rows)
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
  const columns = SqliteColumns.catch([]).parse(input.columns)
  return {
    columns: columns.map((column) => ({ name: column.name, nativeType: column.type })),
    rows: rows.map((row) => columns.map((column) => row[column.name] ?? null)),
  }
}

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

const PgRawResult = z
  .object({
    rows: z
      .array(z.array(z.unknown()))
      .meta({ description: 'Rows as arrays, in the order of `fields`.' }),
    fields: z
      .array(
        z.object({
          name: z.string().meta({ description: 'The column name.', example: 'id' }),
          dataTypeID: z
            .number()
            .meta({ description: 'The OID of the column type in pg_type.', example: 23 }),
        }),
      )
      .optional()
      .meta({ description: 'The column descriptors, when the statement returned rows.' }),
  })
  .meta({ description: 'What pg returns from client.query() with rowMode: array' })

/**
 * A pg result as `Driver.query` answers it: the columns from its fields (or the first row's keys),
 * and the count pg gives, or the rows when it gives none.
 *
 * @example
 * makePgQueryResult({ result: { rows: [{ id: 1 }], fields: [{ name: 'id' }], rowCount: 1 } })
 * // { columns: ['id'], rows: [{ id: 1 }], rowCount: 1 }
 */
export function makePgQueryResult(input: { readonly result: unknown }) {
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
  const { rows, fields, rowCount } = PgResult.catch({ rows: [] }).parse(input.result)
  const columns = (fields ?? []).map((field) => field.name)
  return {
    columns: columns.length > 0 ? columns : Object.keys(rows[0] ?? {}),
    rows,
    rowCount: rowCount ?? rows.length,
  }
}

/**
 * A pg result read with `rowMode: 'array'` as `Driver.queryRaw` answers it: each column with the
 * OID of its type.
 *
 * @example
 * makePgRawResult({ result: { rows: [[1]], fields: [{ name: 'id', dataTypeID: 23 }] } })
 * // { columns: [{ name: 'id', nativeType: 23 }], rows: [[1]] }
 */
export function makePgRawResult(input: { readonly result: unknown }) {
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
  const { rows, fields } = PgRawResult.catch({ rows: [] }).parse(input.result)
  return {
    columns: (fields ?? []).map((field) => ({ name: field.name, nativeType: field.dataTypeID })),
    rows,
  }
}

/**
 * The rows a pg write changed.
 *
 * @example
 * makePgChanges({ result: { rows: [], rowCount: 3 } }) // 3
 */
export function makePgChanges(input: { readonly result: unknown }) {
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
  return PgResult.catch({ rows: [] }).parse(input.result).rowCount ?? 0
}

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

const MysqlRawResult = z
  .tuple([
    z.union([
      z.array(z.array(z.unknown())),
      z.object({
        affectedRows: z.number().meta({ description: 'Rows a write changed.', example: 1 }),
      }),
    ]),
    z
      .array(
        z.object({
          name: z.string().meta({ description: 'The column name.', example: 'id' }),
          type: z.number().meta({ description: 'The MySQL type code of the column.', example: 3 }),
        }),
      )
      .optional()
      .meta({ description: 'The column descriptors, when the statement returned rows.' }),
  ])
  .meta({ description: 'What mysql2 returns with rowsAsArray: [rows or header, fields]' })

/**
 * A mysql2 result as `Driver.query` answers it: the rows a read returned, or the count of the rows
 * a write changed (mysql2 answers a write with a header, not rows).
 *
 * @example
 * makeMysqlQueryResult({ result: [{ affectedRows: 2 }, undefined] })
 * // { columns: [], rows: [], rowCount: 2 }
 */
export function makeMysqlQueryResult(input: { readonly result: unknown }) {
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
  const [data, fields] = MysqlResult.catch([[], undefined]).parse(input.result)
  if (!Array.isArray(data)) return { columns: [], rows: [], rowCount: data.affectedRows }
  const columns = (fields ?? []).map((field) => field.name)
  return {
    columns: columns.length > 0 ? columns : Object.keys(data[0] ?? {}),
    rows: data,
    rowCount: data.length,
  }
}

/**
 * A mysql2 result read with `rowsAsArray` as `Driver.queryRaw` answers it: each column with its
 * MySQL type code, and no rows for a write.
 *
 * @example
 * makeMysqlRawResult({ result: [[[1]], [{ name: 'id', type: 3 }]] })
 * // { columns: [{ name: 'id', nativeType: 3 }], rows: [[1]] }
 */
export function makeMysqlRawResult(input: { readonly result: unknown }) {
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
  const [data, fields] = MysqlRawResult.catch([[], undefined]).parse(input.result)
  return {
    columns: (fields ?? []).map((field) => ({ name: field.name, nativeType: field.type })),
    rows: Array.isArray(data) ? data : [],
  }
}

/**
 * The rows a mysql2 write changed, or those a read returned.
 *
 * @example
 * makeMysqlChanges({ result: [{ affectedRows: 1 }, undefined] }) // 1
 */
export function makeMysqlChanges(input: { readonly result: unknown }) {
  // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch(), not a promise
  const [data] = MysqlResult.catch([[], undefined]).parse(input.result)
  return Array.isArray(data) ? data.length : data.affectedRows
}

/** What `@libsql/client` returns from `execute()`. */
export const LibsqlResultSet = z
  .object({
    columns: z
      .array(z.string())
      .meta({ description: 'The column names, in order.', example: ['id', 'email'] }),
    columnTypes: z.array(z.string()).meta({
      description: 'The declared type of each column, empty for an expression.',
      example: ['INTEGER', 'TEXT'],
    }),
    rows: z
      .array(z.custom<ArrayLike<unknown>>((value) => typeof value === 'object' && value !== null))
      .meta({ description: 'The rows, each positional (and keyed by name too).' }),
    rowsAffected: z.number().meta({ description: 'Rows the statement changed.', example: 1 }),
  })
  .meta({ description: 'What @libsql/client returns from execute()' })

/**
 * A libSQL result as `Driver.query` answers it: rows keyed by column, and the count of the rows
 * a read returned or of the rows a write changed.
 *
 * @example
 * makeLibsqlQueryResult({
 *   sql: 'SELECT id FROM t',
 *   set: { columns: ['id'], columnTypes: ['INTEGER'], rows: [[1]], rowsAffected: 0 },
 * })
 * // { columns: ['id'], rows: [{ id: 1 }], rowCount: 1 }
 */
export function makeLibsqlQueryResult(input: {
  readonly sql: string
  readonly set: z.infer<typeof LibsqlResultSet>
}) {
  const { set } = input
  return {
    columns: set.columns,
    rows: set.rows.map((row) =>
      Object.fromEntries(set.columns.map((column, index) => [column, row[index] ?? null])),
    ),
    rowCount: READ_STATEMENT.test(input.sql) ? set.rows.length : set.rowsAffected,
  }
}

/**
 * A libSQL result as `Driver.queryRaw` answers it: rows positional, each column with the type it
 * was declared with, and null for an expression, which libSQL gives an empty type.
 *
 * @example
 * makeLibsqlRawResult({
 *   set: { columns: ['label', 'n'], columnTypes: ['TEXT', ''], rows: [['a', 1]], rowsAffected: 0 },
 * })
 * // { columns: [{ name: 'label', nativeType: 'TEXT' }, { name: 'n', nativeType: null }], rows: [['a', 1]] }
 */
export function makeLibsqlRawResult(input: { readonly set: z.infer<typeof LibsqlResultSet> }) {
  const { set } = input
  return {
    columns: set.columns.map((name, index) => {
      const declared = set.columnTypes[index] ?? ''
      return { name, nativeType: declared === '' ? null : declared }
    }),
    rows: set.rows.map((row) => set.columns.map((_, index) => row[index] ?? null)),
  }
}
