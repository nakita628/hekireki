import type { DMMF } from '@prisma/generator-helper'

import {
  collectPydanticImports,
  makePydanticModel,
  makePydanticRelations,
} from '../helper/pydantic.js'

export function pydanticCode(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  comment: boolean,
  relation = false,
) {
  const bodies = models
    .map((model) => makePydanticModel(model, enums, comment))
    .filter((body) => body !== null)
  const relationBodies = relation
    ? models
        .map((model) => makePydanticRelations(model, models, enums))
        .filter((body) => body !== null)
    : []
  return [
    collectPydanticImports(models, enums, relation).join('\n'),
    '',
    '',
    [...bodies, ...relationBodies].join('\n\n\n'),
    '',
  ].join('\n')
}
