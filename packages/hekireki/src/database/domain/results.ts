import * as z from 'zod'

// What a driver package hands back, turned into the shapes `Driver` answers with. Pure: the
// result of a statement in, rows out. driver.ts runs the statement; this only reads its result,
// so every shape can be tested without a database.

/**
 * A statement SQLite answers with rows rather than a change count: what node:sqlite needs to
 * know to call `all` rather than `run`, and what the count of a libSQL result is.
 *
 * @example
 * READ_STATEMENT.test('  with t as (select 1) select * from t') // true
 * READ_STATEMENT.test('UPDATE users SET name = ?') // false
 */
export const READ_STATEMENT = /^\s*(?:select|with|pragma|explain|show|describe|values)\b/iu

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
