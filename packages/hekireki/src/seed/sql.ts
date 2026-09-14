import type { Dialect } from '../database/url.js'
import type { SeedValue } from './config.js'
import type { EnumMember, SeedTable, SeedTableRows } from './plan.js'

/** What the renderers need to know about a column: its Prisma type, list-ness and enum members. */
type ColumnShape = {
  readonly column: string
  readonly type: string
  readonly kind: 'scalar' | 'enum'
  readonly isList: boolean
  readonly enumValues: readonly EnumMember[] | null
}

function isSeedList(value: SeedValue): value is readonly SeedValue[] {
  return Array.isArray(value)
}

function itemsOf(value: SeedValue) {
  return isSeedList(value) ? value : [value]
}

/** Rows per INSERT: PostgreSQL binds at most 65535 parameters, and a literal file stays readable. */
const INSERT_CHUNK = 200

function quoteIdentifier(dialect: Dialect, name: string) {
  return dialect === 'mysql'
    ? `\`${name.replaceAll('`', '``')}\``
    : `"${name.replaceAll('"', '""')}"`
}

/** The table, schema-qualified when the model carries `@@schema`. */
function qualifiedTable(dialect: Dialect, table: SeedTable) {
  const name = quoteIdentifier(dialect, table.table)
  return table.schema === null ? name : `${quoteIdentifier(dialect, table.schema)}.${name}`
}

function columnsOf(table: SeedTable) {
  return table.kind === 'model'
    ? table.columns
    : table.sides.map((side) => ({
        column: side.column,
        type: side.type,
        kind: side.kind,
        isList: false,
        enumValues: side.enumValues,
      }))
}

function pad(n: number, width = 2) {
  return String(n).padStart(width, '0')
}

/** `YYYY-MM-DD HH:MM:SS.mmm` in UTC, the form every dialect parses. */
function timestamp(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
}

function enumStored(column: ColumnShape, value: string) {
  return column.enumValues?.find((member) => member.name === value)?.dbName ?? value
}

function quoteString(dialect: Dialect, text: string) {
  const escaped = text.replaceAll("'", "''")
  return `'${dialect === 'mysql' ? escaped.replaceAll('\\', '\\\\') : escaped}'`
}

/** One element of a PostgreSQL array literal (`'{...}'`), quoted and escaped as the array parser expects. */
function arrayElement(column: ColumnShape, value: SeedValue) {
  if (value === null) return 'NULL'
  if (typeof value === 'boolean') return value ? 't' : 'f'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  const text =
    value instanceof Date
      ? `${timestamp(value)}+00`
      : value instanceof Uint8Array
        ? `\\x${Buffer.from(value).toString('hex')}`
        : typeof value === 'string'
          ? column.kind === 'enum'
            ? enumStored(column, value)
            : value
          : JSON.stringify(value)
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

/** The SQL literal for a value in the column, as the dialect reads it. */
export function renderLiteral(dialect: Dialect, column: ColumnShape, value: SeedValue) {
  if (value === null || value === undefined) return 'NULL'
  if (column.isList) {
    const items = itemsOf(value)
    return dialect === 'postgresql'
      ? quoteString(dialect, `{${items.map((item) => arrayElement(column, item)).join(',')}}`)
      : quoteString(dialect, JSON.stringify(items.map((item) => jsonValue(item))))
  }
  if (column.type === 'Json') return quoteString(dialect, JSON.stringify(jsonValue(value)))
  if (typeof value === 'string') {
    return quoteString(dialect, column.kind === 'enum' ? enumStored(column, value) : value)
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') {
    return dialect === 'sqlite' ? (value ? '1' : '0') : value ? 'TRUE' : 'FALSE'
  }
  if (value instanceof Date) {
    return dialect === 'postgresql'
      ? `'${timestamp(value)}+00'`
      : dialect === 'mysql'
        ? `'${timestamp(value)}'`
        : `'${value.toISOString()}'`
  }
  if (value instanceof Uint8Array) {
    const hex = Buffer.from(value).toString('hex')
    return dialect === 'postgresql' ? `'\\x${hex}'` : `X'${hex}'`
  }
  return quoteString(dialect, JSON.stringify(jsonValue(value)))
}

/** A value as JSON can carry it: bigint and Date as strings, bytes as base64. */
function jsonValue(value: SeedValue): unknown {
  if (value === null) return null
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64')
  if (Array.isArray(value)) return value.map(jsonValue)
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonValue(v)]))
  }
  return value
}

function chunks<T>(items: readonly T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  )
}

function fieldOf(table: SeedTable, column: ColumnShape) {
  return table.kind === 'model'
    ? (table.columns.find((c) => c.column === column.column)?.field ?? column.column)
    : column.column
}

/** The multi-row INSERTs of one table as SQL text with literal values, for a file. */
export function insertSql(dialect: Dialect, entry: SeedTableRows, chunk = INSERT_CHUNK) {
  const columns = columnsOf(entry.table)
  const target = qualifiedTable(dialect, entry.table)
  const names = columns.map((c) => quoteIdentifier(dialect, c.column)).join(', ')
  return chunks(entry.rows, chunk).map(
    (rows) =>
      `INSERT INTO ${target} (${names}) VALUES\n${rows
        .map(
          (row) =>
            `  (${columns
              .map((column) =>
                renderLiteral(dialect, column, row[fieldOf(entry.table, column)] ?? null),
              )
              .join(', ')})`,
        )
        .join(',\n')};`,
  )
}

/** `DELETE FROM` every seeded table, children first, so no foreign key is left dangling. */
export function resetSql(dialect: Dialect, tables: readonly SeedTable[]) {
  const deletes = tables
    .toReversed()
    .map((table) => `DELETE FROM ${qualifiedTable(dialect, table)}`)
  // MySQL checks foreign keys row by row, so a self relation would block its own DELETE.
  return dialect === 'mysql'
    ? ['SET FOREIGN_KEY_CHECKS = 0', ...deletes, 'SET FOREIGN_KEY_CHECKS = 1']
    : deletes
}

/**
 * PostgreSQL sequences do not follow explicit values, so after seeding `autoincrement()` columns
 * with 1..n the next application insert would reuse 1. These move each sequence past the rows.
 */
export function sequenceSql(dialect: Dialect, tables: readonly SeedTable[]) {
  if (dialect !== 'postgresql') return []
  return tables.flatMap((table) =>
    table.kind === 'model'
      ? table.autoincrement.flatMap((field) => {
          const column = table.columns.find((c) => c.field === field)
          if (column === undefined) return []
          const target = qualifiedTable(dialect, table)
          const name = quoteIdentifier(dialect, column.column)
          return [
            `SELECT setval(pg_get_serial_sequence('${target.replaceAll("'", "''")}', '${column.column.replaceAll("'", "''")}'), COALESCE((SELECT MAX(${name}) FROM ${target}), 0) + 1, false)`,
          ]
        })
      : [],
  )
}

/** The whole seed as one SQL script: a transaction around the optional reset, the inserts and the sequence fix-ups. */
export function makeSeedSql(input: {
  readonly dialect: Dialect
  readonly entries: readonly SeedTableRows[]
  readonly reset: boolean
  readonly seed: number | null
  readonly locale: readonly string[]
}) {
  const { dialect, entries } = input
  const tables = entries.map((entry) => entry.table)
  const counts = entries.map((entry) => `${entry.table.name}: ${entry.rows.length}`).join(', ')
  const header = [
    `-- Generated by hekireki seed (seed ${input.seed ?? 'random'}, locale ${input.locale.length === 0 ? 'en' : input.locale.join(', ')})`,
    `-- ${counts}`,
  ]
  const open = dialect === 'mysql' ? 'START TRANSACTION;' : 'BEGIN;'
  const pragma = dialect === 'sqlite' ? ['PRAGMA foreign_keys = ON;'] : []
  const reset = input.reset ? resetSql(dialect, tables).map((sql) => `${sql};`) : []
  const inserts = entries
    .filter((entry) => entry.rows.length > 0)
    .flatMap((entry) => insertSql(dialect, entry))
  const sequences = sequenceSql(dialect, tables).map((sql) => `${sql};`)
  return `${[...header, ...pragma, open, ...reset, ...inserts, ...sequences, 'COMMIT;'].join('\n')}\n`
}
