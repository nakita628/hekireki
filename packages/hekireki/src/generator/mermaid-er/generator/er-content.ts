import type { ERContent, Model } from '../types.js'
import { modelInfo } from '../generator/index.js'
import { extractRelations, removeDuplicateRelations } from '../validator/index.js'

/**
 * generate ER content
 * @param { readonly Model[] } models - models
 * @returns { ERContent } - ER content
 */

// ER diagram header
const ER_HEADER = ['```mermaid', 'erDiagram'] as const

// ER diagram footer
const ER_FOOTER = ['```'] as const

export function erContent(models: readonly Model[]): ERContent {
  // extract all relations
  const allRelations = models.flatMap(extractRelations)
  // remove duplicate relations
  const uniqueRelations = removeDuplicateRelations(allRelations)
  // collect all model info
  const modelInfos = models.flatMap(modelInfo)
  // build ER diagram
  return [...ER_HEADER, ...uniqueRelations, ...modelInfos, ...ER_FOOTER]
}
