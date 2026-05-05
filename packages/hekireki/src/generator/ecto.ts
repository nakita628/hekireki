import type { DMMF } from '@prisma/generator-helper'

import { ectoSchemas } from '../helper/ecto.js'
import { makeSnakeCase } from '../utils/index.js'

export function ectoSchemaFiles(
  models: readonly DMMF.Model[],
  app: string | string[],
  enums?: readonly DMMF.DatamodelEnum[],
) {
  return models
    .map((model) => ({
      fileName: `${makeSnakeCase(model.name)}.ex`,
      code: ectoSchemas([model], app, models, enums),
    }))
    .filter((entry) => entry.code.trim().length > 0)
}
