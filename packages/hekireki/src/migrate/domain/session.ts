import type { Dialect } from '../../database/url.js'

/**
 * What the check's connection is set to before its first query: read only, so no statement of
 * the check (the SQL of a `{ sql }` fix included) can write, whatever it says. PostgreSQL and
 * MySQL refuse a write in a read-only transaction; SQLite refuses one on a `query_only` connection.
 */
export function readOnlyStatements(dialect: Dialect) {
  if (dialect === 'postgresql') return ['SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY']
  if (dialect === 'mysql') return ['SET SESSION TRANSACTION READ ONLY']
  return ['PRAGMA query_only = ON']
}

/**
 * How long one query may run, in milliseconds: PostgreSQL's `statement_timeout`, MySQL's
 * `max_execution_time` (read-only statements only, which is all the check runs), MariaDB's
 * `max_statement_time` in seconds. SQLite has no such limit.
 *
 * @example
 * ```sql
 * -- timeoutStatements('postgresql', false, 30000)
 * SET statement_timeout = 30000
 * -- timeoutStatements('mysql', false, 30000)
 * SET SESSION max_execution_time = 30000
 * -- timeoutStatements('mysql', true, 30000): MariaDB counts in seconds
 * SET SESSION max_statement_time = 30
 * ```
 */
export function timeoutStatements(dialect: Dialect, mariadb: boolean, milliseconds: number | null) {
  if (milliseconds === null) return []
  if (dialect === 'postgresql') return [`SET statement_timeout = ${Math.round(milliseconds)}`]
  if (dialect === 'mysql') {
    return mariadb
      ? [`SET SESSION max_statement_time = ${milliseconds / 1000}`]
      : [`SET SESSION max_execution_time = ${Math.round(milliseconds)}`]
  }
  return []
}
