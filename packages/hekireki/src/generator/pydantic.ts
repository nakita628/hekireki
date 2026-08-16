import type { DMMF } from '@prisma/generator-helper'

import { collectPydanticImports, makePydanticModel } from '../helper/pydantic.js'

export function pydanticCode(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  comment: boolean,
) {
  const bodies = models
    .map((model) => makePydanticModel(model, enums, comment))
    .filter((body) => body !== null)
  return [collectPydanticImports(models, enums).join('\n'), '', '', bodies.join('\n\n\n'), ''].join(
    '\n',
  )
}
