import type { DMMF } from '@prisma/generator-helper'

import { arktypeSchemaCode, makeArktypeRelations } from '../helper/arktype.js'
import { makeRelationsOnly } from '../utils/extract-relations.js'

export function arktypeCode(dmmf: DMMF.Document, type: boolean, relation: boolean) {
  const base = arktypeSchemaCode(dmmf.datamodel.models, type, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeArktypeRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}
