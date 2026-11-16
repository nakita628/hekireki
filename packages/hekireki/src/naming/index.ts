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
  for (let index = 1; index <= 10_000; index += 1) {
    if (!isTaken(`${candidate}${index}`)) return `${candidate}${index}`
  }
  return candidate
}

export function allocate(
  candidates: readonly { readonly key: string; readonly candidate: string }[],
  reserved: readonly string[],
  fold: (name: string) => string,
) {
  // Each name is chosen against the ones before it, so the two are filled as the candidates are
  // walked rather than copied at every step.
  const names = new Map<string, string>()
  const taken = new Set(reserved.map(fold))
  for (const { key, candidate } of candidates) {
    const name = uniqueName(candidate, (one) => taken.has(fold(one)))
    names.set(key, name)
    taken.add(fold(name))
  }
  return names
}
