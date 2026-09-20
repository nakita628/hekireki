import type { Dialect } from '../../../database/url.js'
import type { SeedValue } from '../../../seed/config.js'
import { renderLiteral } from '../../../seed/sql.js'
import type { makeExpectedTables } from '../tables.js'

function isSql(value: unknown): value is { readonly sql: string } {
  return (
    typeof value === 'object' && value !== null && 'sql' in value && typeof value.sql === 'string'
  )
}

/**
 * A literal the fix writes, as the dialect reads it for the column, or the SQL given as `{ sql }`.
 *
 * @example
 * ```sql
 * -- a value, written as the column's type reads it
 * 'unknown'
 * -- { sql: 'substr(email, 1, 3)' }, written as it is, in parentheses
 * (substr(email, 1, 3))
 * ```
 */
export function valueSql(
  dialect: Dialect,
  column: {
    readonly column: string
    readonly type: string
    readonly kind: string
    readonly isList: boolean
    readonly enumMembers: readonly { readonly name: string; readonly dbName: string }[] | null
  },
  value: SeedValue | { readonly sql: string },
) {
  if (isSql(value)) return `(${value.sql})`
  return renderLiteral(
    dialect,
    {
      column: column.column,
      type: column.type,
      kind: column.kind === 'enum' ? 'enum' : 'scalar',
      isList: column.isList,
      enumValues: column.enumMembers,
    },
    value,
  )
}

export function describe(value: SeedValue | { readonly sql: string }) {
  if (isSql(value)) return `SQL ${value.sql}`
  return JSON.stringify(value, (_, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v))
}

/**
 * The columns that tell the rows of the table apart for a statement that changes the columns of
 * `fixing`: a key the database has now, the one being fixed aside. Without one, a statement
 * cannot name some rows of a group and leave the others.
 */
export function identityColumns(
  actual: {
    readonly columns: readonly { readonly name: string }[]
    readonly uniques: readonly (readonly string[])[]
  },
  expectedKey: readonly string[],
  fixing: readonly string[],
) {
  const names = new Set(actual.columns.map((c) => c.name))
  const sameAsFixed = (key: readonly string[]) =>
    key.length === fixing.length && key.every((column) => fixing.includes(column))
  return (
    [expectedKey, ...actual.uniques].find(
      (key) => key.length > 0 && key.every((column) => names.has(column)) && !sameAsFixed(key),
    ) ?? null
  )
}

/**
 * Joins conditions with OR, each in parentheses when there are several; FALSE when there are none.
 *
 * @example
 * ```sql
 * -- anyOf([])
 * 1 = 0
 * -- anyOf(['"age" < 0', '"age" > 150'])
 * ("age" < 0) OR ("age" > 150)
 * ```
 */
export function anyOf(conditions: readonly string[]) {
  if (conditions.length === 0) return '1 = 0'
  return conditions.length === 1
    ? (conditions[0] ?? '')
    : conditions.map((c) => `(${c})`).join(' OR ')
}

/**
 * The PostgreSQL type a converted value is cast to in the check, as the migration's column will be.
 *
 * @example
 * ```sql
 * -- String @db.VarChar(10)   VARCHAR(10)
 * -- Decimal                   DECIMAL(65, 30)
 * -- DateTime @db.Timestamptz  TIMESTAMPTZ
 * -- an enum                   TEXT: the check compares its labels as text
 * ```
 */
export function postgresType(
  column: ReturnType<typeof makeExpectedTables>[number]['columns'][number],
) {
  const [native, args] = column.nativeType ?? [null, []]
  const sized = (name: string) => (args.length === 0 ? name : `${name}(${args.join(', ')})`)
  if (column.kind === 'enum') return 'TEXT'
  switch (column.type) {
    case 'String':
      return native === null || native === 'Text' ? 'TEXT' : sized(native.toUpperCase())
    case 'Int':
      return native === 'SmallInt' ? 'SMALLINT' : 'INTEGER'
    case 'BigInt':
      return 'BIGINT'
    case 'Float':
      return native === 'Real' ? 'REAL' : 'DOUBLE PRECISION'
    case 'Decimal':
      return args.length === 0 ? 'DECIMAL(65, 30)' : sized('DECIMAL')
    case 'Boolean':
      return 'BOOLEAN'
    case 'DateTime':
      return native === 'Date'
        ? 'DATE'
        : sized(native === 'Timestamptz' ? 'TIMESTAMPTZ' : 'TIMESTAMP')
    case 'Json':
      return native === 'Json' ? 'JSON' : 'JSONB'
    case 'Bytes':
      return 'BYTEA'
    default:
      return null
  }
}
