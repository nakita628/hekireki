import type { DMMF } from '@prisma/generator-helper'
import { relationLine } from '../generator/relation-line.js'
import { parseRelation } from '../utils/index.js'

/**
 * Extract Mermaid ER diagram relation lines from a Prisma model.
 *
 * @param model - A Prisma DMMF model definition.
 * @returns An array of Mermaid ER diagram relation lines based on `@relation` annotations.
 */
export function extractRelations(model: DMMF.Model): readonly string[] {
  if (!model.documentation) {
    return []
  }

  return model.documentation
    .split('\n')
    .map((line: string) => {
      const relation = parseRelation(line)
      if (!relation) return null
      const result = relationLine(relation)
      return result.ok ? result.value : null
    })
    .filter((line): line is string => line !== null)
}
