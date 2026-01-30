import { buildRelationLine } from '../helper/build-relation-line.js'

/**
 * Generate a Mermaid ER diagram relation line from a relation definition.
 *
 * @param relation - The relation definition including model and field names.
 * @returns A Result containing the relation line string or an error.
 */
export function relationLine(relation: {
  fromModel: string
  toModel: string
  fromField: string
  toField: string
  type: string
}):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string } {
  const result = buildRelationLine(relation.type)

  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    value: `    ${relation.fromModel} ${result.value} ${relation.toModel} : "(${relation.fromField}) - (${relation.toField})"`,
  }
}
