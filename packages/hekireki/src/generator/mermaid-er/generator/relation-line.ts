import { buildRelationLine } from '../helper/build-relation-line.js'

/**
 * Generate a Mermaid ER diagram relation line from a relation definition.
 *
 * @param relation - The relation definition including model and field names.
 * @returns A string representing the relation line in Mermaid ER syntax.
 */
export function relationLine(relation: {
  fromModel: string
  toModel: string
  fromField: string
  toField: string
  type: string
}): string {
  const cardinality = buildRelationLine(relation.type)

  if (!cardinality) {
    throw new Error(`Unknown relation type: ${relation.type}`)
  }

  return `    ${relation.fromModel} ${cardinality} ${relation.toModel} : "(${relation.fromField}) - (${relation.toField})"`
}
