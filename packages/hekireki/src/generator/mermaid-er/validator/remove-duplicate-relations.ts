/**
 * Remove duplicate relation lines from an array of Mermaid ER diagram relations.
 *
 * @param relations - An array of relation lines (e.g., generated from `relationLine`).
 * @returns A new array with duplicates removed, preserving insertion order.
 */
export function removeDuplicateRelations(relations: readonly string[]): readonly string[] {
  return [...new Set(relations)]
}
