import type { DMMF } from '@prisma/generator-helper'

import { ajvSchemaCode, makeAjvRelations } from '../helper/ajv.js'
import { makeRelationsOnly } from '../helper/extract-relations.js'

export function ajvCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
): string {
  const base = ajvSchemaCode(dmmf.datamodel.models, type, comment, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeAjvRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}
