import type { ERContent, Model } from '../types.js'
import { ER_FOOTER, ER_HEADER } from '../index.js'
import { modelInfo } from '../generator/index.js'
import { extractRelations, removeDuplicateRelations } from '../validator/index.js'

/**
 * generate ER content
 * @param { readonly Model[] } models - models
 * @returns { ERContent } - ER content
 */
export function erContent(models: readonly Model[]): ERContent {
  console.log('--- ER Content ---')
  console.log(models)
  console.log('--- ER Content End ---')
  // extract all relations
  const allRelations = models.flatMap(extractRelations)
  // remove duplicate relations
  const uniqueRelations = removeDuplicateRelations(allRelations)
  // collect all model info
  const modelInfos = models.flatMap(modelInfo)
  // build ER diagram
  return [...ER_HEADER, ...uniqueRelations, ...modelInfos, ...ER_FOOTER]
}
