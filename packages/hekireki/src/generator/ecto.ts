import type { DMMF } from '@prisma/generator-helper'

import {
  dateTimeFields,
  dateTimeModule,
  ectoDateTypes,
  ectoJsonType,
  ectoSchemas,
  hasJsonField,
} from '../helper/ecto.js'
import { makeSnakeCase } from '../naming/case.js'

export function ectoSchemaFiles(
  models: readonly DMMF.Model[],
  app: string | string[],
  enums?: readonly DMMF.DatamodelEnum[],
  options: {
    readonly provider?: string
    readonly indexes?: readonly DMMF.Index[]
    readonly foreignKeyNames?: ReadonlyMap<string, string>
    readonly relationMode?: string
    readonly mysqlFlavor?: 'mysql' | 'mariadb'
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
    // The type a Json is kept in, likewise.
    {
      fileName: 'prisma_json.ex',
      code: models.some(hasJsonField)
        ? ectoJsonType(
            Array.isArray(app) ? app.join('.') : app,
            options.provider,
            options.mysqlFlavor,
          )
        : '',
    },
  ].filter((entry) => entry.code.trim().length > 0)
}
