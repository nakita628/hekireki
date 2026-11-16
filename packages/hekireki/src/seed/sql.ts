import type { Dialect } from '../database/url.js'
import { chunks } from '../list/index.js'
import { qualifiedName, quoteIdentifier, stringLiteral } from '../sql/index.js'
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

/** Rows per INSERT: PostgreSQL binds at most 65535 parameters, and a literal file stays readable. */
const INSERT_CHUNK = 200

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

/** `YYYY-MM-DD HH:MM:SS.mmm` in UTC, the form every dialect parses: the ISO form, its T and Z out. */
function timestamp(date: Date) {
  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)}`
}

function enumStored(column: ColumnShape, value: string) {
  return column.enumValues?.find((member) => member.name === value)?.dbName ?? value
}

/** An array element as text, before it is quoted. */
function elementText(column: ColumnShape, value: SeedValue) {
  if (value instanceof Date) return `${timestamp(value)}+00`
  if (value instanceof Uint8Array) return `\\x${Buffer.from(value).toString('hex')}`
  if (typeof value === 'string') return column.kind === 'enum' ? enumStored(column, value) : value
  return JSON.stringify(value)
}

/** One element of a PostgreSQL array literal (`'{...}'`), quoted and escaped as the array parser expects. */
function arrayElement(column: ColumnShape, value: SeedValue) {
  if (value === null) return 'NULL'
  if (typeof value === 'boolean') return value ? 't' : 'f'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  const text = elementText(column, value)
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function listLiteral(dialect: Dialect, column: ColumnShape, value: SeedValue) {
  const items = isSeedList(value) ? value : [value]
  return dialect === 'postgresql'
    ? stringLiteral(dialect, `{${items.map((item) => arrayElement(column, item)).join(',')}}`)
    : stringLiteral(dialect, JSON.stringify(items.map((item) => jsonValue(item))))
}

function booleanLiteral(dialect: Dialect, value: boolean) {
  if (dialect === 'sqlite') return value ? '1' : '0'
  return value ? 'TRUE' : 'FALSE'
}

function dateLiteral(dialect: Dialect, value: Date) {
  if (dialect === 'postgresql') return `'${timestamp(value)}+00'`
  if (dialect === 'mysql') return `'${timestamp(value)}'`
  // Prisma Client's own text on SQLite: `=` compares text, so the `Z` form would miss it.
  return `'${value.toISOString().replace('Z', '+00:00')}'`
}

/** The SQL literal for a value in the column, as the dialect reads it. */
export function renderLiteral(dialect: Dialect, column: ColumnShape, value: SeedValue) {
  if (value === null || value === undefined) return 'NULL'
  if (column.isList) return listLiteral(dialect, column, value)
  if (column.type === 'Json') return stringLiteral(dialect, JSON.stringify(jsonValue(value)))
  if (typeof value === 'string') {
    return stringLiteral(dialect, column.kind === 'enum' ? enumStored(column, value) : value)
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return booleanLiteral(dialect, value)
  if (value instanceof Date) return dateLiteral(dialect, value)
  if (value instanceof Uint8Array) {
    const hex = Buffer.from(value).toString('hex')
    return dialect === 'postgresql' ? `'\\x${hex}'` : `X'${hex}'`
  }
  return stringLiteral(dialect, JSON.stringify(jsonValue(value)))
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

/** The multi-row INSERTs of one table as SQL text with literal values, for a file. */
export function insertSql(dialect: Dialect, entry: SeedTableRows, chunk = INSERT_CHUNK) {
  const columns = columnsOf(entry.table)
  const target = qualifiedName(dialect, entry.table)
  const names = columns.map((c) => quoteIdentifier(dialect, c.column)).join(', ')
  // The field each column reads from a row: a model's rows are keyed by field name, a join
  // table's by column. Found once per column, not once per cell.
  const fieldOf = new Map(
    entry.table.kind === 'model' ? entry.table.columns.map((c) => [c.column, c.field]) : [],
  )
  const fields = columns.map((column) => fieldOf.get(column.column) ?? column.column)
  return chunks(entry.rows, chunk).map(
    (rows) =>
      `INSERT INTO ${target} (${names}) VALUES\n${rows
        .map(
          (row) =>
            `  (${columns
              .map((column, at) =>
                renderLiteral(dialect, column, row[fields[at] ?? column.column] ?? null),
              )
              .join(', ')})`,
        )
        .join(',\n')};`,
  )
}

/** `DELETE FROM` every seeded table, children first, so no foreign key is left dangling. */
export function resetSql(dialect: Dialect, tables: readonly SeedTable[]) {
  const deletes = tables.toReversed().map((table) => `DELETE FROM ${qualifiedName(dialect, table)}`)
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
  return tables.flatMap((table) => {
    if (table.kind !== 'model') return []
    const byField = new Map(table.columns.map((c) => [c.field, c]))
    return table.autoincrement.flatMap((field) => {
      const column = byField.get(field)
      if (column === undefined) return []
      const target = qualifiedName(dialect, table)
      const name = quoteIdentifier(dialect, column.column)
      return [
        `SELECT setval(pg_get_serial_sequence(${stringLiteral(dialect, target)}, ${stringLiteral(dialect, column.column)}), COALESCE((SELECT MAX(${name}) FROM ${target}), 0) + 1, false)`,
      ]
    })
  })
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
