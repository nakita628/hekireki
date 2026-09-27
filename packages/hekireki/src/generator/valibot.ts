import type { DMMF } from '@prisma/generator-helper'

import { makeValibotRelations, valibotSchemaCode } from '../helper/valibot.js'
import { makeRelationsOnly } from '../utils/extract-relations.js'

export function valibotCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
) {
  const base = valibotSchemaCode(dmmf.datamodel.models, type, comment, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeValibotRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}
