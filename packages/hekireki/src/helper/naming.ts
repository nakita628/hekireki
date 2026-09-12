/**
 * A Prisma name as a type name: the underscores join words, each word starts in upper case, and a
 * word in capitals throughout (`PENDING`, `ID`) is lower-cased after its first letter; any other
 * casing is the schema author's and is kept (`sku_code` → `SkuCode`, `userID` → `UserID`,
 * `PENDING_REVIEW` → `PendingReview`).
 *
 * @param name - A Prisma model, field or enum value name.
 * @returns The PascalCase name.
 */
export function pascalCase(name: string) {
  const text = name
    .split('_')
    .filter((word) => word !== '')
    .map((word) => {
      const rest = word.slice(1)
      return `${word.charAt(0).toUpperCase()}${word === word.toUpperCase() ? rest.toLowerCase() : rest}`
    })
    .join('')
  return /^\p{L}/u.test(text) ? text : `_${text}`
}

/**
 * The first of `candidate`, `candidate1`, `candidate2`, ... that is free — the numbering
 * `dotnet ef dbcontext scaffold` gives names that collide, which the other generators follow too.
 *
 * @param candidate - The preferred name.
 * @param isTaken - Whether a name is already in use.
 * @returns A free name.
 */
export function uniqueName(candidate: string, isTaken: (name: string) => boolean) {
  if (!isTaken(candidate)) return candidate
  const suffix = Array.from({ length: 10_000 }, (_, index) => index + 1).find(
    (index) => !isTaken(`${candidate}${index}`),
  )
  return `${candidate}${suffix ?? ''}`
}

export function allocate(
  candidates: readonly { readonly key: string; readonly candidate: string }[],
  reserved: readonly string[],
  fold: (name: string) => string,
) {
  return candidates.reduce(
    (acc, { key, candidate }) => {
      const name = uniqueName(candidate, (taken) => acc.taken.has(fold(taken)))
      return {
        names: new Map([...acc.names, [key, name]]),
        taken: new Set([...acc.taken, fold(name)]),
      }
    },
    { names: new Map<string, string>(), taken: new Set(reserved.map(fold)) },
  ).names
}
