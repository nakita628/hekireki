/** The items in runs of at most `size`, in order: a batch of rows per statement. */
export function chunks<T>(items: readonly T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )
}

/** Whether two lists hold the same items in the same order. */
export function isSameList(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, i) => value === b[i])
}
