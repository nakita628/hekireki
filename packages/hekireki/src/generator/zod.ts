import type { DMMF } from '@prisma/generator-helper'

import { makeRelationsOnly } from '../helper/extract-relations.js'
import { makeZodRelations, zodSchemaCode } from '../helper/zod.js'

export function zodCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
  version: string,
): string {
  const base = zodSchemaCode(dmmf.datamodel.models, type, comment, version, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeZodRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}
