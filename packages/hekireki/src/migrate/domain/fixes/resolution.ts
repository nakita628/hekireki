// What resolving one entry of the decisions gives. Every entry is resolved on its own and the
// lot is split afterwards, so a decisions file with several mistakes names all of them at once.

/** One entry of the decisions resolved against the schema and the database, or refused with why. */
export type Resolution<A, E> =
  | { readonly refused: false; readonly value: A }
  | { readonly refused: true; readonly reason: E }

/** Why each refused entry was refused, and what each resolved one resolved to, both in order. */
export function separate<A, E>(
  resolutions: readonly Resolution<A, E>[],
): readonly [readonly E[], readonly A[]] {
  return [
    resolutions.flatMap((resolution) => (resolution.refused ? [resolution.reason] : [])),
    resolutions.flatMap((resolution) => (resolution.refused ? [] : [resolution.value])),
  ]
}
