import type { DMMF } from '@prisma/generator-helper'

const RELATIONSHIPS = {
  'zero-one': '|o',
  one: '||',
  'zero-many': '}o',
  many: '}|',
} as const

type RelationshipKey = keyof typeof RELATIONSHIPS

/**
 * Extract Mermaid ER diagram relation lines from Prisma DMMF models.
 * This function automatically detects relations from field definitions.
 *
 * @param models - The list of Prisma DMMF models.
 * @returns An array of Mermaid ER diagram relation lines.
 */
export function extractRelationsFromDmmf(models: readonly DMMF.Model[]): readonly string[] {
  const relations: string[] = []

  for (const model of models) {
    for (const field of model.fields) {
      // Skip non-relation fields
      if (field.kind !== 'object' || !field.relationFromFields || field.relationFromFields.length === 0) {
        continue
      }

      // This is the "owning" side of the relation (has the foreign key)
      const toModel = model.name
      const fromModel = field.type
      const toField = field.relationFromFields[0]
      const fromField = field.relationToFields?.[0] ?? 'id'

      // Determine cardinality
      // From side: always "one" (the referenced side)
      // To side: depends on isList on the inverse relation
      const fromCardinality: RelationshipKey = 'one'

      // Find the inverse relation to determine if it's one-to-many or one-to-one
      const relatedModel = models.find((m) => m.name === fromModel)
      const inverseField = relatedModel?.fields.find(
        (f) => f.relationName === field.relationName && f.name !== field.name,
      )

      let toCardinality: RelationshipKey
      if (inverseField?.isList) {
        // The inverse is a list, so this side is "many"
        toCardinality = field.isRequired ? 'many' : 'zero-many'
      } else {
        // One-to-one relation
        toCardinality = field.isRequired ? 'one' : 'zero-one'
      }

      const fromSymbol = RELATIONSHIPS[fromCardinality]
      const toSymbol = RELATIONSHIPS[toCardinality]
      const connector = '--'

      const relationLine = `    ${fromModel} ${fromSymbol}${connector}${toSymbol} ${toModel} : "(${fromField}) - (${toField})"`
      relations.push(relationLine)
    }
  }

  return relations
}
