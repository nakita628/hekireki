import type { Relation } from '../types.js'
import { buildRelationLine } from '../relationship/build-relation-line.js'

/**
 * generate relation line
 * @param { Relation } relation
 * @returns { string } relation line
 */
export function relationLine(relation: Relation): string {
  const cardinality = buildRelationLine(relation.type)

  if (!cardinality) {
    throw new Error(`Unknown relation type: ${relation.type}`)
  }

  return `    ${relation.fromModel} ${cardinality} ${relation.toModel} : "(${relation.fromField}) - (${relation.toField})"`
}
