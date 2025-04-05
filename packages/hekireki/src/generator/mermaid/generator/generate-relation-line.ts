import type { Relation } from '../type'
import { buildRelationLine } from '../relationship/build-relation-line'

/**
 * generate relation line
 * @param { Relation } relation
 * @returns { string } relation line
 */
export function generateRelationLine(relation: Relation): string {
  const cardinality = buildRelationLine(relation.type)

  if (!cardinality) {
    throw new Error(`Unknown relation type: ${relation.type}`)
  }

  return `    ${relation.fromModel} ${cardinality} ${relation.toModel} : "(${relation.fromField}) - (${relation.toField})"`
}
