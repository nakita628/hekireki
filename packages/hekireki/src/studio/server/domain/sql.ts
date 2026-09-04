import * as z from 'zod'

const Dialect = z
  .enum(['postgresql', 'mysql', 'sqlite'])
  .meta({ description: 'The SQL dialect of the connected database', example: 'postgresql' })

const MakeIdentifierInput = z
  .object({
    dialect: Dialect,
    name: z.string().meta({ description: 'A table or column name.', example: 'users' }),
  })
  .readonly()
  .meta({
    description: 'An identifier to quote for the dialect',
    example: { dialect: 'postgresql', name: 'users' },
  })

/** Quotes a table or column name for the dialect, escaping embedded quotes. */
export function makeIdentifier(input: z.infer<typeof MakeIdentifierInput>) {
  return input.dialect === 'mysql'
    ? `\`${input.name.replaceAll('`', '``')}\``
    : `"${input.name.replaceAll('"', '""')}"`
}

const IsReadStatementInput = z
  .object({
    sql: z.string().meta({ description: 'One SQL statement.', example: 'SELECT * FROM users' }),
  })
  .readonly()
  .meta({ description: 'A statement to classify', example: { sql: 'SELECT * FROM users' } })

/** Whether the statement returns rows (SELECT and friends) rather than a change count. */
export function isReadStatement(input: z.infer<typeof IsReadStatementInput>) {
  return /^\s*(?:select|with|pragma|explain|show|describe|values)\b/iu.test(input.sql)
}

const MakePlaceholderInput = z
  .object({
    dialect: Dialect,
    index: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'The 1-based parameter position.', example: 1 }),
  })
  .readonly()
  .meta({
    description: 'The 1-based position of a bound parameter',
    example: { dialect: 'postgresql', index: 1 },
  })

/** The bound-parameter placeholder: `$n` for PostgreSQL, `?` elsewhere. */
export function makePlaceholder(input: z.infer<typeof MakePlaceholderInput>) {
  return input.dialect === 'postgresql' ? `$${input.index}` : '?'
}

function searchClause(
  dialect: z.infer<typeof Dialect>,
  columns: readonly string[],
  term: string,
  firstIndex: number,
) {
  if (term === '' || columns.length === 0) return { sql: '', params: [] }
  const like = dialect === 'postgresql' ? 'ILIKE' : 'LIKE'
  const cast = (column: string) =>
    dialect === 'mysql'
      ? `CAST(${makeIdentifier({ dialect, name: column })} AS CHAR)`
      : `CAST(${makeIdentifier({ dialect, name: column })} AS TEXT)`
  const parts = columns.map(
    (column, i) => `${cast(column)} ${like} ${makePlaceholder({ dialect, index: firstIndex + i })}`,
  )
  return { sql: ` WHERE (${parts.join(' OR ')})`, params: columns.map(() => `%${term}%`) }
}

const MakeSelectStatementInput = z
  .object({
    dialect: Dialect,
    table: z.string().meta({ description: 'The table to read.', example: 'users' }),
    columns: z
      .array(z.string())
      .readonly()
      .meta({ description: 'The columns to select and search.', example: ['id', 'email'] }),
    orderBy: z
      .array(z.string())
      .readonly()
      .meta({ description: 'The key columns that fix the row order.', example: ['id'] }),
    skip: z.number().int().min(0).meta({ description: 'Rows to skip.', example: 0 }),
    take: z.number().int().min(0).meta({ description: 'Rows to return.', example: 100 }),
    search: z
      .string()
      .meta({ description: 'Text every row must contain; empty for all rows.', example: 'ann' }),
  })
  .readonly()
  .meta({ description: 'A paged, searched, ordered read of one table' })

/** `SELECT ... FROM table [WHERE search] [ORDER BY key] LIMIT ? OFFSET ?` with its parameters. */
export function makeSelectStatement(input: z.infer<typeof MakeSelectStatementInput>) {
  const { dialect } = input
  const where = searchClause(dialect, input.columns, input.search, 1)
  const order =
    input.orderBy.length > 0
      ? ` ORDER BY ${input.orderBy.map((name) => makeIdentifier({ dialect, name })).join(', ')}`
      : ''
  const base = where.params.length
  const limit = ` LIMIT ${makePlaceholder({ dialect, index: base + 1 })} OFFSET ${makePlaceholder({ dialect, index: base + 2 })}`
  return {
    sql: `SELECT ${input.columns.map((name) => makeIdentifier({ dialect, name })).join(', ')} FROM ${makeIdentifier({ dialect, name: input.table })}${where.sql}${order}${limit}`,
    params: [...where.params, input.take, input.skip],
  }
}

const MakeCountStatementInput = z
  .object({
    dialect: Dialect,
    table: z.string().meta({ description: 'The table to count.', example: 'users' }),
    columns: z
      .array(z.string())
      .readonly()
      .meta({ description: 'The columns the search looks at.', example: ['id', 'email'] }),
    search: z.string().meta({
      description: 'Text every counted row must contain; empty for all rows.',
      example: 'ann',
    }),
  })
  .readonly()
  .meta({ description: 'A count of one table, optionally narrowed by the same search' })

/** `SELECT COUNT(*) AS "count" FROM table [WHERE search]`. */
export function makeCountStatement(input: z.infer<typeof MakeCountStatementInput>) {
  const { dialect } = input
  const where = searchClause(dialect, input.columns, input.search, 1)
  return {
    sql: `SELECT COUNT(*) AS ${makeIdentifier({ dialect, name: 'count' })} FROM ${makeIdentifier({ dialect, name: input.table })}${where.sql}`,
    params: where.params,
  }
}

const MakeInsertStatementInput = z
  .object({
    dialect: Dialect,
    table: z.string().meta({ description: 'The table to insert into.', example: 'users' }),
    values: z
      .record(z.string(), z.unknown())
      .readonly()
      .meta({ description: 'Driver values keyed by column name.' }),
  })
  .readonly()
  .meta({ description: 'Column values to insert as one row' })

/** `INSERT INTO table (cols) VALUES (...)`, or a defaults-only insert when no values are given. */
export function makeInsertStatement(input: z.infer<typeof MakeInsertStatementInput>) {
  const { dialect } = input
  const table = makeIdentifier({ dialect, name: input.table })
  const entries = Object.entries(input.values)
  if (entries.length === 0) {
    return {
      sql:
        dialect === 'mysql'
          ? `INSERT INTO ${table} () VALUES ()`
          : `INSERT INTO ${table} DEFAULT VALUES`,
      params: [],
    }
  }
  return {
    sql: `INSERT INTO ${table} (${entries.map(([column]) => makeIdentifier({ dialect, name: column })).join(', ')}) VALUES (${entries.map((_, i) => makePlaceholder({ dialect, index: i + 1 })).join(', ')})`,
    params: entries.map(([, value]) => value),
  }
}

function whereByKey(
  dialect: z.infer<typeof Dialect>,
  where: Readonly<Record<string, unknown>>,
  firstIndex: number,
) {
  const entries = Object.entries(where)
  return {
    sql: entries
      .map(
        ([column], i) =>
          `${makeIdentifier({ dialect, name: column })} = ${makePlaceholder({ dialect, index: firstIndex + i })}`,
      )
      .join(' AND '),
    params: entries.map(([, value]) => value),
  }
}

const MakeUpdateStatementInput = z
  .object({
    dialect: Dialect,
    table: z.string().meta({ description: 'The table to update.', example: 'users' }),
    where: z
      .record(z.string(), z.unknown())
      .readonly()
      .meta({ description: 'Key column values that identify the row.' }),
    values: z
      .record(z.string(), z.unknown())
      .readonly()
      .meta({ description: 'Driver values to set, keyed by column name.' }),
  })
  .readonly()
  .meta({ description: 'Column values to set on the row identified by `where`' })

/** `UPDATE table SET ... WHERE key = ? AND ...`. */
export function makeUpdateStatement(input: z.infer<typeof MakeUpdateStatementInput>) {
  const { dialect } = input
  const sets = Object.entries(input.values)
  const where = whereByKey(dialect, input.where, sets.length + 1)
  return {
    sql: `UPDATE ${makeIdentifier({ dialect, name: input.table })} SET ${sets
      .map(
        ([column], i) =>
          `${makeIdentifier({ dialect, name: column })} = ${makePlaceholder({ dialect, index: i + 1 })}`,
      )
      .join(', ')} WHERE ${where.sql}`,
    params: [...sets.map(([, value]) => value), ...where.params],
  }
}

const MakeDeleteStatementInput = z
  .object({
    dialect: Dialect,
    table: z.string().meta({ description: 'The table to delete from.', example: 'users' }),
    where: z
      .record(z.string(), z.unknown())
      .readonly()
      .meta({ description: 'Key column values that identify the row.' }),
  })
  .readonly()
  .meta({ description: 'The key of the row to delete' })

/** `DELETE FROM table WHERE key = ? AND ...`. */
export function makeDeleteStatement(input: z.infer<typeof MakeDeleteStatementInput>) {
  const { dialect } = input
  const where = whereByKey(dialect, input.where, 1)
  return {
    sql: `DELETE FROM ${makeIdentifier({ dialect, name: input.table })} WHERE ${where.sql}`,
    params: where.params,
  }
}
