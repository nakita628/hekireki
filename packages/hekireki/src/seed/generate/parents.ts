import { Effect } from 'effect'

import type { SeedRow, SeedValue } from '../config.js'
import { SeedGenerationError } from '../errors.js'
import type { ForeignKey, ModelTable } from '../plan.js'
import type { Context, RowInput } from './context.js'
import { describeValue, isKeyObject, keyOf, modelTable, specifies, uniqueKey } from './context.js'

/** Whether a row holds every value of a unique key, each compared as a key. */
function matchesKey(wanted: readonly (readonly [string, SeedValue])[]) {
  const keys = wanted.map(([field, value]) => [field, keyOf(value)] as const)
  return (row: SeedRow) => keys.every(([field, key]) => keyOf(row[field] ?? null) === key)
}

/** The parent the given key values name; fails when no such row exists. */
function findParent(input: RowInput, fk: ForeignKey, given: SeedRow) {
  return Effect.gen(function* () {
    const { context, table, index, own } = input
    const parents = fk.self ? own : (context.rowsByModel.get(fk.toModel) ?? [])
    const wanted = fk.fromFields.map((field) => given[field] ?? null)
    if (wanted.every((value) => value === null)) {
      if (!fk.required) return null
      return yield* new SeedGenerationError({
        message: `${table.name} data[${index}].${fk.field}: the relation is required, but ${fk.fromFields.join(', ')} is null.`,
      })
    }
    const key = wanted.map(keyOf).join(' ')
    const parent = parents.find((row) => uniqueKey(row, fk.toFields) === key)
    if (parent !== undefined) return parent
    return yield* new SeedGenerationError({
      message: `${table.name} data[${index}].${fk.field}: no ${fk.toModel} has ${fk.toFields.join(', ')} = ${wanted.map(describeValue).join(', ')}.\n   Give ${fk.toModel} that row, or let the seeder pick one.`,
    })
  })
}

/** The one parent a unique key names (`{ email: '...' }`); fails when none or several do. */

/** The one parent a unique key names (`{ email: '...' }`); fails when none or several do. */
function findParentByKey(input: RowInput, fk: ForeignKey, key: SeedRow) {
  return Effect.gen(function* () {
    const { context, table, index, own } = input
    const parents = fk.self ? own : (context.rowsByModel.get(fk.toModel) ?? [])
    const wanted = Object.entries(key)
    const matches = parents.filter(matchesKey(wanted))
    const shown = wanted.map(([field, value]) => `${field} = ${describeValue(value)}`).join(', ')
    if (matches.length === 1) return matches[0] ?? null
    return yield* new SeedGenerationError({
      message:
        matches.length === 0
          ? `${table.name} data[${index}].${fk.field}: no ${fk.toModel} has ${shown}.\n   Give ${fk.toModel} that row.`
          : `${table.name} data[${index}].${fk.field}: ${matches.length} ${fk.toModel} rows have ${shown}; name the row by a unique key.`,
    })
  })
}

/**
 * The parent row a foreign key of the row points at, or null for an optional key left empty. A
 * real row names its parent by the key scalars or by a unique key; a required key it leaves out
 * is linked to a row that exists, like a faker row's.
 */

/**
 * The parent row a foreign key of the row points at, or null for an optional key left empty. A
 * real row names its parent by the key scalars or by a unique key; a required key it leaves out
 * is linked to a row that exists, like a faker row's.
 */
export function pickParent(input: RowInput, fk: ForeignKey, self: SeedRow) {
  return Effect.gen(function* () {
    const { context, own } = input
    if (input.given !== null) {
      const reference = input.given[fk.field]
      if (isKeyObject(reference)) return yield* findParentByKey(input, fk, reference)
      if (specifies(input.given, fk)) return yield* findParent(input, fk, input.given)
      if (!fk.required) return null
    }
    const parents = fk.self ? own : (context.rowsByModel.get(fk.toModel) ?? [])
    if (fk.oneToOne && !fk.self) return yield* pickOneToOne(input, fk, parents)
    return yield* pickCounted(input, fk, self, parents)
  })
}

/** The next parent of the pool dealt out to a one-to-one key, which no other row takes. */
function pickOneToOne(input: RowInput, fk: ForeignKey, parents: readonly SeedRow[]) {
  return Effect.gen(function* () {
    const { table, pools, slots } = input
    const parent = pools.get(fk.field)?.[slots.get(fk.field) ?? 0]
    if (parent !== undefined) return parent
    if (!fk.required) return null
    return yield* new SeedGenerationError({
      message: `${table.name}.${fk.field} is a one-to-one relation to ${fk.toModel}, so at most ${parents.length} ${table.name} rows can be seeded (${fk.toModel} has ${parents.length}).`,
    })
  })
}

/**
 * The parents a row may point at under the parent model's relation rule: `open` (none above its
 * `max`) and, of those, `short` (the ones furthest below its `min`).
 */
function candidates(input: RowInput, fk: ForeignKey, parents: readonly SeedRow[]) {
  const { context, table } = input
  const bound = parentBound(context, table, fk)
  const counts = context.linkCounts.get(`${table.name}.${fk.field}`)
  const counted = (parent: SeedRow) => counts?.get(uniqueKey(parent, fk.toFields)) ?? 0
  // Parents still under the rule's `min` come first, so every one of them is served; none above
  // its `max` is offered at all. With no rule there is nothing to count: every parent is open,
  // and none is behind.
  const { min, max } = bound
  const open = max === null ? parents : parents.filter((parent) => counted(parent) < max)
  const behind = min === null ? [] : open.filter((parent) => counted(parent) < min)
  // The parents furthest from their `min` come first, so the rows are spread before any is spent.
  const fewest = Math.min(...behind.map(counted))
  const short = behind.filter((parent) => counted(parent) === fewest)
  return { bound, open, short }
}

/** A parent for a many-to-one key, spread over the parents as the relation rule asks. */
function pickCounted(input: RowInput, fk: ForeignKey, self: SeedRow, parents: readonly SeedRow[]) {
  return Effect.gen(function* () {
    const { context, table } = input
    const { bound, open, short } = candidates(input, fk, parents)
    const nullRate = context.config.nullRate ?? 0
    if (
      !fk.required &&
      short.length === 0 &&
      nullRate > 0 &&
      context.faker.datatype.boolean({ probability: nullRate })
    ) {
      return null
    }
    if (short.length > 0) return context.faker.helpers.arrayElement(short)
    if (open.length > 0) return context.faker.helpers.arrayElement(open)
    if (parents.length > 0 && bound.max !== null) {
      return yield* new SeedGenerationError({
        message: `${table.name}.${fk.field}: every ${fk.toModel} already has ${bound.max} ${table.name} rows (models.${fk.toModel}.relations.${bound.field ?? ''}.max).\n   Lower models.${table.name}.count or raise the max.`,
      })
    }
    if (fk.self) return fk.required ? self : null
    if (!fk.required) return null
    return yield* new SeedGenerationError({
      message: `${table.name}.${fk.field} requires a ${fk.toModel} row, but ${fk.toModel} has none. Give ${fk.toModel} a count.`,
    })
  })
}

/**
 * What a real row gets for a column it leaves out: the `@default` (a literal as written, a
 * function as the library makes it, autoincrement as the next number), an `@updatedAt` stamp,
 * or null when the field is optional. A required field with no default has to be given.
 */

/** The rule the parent model sets on the list or single field this key is the other side of. */
function parentBound(context: Context, table: ModelTable, fk: ForeignKey) {
  const own = table.model.fields.find((f) => f.name === fk.field)
  const parent = modelTable(context.tables, fk.toModel)
  const inverse = parent?.model.fields.find(
    (f) =>
      f.kind === 'object' &&
      f.relationName === own?.relationName &&
      f.type === table.name &&
      (f.relationFromFields ?? []).length === 0,
  )
  const rule =
    inverse === undefined ? undefined : context.config.models[fk.toModel]?.relations?.[inverse.name]
  return { field: inverse?.name ?? null, min: rule?.min ?? null, max: rule?.max ?? null }
}

/** `User[1] { email: "bob@example.com" }`: the row by index and by the key that says most about it. */

/** How a real row claims a parent of a one-to-one key: by scalars, by unique key, or not at all. */
export function claimOf(fk: ForeignKey, given: SeedRow, parents: readonly SeedRow[]) {
  const reference = given[fk.field]
  if (isKeyObject(reference)) {
    const parent = parents.find(matchesKey(Object.entries(reference)))
    return parent === undefined ? null : uniqueKey(parent, fk.toFields)
  }
  return specifies(given, fk)
    ? fk.fromFields.map((field) => keyOf(given[field] ?? null)).join(' ')
    : null
}

/** Queues the rows nested under one parent-side field, each with its key to the parent filled. */
