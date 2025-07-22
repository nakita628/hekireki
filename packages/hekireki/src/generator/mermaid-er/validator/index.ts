/**
 * Remove duplicate relations and exclude any that are many-to-one.
 *
 * @param relations - An array of Mermaid ER diagram relation lines.
 * @returns A filtered array excluding 'many-to-one' relations.
 */
export function excludeManyToOneRelations(relations: readonly string[]): readonly string[] {
  return [...new Set(relations)].filter((r) => !r.includes('many-to-one'))
}

/**
 * Check if the given key is a valid relationship type.
 *
 * @param key - The key to check.
 * @returns `true` if the key is one of the valid relationship types, otherwise `false`.
 */
export function isRelationship(key: string): key is 'zero-one' | 'one' | 'zero-many' | 'many' {
  return ['zero-one', 'one', 'zero-many', 'many'].includes(key)
}

/**
 * Parse a `@relation` annotation line into a structured relation object.
 *
 * @param line - A string representing a single `@relation` annotation.
 * @returns An object containing relation details if the line is valid, otherwise `null`.
 */
export function parseRelation(line: string): {
  fromModel: string
  fromField: string
  toModel: string
  toField: string
  type: string
} | null {
  const relationRegex = /^@relation\s+(\w+)\.(\w+)\s+(\w+)\.(\w+)\s+(\w+-to-\w+)$/
  const match = line.trim().match(relationRegex)

  if (!match) {
    return null
  }

  const [, fromModel, fromField, toModel, toField, relationType] = match

  return {
    fromModel,
    fromField,
    toModel,
    toField,
    type: relationType,
  }
}

/**
 * Remove duplicate relation lines from an array of Mermaid ER diagram relations.
 *
 * @param relations - An array of relation lines (e.g., generated from `relationLine`).
 * @returns A new array with duplicates removed, preserving insertion order.
 */
export function removeDuplicateRelations(relations: readonly string[]): readonly string[] {
  return [...new Set(relations)]
}
