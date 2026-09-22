import type { Faker } from '@faker-js/faker'
import { Effect } from 'effect'

import type { Dialect } from '../../database/url.js'
import type { SeedRow } from '../config.js'
import type { ResolvedSeedConfig } from '../options.js'
import type { ModelTable, SeedTable, SeedTableRows } from '../plan.js'
import { validateRows } from '../validate.js'
import { checkCardinality } from './cardinality.js'
import type { Context } from './context.js'
import { uniqueKey } from './context.js'
import { makeJoinRows } from './links.js'
import { nestChildren } from './nest.js'
import { claimOf } from './parents.js'
import { attemptRow } from './rows.js'
import { checkRules } from './rules.js'

function makeModelRows(context: Context, table: ModelTable) {
  return Effect.gen(function* () {
    const rule = context.config.models[table.name]
    // The real rows: the model's own, then the ones nested under parents made before it. A self
    // relation nests rows into this very queue while it is being walked.
    const queue: SeedRow[] = [...(rule?.data ?? []), ...(context.pending.get(table.name) ?? [])]
    context.pending.set(table.name, queue)
    const oneToOne = table.foreignKeys.filter((fk) => fk.oneToOne && !fk.self)
    const parentCounts = oneToOne
      .filter((fk) => fk.required)
      .map((fk) => (context.rowsByModel.get(fk.toModel) ?? []).length)
    // Faker rows come after the real ones: as many as the rule says, or the config's count for a
    // model with no rule, never more one-to-one children than there are parents left.
    const generated =
      rule?.data !== undefined
        ? 0
        : (rule?.count ??
          (context.config.count === null ? 0 : Math.min(context.config.count, ...parentCounts)))
    // A parent a real row points at is spoken for; the others are dealt out to the rest.
    const pools = new Map(
      oneToOne.map((fk) => {
        const parents = context.rowsByModel.get(fk.toModel) ?? []
        const claimed = new Set(queue.flatMap((given) => claimOf(fk, given, parents) ?? []))
        return [
          fk.field,
          context.faker.helpers.shuffle(
            parents.filter((parent) => !claimed.has(uniqueKey(parent, fk.toFields))),
          ),
        ] as const
      }),
    )
    const slots = new Map<string, number>(oneToOne.map((fk) => [fk.field, 0]))
    const seen = new Map(
      table.uniques.map((fields) => [fields.join(' '), new Set<string>()] as const),
    )
    // Rows accumulate in place: a spread per row would be quadratic.
    const rows: SeedRow[] = []
    for (let index = 0; index < queue.length + generated; index += 1) {
      const given = queue[index] ?? null
      const row = yield* attemptRow(
        { context, table, index, own: rows, given, pools, slots: new Map(slots) },
        seen,
      )
      if (given !== null) yield* nestChildren(context, table, given, row)
      for (const fk of oneToOne) {
        if (
          given === null ||
          claimOf(fk, given, context.rowsByModel.get(fk.toModel) ?? []) === null
        ) {
          slots.set(fk.field, (slots.get(fk.field) ?? 0) + 1)
        }
      }
      for (const fields of table.uniques) {
        seen.get(fields.join(' '))?.add(uniqueKey(row, fields))
      }
      for (const fk of table.foreignKeys) {
        const parent = uniqueKey(row, fk.fromFields)
        if (fk.fromFields.some((field) => row[field] !== null && row[field] !== undefined)) {
          const counts =
            context.linkCounts.get(`${table.name}.${fk.field}`) ?? new Map<string, number>()
          counts.set(parent, (counts.get(parent) ?? 0) + 1)
          context.linkCounts.set(`${table.name}.${fk.field}`, counts)
        }
      }
      // oxlint-disable-next-line custom/no-mutation -- see the declaration above: in-place keeps it linear
      rows.push(row)
    }
    context.givenByModel.set(table.name, queue)
    yield* validateRows(table, rows)
    const all: readonly SeedRow[] = rows
    return all
  })
}

/** The id of the partner a link names, by id or by a unique key; fails when no row matches. */

function makeTableRows(
  context: Context,
  rowsByModel: Map<string, readonly SeedRow[]>,
  table: SeedTable,
) {
  return Effect.gen(function* () {
    if (table.kind === 'join') {
      const rows = yield* makeJoinRows(context, table)
      rowsByModel.set(table.name, rows)
      const entry: SeedTableRows = { table, rows }
      return entry
    }
    const rows = yield* makeModelRows(context, table)
    rowsByModel.set(table.name, rows)
    const entry: SeedTableRows = { table, rows }
    return entry
  })
}

/**
 * Rows for every table of the plan, in plan order, from one seeded faker: given rows first and
 * as written, parents before children, each foreign key pointing at a row that exists, every
 * unique constraint honoured, every validator passed.
 */

/**
 * Rows for every table of the plan, in plan order, from one seeded faker: given rows first and
 * as written, parents before children, each foreign key pointing at a row that exists, every
 * unique constraint honoured, every validator passed.
 */
export function generateSeedRows(input: {
  readonly tables: readonly SeedTable[]
  readonly config: ResolvedSeedConfig
  readonly faker: Faker
  /** The database the rows are for; a MySQL `String` with no `@db.*` type is VARCHAR(191). */
  readonly dialect?: Dialect | null
}) {
  return Effect.gen(function* () {
    yield* checkRules(input.tables, input.config)
    const rowsByModel = new Map<string, readonly SeedRow[]>()
    const context: Context = {
      faker: input.faker,
      config: input.config,
      stringLength: input.dialect === 'mysql' ? 191 : null,
      tables: input.tables,
      rowsByModel,
      pending: new Map(),
      givenByModel: new Map(),
      linkCounts: new Map(),
    }
    const entries = yield* Effect.forEach(input.tables, (table) =>
      makeTableRows(context, rowsByModel, table),
    )
    yield* checkCardinality(context)
    return entries
  })
}
