import type { Dialect } from './types.js'

/** A table or column name as the dialect quotes it, the quote a name holds doubled. */
export function quoteIdentifier(dialect: Dialect, name: string) {
  return dialect === 'mysql'
    ? `\`${name.replaceAll('`', '``')}\``
    : `"${name.replaceAll('"', '""')}"`
}

/** The table, schema-qualified when it names a schema. */
export function qualifiedName(
  dialect: Dialect,
  table: { readonly schema: string | null; readonly table: string },
) {
  const name = quoteIdentifier(dialect, table.table)
  return table.schema === null ? name : `${quoteIdentifier(dialect, table.schema)}.${name}`
}

/** The bound-parameter placeholder: `$n` for PostgreSQL, `?` elsewhere. */
export function placeholder(dialect: Dialect, index: number) {
  return dialect === 'postgresql' ? `$${index}` : '?'
}

/**
 * A string as a SQL literal. Every dialect doubles the quote; MySQL and MariaDB also read a
 * backslash as an escape, so one written as it is would swallow the character after it.
 *
 * @example
 * ```sql
 * -- the value           it's a\b
 * -- PostgreSQL, SQLite  'it''s a\b'
 * -- MySQL, MariaDB      'it''s a\\b'
 * ```
 */
export function stringLiteral(dialect: Dialect, value: string) {
  const doubled = value.replaceAll("'", "''")
  return `'${dialect === 'mysql' ? doubled.replaceAll('\\', '\\\\') : doubled}'`
}
