import type { Relation } from '../type'

/**
 * parse relation
 * @function parseRelation
 * @param line
 * @returns
 */
export function parseRelation(line: string): Relation | null {
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
