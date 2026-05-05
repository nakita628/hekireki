import type { DMMF } from '@prisma/generator-helper'

import { arktypeSchemaCode, makeArktypeRelations } from '../helper/arktype.js'
import { makeRelationsOnly } from '../helper/extract-relations.js'

export function arktypeCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
): string {
  const base = arktypeSchemaCode(dmmf.datamodel.models, type, comment, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeArktypeRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}
