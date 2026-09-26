import type { DMMF } from '@prisma/generator-helper'

import { dateTimeFields, dateTimeModule, ectoDateTypes, ectoSchemas } from '../helper/ecto.js'
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
  return [
    ...models.map((model) => ({
      fileName: `${makeSnakeCase(model.name)}.ex`,
      code: ectoSchemas([model], app, models, enums, options),
    })),
    // The types a DateTime is kept in, written beside the schemas that name them.
    {
      fileName: 'prisma_date_time.ex',
      code: ectoDateTypes(
        Array.isArray(app) ? app.join('.') : app,
        options.provider,
        new Set(models.flatMap((model) => dateTimeFields(model).map(dateTimeModule))),
      ),
    },
  ].filter((entry) => entry.code.trim().length > 0)
}
