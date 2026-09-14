import { Effect } from 'effect'

import type { SeedRow, SeedValue } from '../config.js'
import { SeedGenerationError } from '../errors.js'
import type { JoinSide, JoinTable } from '../plan.js'
import type { Context } from './context.js'
import { describeValue, isKeyObject, isSeedList, keyOf } from './context.js'

/** The id of the partner a link names, by id or by a unique key; fails when no row matches. */
function linkedPartner(
  own: JoinSide,
  other: JoinSide,
  index: number,
  partners: readonly SeedRow[],
  link: SeedValue,
) {
  return Effect.gen(function* () {
    const partner = isKeyObject(link)
      ? partners.find((candidate) =>
          Object.entries(link).every(
            ([field, value]) => keyOf(candidate[field] ?? null) === keyOf(value),
          ),
        )
      : partners.find((candidate) => keyOf(candidate[other.idField] ?? null) === keyOf(link))
    if (partner !== undefined) return partner[other.idField] ?? null
    const shown = isKeyObject(link)
      ? Object.entries(link)
          .map(([field, value]) => `${field} = ${describeValue(value)}`)
          .join(', ')
      : `${other.idField} = ${describeValue(link)}`
    return yield* new SeedGenerationError({
      message: `${own.model} data[${index}].${own.field}: no ${other.model} has ${shown}.\n   Give ${other.model} that row.`,
    })
  })
}

/** The pairs one real row lists (`tags: [1, { label: 'x' }]`), each partner checked to exist. */

/** The pairs one real row lists (`tags: [1, { label: 'x' }]`), each partner checked to exist. */
function listedPairsOf(
  own: JoinSide,
  other: JoinSide,
  index: number,
  given: SeedRow,
  row: SeedRow | undefined,
  partners: readonly SeedRow[],
) {
  return Effect.gen(function* () {
    const links = given[own.field]
    if (links === undefined || links === null) return []
    if (!isSeedList(links)) {
      return yield* new SeedGenerationError({
        message: `${own.model} data[${index}].${own.field}: expected a list of ${other.model} ids or keys.`,
      })
    }
    const ids = yield* Effect.forEach(links, (link) =>
      linkedPartner(own, other, index, partners, link),
    )
    return ids.map((id) => ({ [own.column]: row?.[own.idField] ?? null, [other.column]: id }))
  })
}

/** The pairs a side's real rows list themselves. */

/** The pairs a side's real rows list themselves. */
function listedPairs(context: Context, own: JoinSide, other: JoinSide) {
  const data = context.givenByModel.get(own.model) ?? []
  const rows = context.rowsByModel.get(own.model) ?? []
  const partners = context.rowsByModel.get(other.model) ?? []
  return Effect.forEach(data, (given, index) =>
    listedPairsOf(own, other, index, given, rows[index], partners),
  ).pipe(Effect.map((pairs) => pairs.flat()))
}

/**
 * Pairs for a join table. Real rows list their own links (`tags: [{ label }]` on a Post row, or
 * `posts` on a Tag row) and get nothing else; faker rows are linked to `min`..`max` distinct rows
 * of the other side by a relation rule, iterating the side that carries the rule (the A side
 * without one). The rule is then checked against every row, real or not.
 */

/**
 * Pairs for a join table. Real rows list their own links (`tags: [{ label }]` on a Post row, or
 * `posts` on a Tag row) and get nothing else; faker rows are linked to `min`..`max` distinct rows
 * of the other side by a relation rule, iterating the side that carries the rule (the A side
 * without one). The rule is then checked against every row, real or not.
 */
export function makeJoinRows(context: Context, table: JoinTable) {
  return Effect.gen(function* () {
    const [a, b] = table.sides
    const listed = [...(yield* listedPairs(context, a, b)), ...(yield* listedPairs(context, b, a))]
    const ruleA = context.config.models[a.model]?.relations?.[a.field]
    const ruleB = context.config.models[b.model]?.relations?.[b.field]
    const [from, to, rule] =
      ruleA === undefined && ruleB !== undefined ? [b, a, ruleB] : [a, b, ruleA ?? {}]
    const real = context.givenByModel.get(from.model)?.length ?? 0
    const rows = (context.rowsByModel.get(from.model) ?? []).slice(real)
    const partners = context.rowsByModel.get(to.model) ?? []
    // A faker row on the other side is a partner for everyone; a real row only when it has room.
    const drawn = rows.flatMap((row) => {
      const min = Math.min(rule.min ?? 0, partners.length)
      const max = Math.min(rule.max ?? 3, partners.length)
      const count = context.faker.number.int({ min, max: Math.max(min, max) })
      return context.faker.helpers.arrayElements(partners, count).map((partner) => ({
        [from.column]: row[from.idField] ?? null,
        [to.column]: partner[to.idField] ?? null,
      }))
    })
    return dedupe([...listed, ...drawn])
  })
}

/** The pairs once each: a link listed on both sides, or drawn twice, is one row of the join table. */

/** The pairs once each: a link listed on both sides, or drawn twice, is one row of the join table. */
function dedupe(pairs: readonly SeedRow[]) {
  const seen = new Set<string>()
  return pairs.filter((pair) => {
    const key = `${keyOf(pair.A ?? null)} ${keyOf(pair.B ?? null)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
