import type { DMMF } from '@prisma/generator-helper'

import { effectSchemaCode, makeEffectRelations } from '../helper/effect.js'
import { makeRelationsOnly } from '../helper/extract-relations.js'

export function effectCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
): string {
  const base = effectSchemaCode(dmmf.datamodel.models, type, comment, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeEffectRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}
