/**
 * The ranking behind the command palette. A query matches a label when its characters appear in
 * that order somewhere in it, so `ua` finds `UserAccount`; the closer the hits sit to the start of
 * a word the higher the entry ranks, which is what puts `Post` above `PostComment` for `post`.
 * Kept apart from the overlay and pure, so the order entries come out in is pinned by tests rather
 * than eyeballed in the browser.
 */

type Labelled = { readonly label: string }

export type Match<T> = {
  readonly item: T
  /** Where in `item.label` the query landed, for the emphasis the list draws on those letters. */
  readonly indices: readonly number[]
}

/**
 * A letter starts a word when nothing precedes it, when what precedes it is not a letter or digit
 * (`created_at`, `order-line`), or when it is the capital of a camel hump (`createdAt`).
 */
function startsWord(label: string, index: number) {
  if (index === 0) return true
  const previous = label.charAt(index - 1)
  const current = label.charAt(index)
  if (!/[a-z0-9]/iu.test(previous)) return true
  return previous === previous.toLowerCase() && current !== current.toLowerCase()
}

/**
 * Where each letter of the query landed in the label, in order and never twice in the same place,
 * or null as soon as one of them is not there. Read one letter at a time from `from` onwards, so
 * the first `u` of `usr` cannot also be the `u` the second letter needs.
 */
function landings(haystack: string, query: string, from = 0): readonly number[] | null {
  const character = query.charAt(0)
  if (character === '') return []
  const at = haystack.indexOf(character, from)
  if (at === -1) return null
  const rest = landings(haystack, query.slice(1), at + 1)
  return rest === null ? null : [at, ...rest]
}

/**
 * The score of one label against one query, or null when the query is not in it. Bonuses go to
 * letters that start a word and to letters that continue the run before them, so a match that
 * reads as whole words beats one scattered through the middle. The tie-breakers are worth less
 * than a single letter's bonus: an earlier first hit wins, and then the shorter label.
 */
function scoreLabel(label: string, query: string) {
  const indices = landings(label.toLowerCase(), query)
  if (indices === null) return null
  const points = indices.reduce(
    (sum, index, position) =>
      sum +
      1 +
      (startsWord(label, index) ? 8 : 0) +
      (index === (indices[position - 1] ?? -1) + 1 ? 4 : 0),
    0,
  )
  return { score: points * 1000 - (indices[0] ?? 0) * 10 - label.length, indices }
}

/**
 * The entries a query keeps, best first. An empty query keeps every entry in the order it was
 * given, which is the list the palette shows before anything is typed. Whitespace is dropped from
 * the query rather than matched, so `us er` still finds `User`.
 */
export function search<T extends Labelled>(
  items: readonly T[],
  query: string,
): readonly Match<T>[] {
  const needle = query.replaceAll(/\s+/gu, '').toLowerCase()
  if (needle === '') return items.map((item) => ({ item, indices: [] }))
  return items
    .flatMap((item) => {
      const scored = scoreLabel(item.label, needle)
      return scored === null ? [] : [{ item, score: scored.score, indices: scored.indices }]
    })
    .toSorted((a, b) => b.score - a.score)
    .map(({ item, indices }) => ({ item, indices }))
}

export type Segment = {
  /** Where the run starts in the label; its identity in the list, since runs never overlap. */
  readonly start: number
  readonly text: string
  readonly matched: boolean
}

/**
 * The label cut into the runs the query matched and the runs it did not, so the palette can pick
 * the matched letters out in one pass. Adjacent letters of the same kind are one run, which keeps
 * `Post` under `post` a single emphasised word rather than four emphasised letters.
 */
export function segments(label: string, indices: readonly number[]): readonly Segment[] {
  const hit = new Set(indices)
  // Walked by code unit, because the offsets the matcher reports are code-unit offsets. A run
  // starts wherever the matched/unmatched answer changes, and reaches to the next start.
  const starts = Array.from({ length: label.length }, (_, position) => position).filter(
    (position) => position === 0 || hit.has(position) !== hit.has(position - 1),
  )
  return starts.map((start, run) => ({
    start,
    text: label.slice(start, starts[run + 1] ?? label.length),
    matched: hit.has(start),
  }))
}
