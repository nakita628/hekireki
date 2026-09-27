import type { DMMF } from '@prisma/generator-helper'

import { makeZodRelations, zodSchemaCode } from '../helper/zod.js'
import { makeRelationsOnly } from '../utils/extract-relations.js'

export function zodCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
  version: string,
) {
  const base = zodSchemaCode(dmmf.datamodel.models, type, comment, version, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeZodRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}
