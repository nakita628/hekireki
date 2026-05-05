import type { DMMF } from '@prisma/generator-helper'

import { makeRelationsOnly } from '../helper/extract-relations.js'
import { makeTypeBoxRelations, typeboxSchemaCode } from '../helper/typebox.js'

export function typeboxCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
): string {
  const base = typeboxSchemaCode(dmmf.datamodel.models, type, comment, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeTypeBoxRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}
