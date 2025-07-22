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
