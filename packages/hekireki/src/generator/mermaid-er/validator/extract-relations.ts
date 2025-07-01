import { relationLine } from '../generator/relation-line.js'
import { parseRelation } from './index.js'
import type { Model } from '../types.js'

/**
 * extract relations from model
 * @param { Model } model
 * @returns { readonly string[] }
 */
export function extractRelations(model: Model): readonly string[] {
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
