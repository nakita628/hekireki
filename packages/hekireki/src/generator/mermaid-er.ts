import type { DMMF } from '@prisma/generator-helper'

import { erRelationLine, modelInfo } from '../helper/mermaid-er.js'
import { mergeERRelations } from '../helper/relation.js'

const ER_HEADER = ['```mermaid', 'erDiagram']
const ER_FOOTER = ['```']

export function erContent(models: readonly DMMF.Model[]) {
  const resolveName = (model: string) => models.find((m) => m.name === model)?.dbName ?? model
  const relations = mergeERRelations(models).map((relation) => erRelationLine(relation, resolveName))
  const modelInfos = models.flatMap(modelInfo)
  return [...ER_HEADER, ...relations, ...modelInfos, ...ER_FOOTER]
}
