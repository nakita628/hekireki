import type { DMMF } from '@prisma/generator-helper'
import { Effect } from 'effect'

import type { SeedRow } from '../config.js'
import { SeedGenerationError } from '../errors.js'
import type { ModelTable } from '../plan.js'
import type { Context } from './context.js'
import { describeValue, inverseOwner, isKeyObject, isSeedList } from './context.js'

/** Queues the rows nested under one parent-side field, each with its key to the parent filled. */
function nestField(
  context: Context,
  table: ModelTable,
  field: DMMF.Field,
  given: SeedRow,
  row: SeedRow,
) {
  return Effect.gen(function* () {
    const owner = inverseOwner(context.tables, table, field)
    const nested = given[field.name]
    if (owner === undefined || nested === undefined || nested === null) return
    const children = isSeedList(nested) ? nested : [nested]
    const link = Object.fromEntries(
      (owner.relationFromFields ?? []).map((from, i) => [
        from,
        row[owner.relationToFields?.[i] ?? ''] ?? null,
      ]),
    )
    const queue = context.pending.get(field.type) ?? []
    context.pending.set(field.type, queue)
    for (const child of children) {
      if (!isKeyObject(child)) {
        yield* new SeedGenerationError({
          message: `${table.name}.${field.name}: expected rows of ${field.type}, got ${describeValue(child)}.`,
        })
      } else if (owner.name in child || Object.keys(link).some((from) => from in child)) {
        // The nesting already says which parent this is; a second answer could only disagree.
        yield* new SeedGenerationError({
          message: `${table.name}.${field.name}: a nested ${field.type} row already points at its ${table.name} through ${owner.name}; leave out ${owner.name} and ${Object.keys(link).join(', ')}.`,
        })
      } else {
        // oxlint-disable-next-line custom/no-mutation -- the queue is consumed by the child model's loop
        queue.push({ ...child, ...link })
      }
    }
  })
}

/**
 * The rows nested under a real row, each with its key to the parent filled from the parent as it
 * was made; queued for the child model, or for this model itself under a self relation.
 */

/**
 * The rows nested under a real row, each with its key to the parent filled from the parent as it
 * was made; queued for the child model, or for this model itself under a self relation.
 */
export function nestChildren(context: Context, table: ModelTable, given: SeedRow, row: SeedRow) {
  return Effect.forEach(
    table.model.fields.filter(
      (field) => field.kind === 'object' && (field.relationFromFields ?? []).length === 0,
    ),
    (field) => nestField(context, table, field, given, row),
    { discard: true },
  )
}
