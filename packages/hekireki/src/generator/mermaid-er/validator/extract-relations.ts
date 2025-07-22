import type { DMMF } from '@prisma/generator-helper'
import { relationLine } from '../generator/relation-line.js'
import { parseRelation } from './index.js'

/**
 * Extract Mermaid ER diagram relation lines from a Prisma model.
 *
 * @param model - A Prisma DMMF model definition.
 * @returns An array of Mermaid ER diagram relation lines based on `@relation` annotations.
 */
export function extractRelations(model: DMMF.Model): readonly string[] {
  const relations: string[] = []

  // @relation annotation
  if (model.documentation) {
    const annotationRelations = model.documentation
      .split('\n')
      .map((line: string) => {
        const relation = parseRelation(line)
        return relation ? relationLine(relation) : null
      })
      .filter((line): line is string => line !== null)

    relations.push(...annotationRelations)
  }
  return relations
}
