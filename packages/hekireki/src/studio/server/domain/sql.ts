import * as z from 'zod'

import { placeholder, quoteIdentifier } from '../../../sql/index.js'

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

/**
 * Quotes a table or column name for the dialect, escaping embedded quotes.
 *
 * @param input.dialect - the SQL dialect of the connected database
 * @param input.name - a table or column name
 * @returns the name quoted for the dialect
 * @example
 * ```sql
 * -- makeIdentifier({ dialect: 'postgresql', name: 'User' }), and the same for sqlite
 * "User"
 * -- mysql
 * `User`
 * ```
 */
export function makeIdentifier(input: z.infer<typeof MakeIdentifierInput>) {
  return quoteIdentifier(input.dialect, input.name)
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

/**
 * The bound-parameter placeholder: `$n` for PostgreSQL, `?` elsewhere.
 *
 * @param input.dialect - the SQL dialect of the connected database
 * @param input.index - the 1-based parameter position
 * @returns the placeholder for that position
 * @example
 * ```sql
 * -- makePlaceholder({ dialect: 'postgresql', index: 2 })
 * $2
 * -- mysql, sqlite
 * ?
 * ```
 */
export function makePlaceholder(input: z.infer<typeof MakePlaceholderInput>) {
  return placeholder(input.dialect, input.index)
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

/**
 * `SELECT ... FROM table [WHERE search] [ORDER BY key] LIMIT ? OFFSET ?` with its parameters.
 *
 * @param input.dialect - the SQL dialect of the connected database
 * @param input.table - the table to read
 * @param input.columns - the columns to select and search
 * @param input.orderBy - the key columns that fix the row order
 * @param input.skip - rows to skip
 * @param input.take - rows to return
 * @param input.search - text every row must contain; empty for all rows
 * @returns the statement and its parameters: the search terms, then `take` and `skip`
 * @example
 * ```sql
 * -- makeSelectStatement({ dialect: 'postgresql', table: 'User', columns: ['id', 'name'],
 * --   orderBy: ['id'], skip: 0, take: 10, search: 'ann' }), params ['%ann%', '%ann%', 10, 0]
 * SELECT "id", "name" FROM "User" WHERE (CAST("id" AS TEXT) ILIKE $1 OR CAST("name" AS TEXT) ILIKE $2) ORDER BY "id" LIMIT $3 OFFSET $4
 * -- mysql
 * SELECT `id`, `name` FROM `User` WHERE (CAST(`id` AS CHAR) LIKE ? OR CAST(`name` AS CHAR) LIKE ?) ORDER BY `id` LIMIT ? OFFSET ?
 * -- sqlite
 * SELECT "id", "name" FROM "User" WHERE (CAST("id" AS TEXT) LIKE ? OR CAST("name" AS TEXT) LIKE ?) ORDER BY "id" LIMIT ? OFFSET ?
 * ```
 */
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

/**
 * `SELECT COUNT(*) AS "count" FROM table [WHERE search]`.
 *
 * @param input.dialect - the SQL dialect of the connected database
 * @param input.table - the table to count
 * @param input.columns - the columns the search looks at
 * @param input.search - text every counted row must contain; empty for all rows
 * @returns the statement and the search terms it binds
 * @example
 * ```sql
 * -- makeCountStatement({ dialect: 'postgresql', table: 'User', columns: ['name'], search: 'ann' }),
 * -- params ['%ann%']
 * SELECT COUNT(*) AS "count" FROM "User" WHERE (CAST("name" AS TEXT) ILIKE $1)
 * -- mysql
 * SELECT COUNT(*) AS `count` FROM `User` WHERE (CAST(`name` AS CHAR) LIKE ?)
 * -- sqlite
 * SELECT COUNT(*) AS "count" FROM "User" WHERE (CAST("name" AS TEXT) LIKE ?)
 * ```
 */
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

/**
 * `INSERT INTO table (cols) VALUES (...)`, or a defaults-only insert when no values are given.
 *
 * @param input.dialect - the SQL dialect of the connected database
 * @param input.table - the table to insert into
 * @param input.values - driver values keyed by column name
 * @returns the statement and the values it binds, in column order
 * @example
 * ```sql
 * -- makeInsertStatement({ dialect: 'postgresql', table: 'User', values: { name: 'Ann' } }),
 * -- params ['Ann']
 * INSERT INTO "User" ("name") VALUES ($1)
 * -- mysql
 * INSERT INTO `User` (`name`) VALUES (?)
 * -- values: {} on postgresql and sqlite
 * INSERT INTO "User" DEFAULT VALUES
 * -- values: {} on mysql
 * INSERT INTO `User` () VALUES ()
 * ```
 */
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

/**
 * `UPDATE table SET ... WHERE key = ? AND ...`.
 *
 * @param input.dialect - the SQL dialect of the connected database
 * @param input.table - the table to update
 * @param input.where - key column values that identify the row
 * @param input.values - driver values to set, keyed by column name
 * @returns the statement and its parameters: the values to set, then the key
 * @example
 * ```sql
 * -- makeUpdateStatement({ dialect: 'postgresql', table: 'User', where: { id: 1 },
 * --   values: { name: 'Ann' } }), params ['Ann', 1]
 * UPDATE "User" SET "name" = $1 WHERE "id" = $2
 * -- mysql
 * UPDATE `User` SET `name` = ? WHERE `id` = ?
 * -- sqlite
 * UPDATE "User" SET "name" = ? WHERE "id" = ?
 * ```
 */
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

/**
 * `DELETE FROM table WHERE key = ? AND ...`.
 *
 * @param input.dialect - the SQL dialect of the connected database
 * @param input.table - the table to delete from
 * @param input.where - key column values that identify the row
 * @returns the statement and the key values it binds
 * @example
 * ```sql
 * -- makeDeleteStatement({ dialect: 'postgresql', table: 'User', where: { id: 1 } }), params [1]
 * DELETE FROM "User" WHERE "id" = $1
 * -- mysql
 * DELETE FROM `User` WHERE `id` = ?
 * -- sqlite
 * DELETE FROM "User" WHERE "id" = ?
 * ```
 */
export function makeDeleteStatement(input: z.infer<typeof MakeDeleteStatementInput>) {
  const { dialect } = input
  const where = whereByKey(dialect, input.where, 1)
  return {
    sql: `DELETE FROM ${makeIdentifier({ dialect, name: input.table })} WHERE ${where.sql}`,
    params: where.params,
  }
}

const MakeExplainStatementInput = z
  .object({
    dialect: Dialect,
    sql: z.string().meta({ description: 'The statement to explain.', example: 'SELECT 1' }),
  })
  .readonly()
  .meta({
    description: 'A statement and the dialect whose EXPLAIN syntax to use',
    example: { dialect: 'sqlite', sql: 'SELECT 1' },
  })

/**
 * The EXPLAIN form each database answers with a machine-readable plan.
 *
 * @param input.dialect - the dialect whose EXPLAIN syntax to use
 * @param input.sql - the statement to explain; a trailing `;` is dropped
 * @returns the EXPLAIN statement
 * @example
 * ```sql
 * -- makeExplainStatement({ dialect: 'sqlite', sql: 'SELECT 1;' })
 * EXPLAIN QUERY PLAN SELECT 1
 * -- postgresql
 * EXPLAIN (FORMAT JSON) SELECT 1
 * -- mysql
 * EXPLAIN FORMAT=JSON SELECT 1
 * ```
 */
export function makeExplainStatement(input: z.infer<typeof MakeExplainStatementInput>) {
  const body = input.sql.trim().replace(/;\s*$/u, '')
  switch (input.dialect) {
    case 'sqlite':
      return `EXPLAIN QUERY PLAN ${body}`
    case 'postgresql':
      return `EXPLAIN (FORMAT JSON) ${body}`
    case 'mysql':
      return `EXPLAIN FORMAT=JSON ${body}`
    default:
      return `EXPLAIN ${body}`
  }
}
