import type { DMMF } from '@prisma/generator-helper'
import { Effect } from 'effect'

import type { SeedRow } from '../config.js'
import { SeedGenerationError } from '../errors.js'
import type { JoinTable, ModelTable } from '../plan.js'
import type { Context } from './context.js'
import { describeValue, inverseOwner, keyOf, modelTable } from './context.js'

/** `User[1] { email: "bob@example.com" }`: the row by index and by the key that says most about it. */
function labelOf(table: ModelTable, index: number, row: SeedRow) {
  const ids = new Set(table.model.fields.filter((f) => f.isId).map((f) => f.name))
  const key = [...table.uniques]
    .toSorted((a, b) => Number(a.some((f) => ids.has(f))) - Number(b.some((f) => ids.has(f))))
    .find((fields) => fields.every((field) => row[field] !== undefined && row[field] !== null))
  const shown =
    key === undefined
      ? ''
      : ` { ${key.map((field) => `${field}: ${describeValue(row[field] ?? null)}`).join(', ')} }`
  return `${table.name}[${index}]${shown}`
}

/** How many rows of the relation each row of the table has, by the table row's index. */

/** How many rows of the relation each row of the table has, by the table row's index. */
function relatedCounts(
  context: Context,
  table: ModelTable,
  field: DMMF.Field,
  rows: readonly SeedRow[],
) {
  const join = context.tables.find(
    (t): t is JoinTable =>
      t.kind === 'join' &&
      t.sides.some((side) => side.model === table.name && side.field === field.name),
  )
  if (join !== undefined) {
    const side = join.sides.find((s) => s.model === table.name && s.field === field.name)
    const pairs = context.rowsByModel.get(join.name) ?? []
    return rows.map((row) =>
      side === undefined
        ? 0
        : pairs.filter(
            (pair) => keyOf(pair[side.column] ?? null) === keyOf(row[side.idField] ?? null),
          ).length,
    )
  }
  const owner = inverseOwner(context.tables, table, field)
  const children = context.rowsByModel.get(field.type) ?? []
  if (owner === undefined) return rows.map(() => 0)
  const from = owner.relationFromFields ?? []
  const to = owner.relationToFields ?? []
  return rows.map(
    (row) =>
      children.filter((child) =>
        from.every((f, i) => keyOf(child[f] ?? null) === keyOf(row[to[i] ?? ''] ?? null)),
      ).length,
  )
}

/** Every relation rule against the rows made: each row must have between `min` and `max` related rows. */

/** Every relation rule against the rows made: each row must have between `min` and `max` related rows. */
export function checkCardinality(context: Context) {
  return Effect.gen(function* () {
    const problems = Object.entries(context.config.models).flatMap(([name, rule]) => {
      const table = modelTable(context.tables, name)
      const rows = context.rowsByModel.get(name) ?? []
      if (table === undefined) return []
      return Object.entries(rule.relations ?? {}).flatMap(([fieldName, bound]) => {
        const field = table.model.fields.find((f) => f.name === fieldName)
        if (field === undefined) return []
        const counts = relatedCounts(context, table, field, rows)
        return counts.flatMap((count, index) => {
          const row = rows[index]
          if (row === undefined) return []
          const where = `${labelOf(table, index, row)}.${fieldName}: ${count} row${count === 1 ? '' : 's'}`
          if (bound.min !== undefined && count < bound.min) {
            return [
              `${where}, at least ${bound.min} expected (models.${name}.relations.${fieldName}.min)`,
            ]
          }
          if (bound.max !== undefined && count > bound.max) {
            return [
              `${where}, at most ${bound.max} expected (models.${name}.relations.${fieldName}.max)`,
            ]
          }
          return []
        })
      })
    })
    if (problems.length > 0) {
      const shown = problems.slice(0, 20)
      const more = problems.length - shown.length
      yield* new SeedGenerationError({
        message: `Relations out of bounds, nothing was inserted.\n   ${shown.join('\n   ')}${more > 0 ? `\n   ... and ${more} more` : ''}`,
      })
    }
  })
}

/** How a real row claims a parent of a one-to-one key: by scalars, by unique key, or not at all. */
