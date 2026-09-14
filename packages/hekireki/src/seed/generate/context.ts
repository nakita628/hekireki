import type { Faker } from '@faker-js/faker'
import type { DMMF } from '@prisma/generator-helper'

import type { SeedRow, SeedValue } from '../config.js'
import type { ResolvedSeedConfig } from '../options.js'
import type { ForeignKey, ModelTable, SeedTable } from '../plan.js'

export const MAX_ATTEMPTS = 20

/** A stable text form of a value, so unique constraints can be checked through a Set. */
// The return type is spelled out: the function calls itself for lists.

/** A stable text form of a value, so unique constraints can be checked through a Set. */
// The return type is spelled out: the function calls itself for lists.
export function keyOf(value: SeedValue): string {
  if (value === null) return 'null'
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex')
  if (Array.isArray(value)) return JSON.stringify(value.map(keyOf))
  if (typeof value === 'object') {
    return JSON.stringify(Object.entries(value).map(([k, v]) => [k, keyOf(v)]))
  }
  return JSON.stringify(value)
}

export function uniqueKey(row: SeedRow, fields: readonly string[]) {
  return fields.map((field) => keyOf(row[field] ?? null)).join(' ')
}

/** What is wrong with the rules for one model, as sentences; nothing when they fit the schema. */

/** What is wrong with the rules for one model, as sentences; nothing when they fit the schema. */
export function isKeyObject(value: SeedValue | undefined): value is SeedRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  )
}

export function modelTable(tables: readonly SeedTable[], name: string) {
  return tables.find((t): t is ModelTable => t.kind === 'model' && t.name === name)
}

/** The field of the child model that owns the key back to this relation field's model. */

/** The field of the child model that owns the key back to this relation field's model. */
export function inverseOwner(tables: readonly SeedTable[], table: ModelTable, field: DMMF.Field) {
  return modelTable(tables, field.type)?.model.fields.find(
    (f) =>
      f.kind === 'object' &&
      f.relationName === field.relationName &&
      f.type === table.name &&
      (f.relationFromFields ?? []).length > 0,
  )
}

/** Whether the field is the other side of a key another model owns: a one-to-many or one-to-one parent side. */

/** Whether the field is the other side of a key another model owns: a one-to-many or one-to-one parent side. */
export function isParentSide(tables: readonly SeedTable[], table: ModelTable, name: string) {
  const field = table.model.fields.find((f) => f.name === name)
  return (
    field?.kind === 'object' &&
    (field.relationFromFields ?? []).length === 0 &&
    inverseOwner(tables, table, field) !== undefined
  )
}

export function isLinkField(tables: readonly SeedTable[], model: string, field: string) {
  return tables.some(
    (t) => t.kind === 'join' && t.sides.some((s) => s.model === model && s.field === field),
  )
}

/** What is wrong in one real row and the rows nested in it, as sentences. */

export function describeValue(value: SeedValue) {
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) return `<${value.length} bytes>`
  return JSON.stringify(value)
}

/**
 * A given scalar as the column stores it, when the value can be read that way: an ISO string
 * becomes a Date, an integer a bigint, a number a decimal string, base64 text bytes. Anything else
 * is left as it is for validation to report.
 */

export function isSeedList(value: SeedValue): value is readonly SeedValue[] {
  return Array.isArray(value)
}

export type Context = {
  readonly faker: Faker
  readonly config: ResolvedSeedConfig
  readonly tables: readonly SeedTable[]
  readonly rowsByModel: ReadonlyMap<string, readonly SeedRow[]>
  /** Real rows nested under a parent, per child model, their key to the parent already filled. */
  readonly pending: Map<string, SeedRow[]>
  /** The real rows each model's rows were made from, by index, for the join tables to read their links. */
  readonly givenByModel: Map<string, readonly SeedRow[]>
  /** Per foreign key (`Post.author`), how many rows already point at each parent, by the parent's key. */
  readonly linkCounts: Map<string, Map<string, number>>
}

export type RowInput = {
  readonly context: Context
  readonly table: ModelTable
  readonly index: number
  readonly own: readonly SeedRow[]
  /** The given row to complete, when this index is one of `rows`. */
  readonly given: SeedRow | null
  /** Per one-to-one key, the parents not claimed by a given row, in the order they are handed out. */
  readonly pools: ReadonlyMap<string, readonly SeedRow[]>
  /** Per one-to-one key, which parent of the pool this row takes. */
  readonly slots: ReadonlyMap<string, number>
}

export function specifies(given: SeedRow | null, fk: ForeignKey) {
  return given !== null && fk.fromFields.every((field) => field in given)
}

/** The parent the given key values name; fails when no such row exists. */
