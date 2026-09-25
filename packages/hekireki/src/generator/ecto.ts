import type { DMMF } from '@prisma/generator-helper'

import { ectoSchemas } from '../helper/ecto.js'
import { makeSnakeCase } from '../utils/index.js'

export function ectoSchemaFiles(
  models: readonly DMMF.Model[],
  app: string | string[],
  enums?: readonly DMMF.DatamodelEnum[],
  options: {
    readonly provider?: string
    readonly indexes?: readonly DMMF.Index[]
    readonly foreignKeyNames?: ReadonlyMap<string, string>
    readonly relationMode?: string
  } = {},
) {
  return models
    .map((model) => ({
      fileName: `${makeSnakeCase(model.name)}.ex`,
      code: ectoSchemas([model], app, models, enums, options),
    }))
    .filter((entry) => entry.code.trim().length > 0)
}
