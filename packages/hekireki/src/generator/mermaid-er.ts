import type { DMMF } from '@prisma/generator-helper'

import {
  extractRelationsFromDmmf,
  modelInfo,
  removeDuplicateRelations,
} from '../helper/mermaid-er.js'

const ER_HEADER = ['```mermaid', 'erDiagram']
const ER_FOOTER = ['```']

export function erContent(models: readonly DMMF.Model[]) {
  const allRelations = extractRelationsFromDmmf(models)
  const uniqueRelations = removeDuplicateRelations(allRelations)
  const modelInfos = models.flatMap(modelInfo)
  return [...ER_HEADER, ...uniqueRelations, ...modelInfos, ...ER_FOOTER]
}
