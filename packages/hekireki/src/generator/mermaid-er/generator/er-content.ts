import type { DMMF } from '@prisma/generator-helper'
import { modelInfo } from '../generator/index.js'
import { extractRelations } from '../helper/extract-relations.js'
import { removeDuplicateRelations } from '../utils/index.js'

// ER diagram header
const ER_HEADER = ['```mermaid', 'erDiagram'] as const

// ER diagram footer
const ER_FOOTER = ['```'] as const

/**
 * Generate Mermaid ER diagram content from Prisma models.
 *
 * @param models - The list of Prisma DMMF models.
 * @returns An array of Mermaid ER diagram lines.
 */
export function erContent(models: readonly DMMF.Model[]): readonly string[] {
  // extract all relations
  const allRelations = models.flatMap(extractRelations)
  // remove duplicate relations
  const uniqueRelations = removeDuplicateRelations(allRelations)
  // collect all model info
  const modelInfos = models.flatMap(modelInfo)
  // build ER diagram
  return [...ER_HEADER, ...uniqueRelations, ...modelInfos, ...ER_FOOTER]
}
