import type { DMMF } from '@prisma/generator-helper'

import { makeRelationsOnly } from '../helper/extract-relations.js'
import { makeValibotRelations, valibotSchemaCode } from '../helper/valibot.js'

export function valibotCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
): string {
  const base = valibotSchemaCode(dmmf.datamodel.models, type, comment, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeValibotRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}
