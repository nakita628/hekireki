import type { DMMF } from '@prisma/generator-helper'

import {
  makeOpenApiInput,
  makeOpenApiJoinTables,
  makeOpenApiPaths,
  makeOpenApiTable,
} from '../helper/openapi.js'
import { pluralize } from '../utils/humanizer.js'
import { makeSnakeCase } from '../utils/index.js'
import { allocate } from '../utils/naming.js'
import { toYaml } from '../utils/yaml.js'

/**
 * The OpenAPI 3.1 document Atlas's template writes for the database Prisma Migrate makes: `info`
 * from the options, and under `components.schemas` one schema per table, the models' in the
 * order the Prisma schema declares them and then the join tables of the implicit many-to-many
 * relations, each with the prose of its `///` comments as `description`. With `paths`, the CRUD
 * of each model comes before the components, under the model's name in plural kebab-case
 * (`/order-items`, a number appended where two models would share one), and the schemas a `POST`
 * and a `PATCH` take (`{table}_create`, `{table}_update`) follow the table's; a join table has
 * neither.
 */
export function openapiDocument(
  datamodel: DMMF.Datamodel,
  config: { readonly title: string; readonly version: string; readonly paths: boolean },
) {
  const { models, enums } = datamodel
  const tables = models.flatMap((model) => {
    const table = model.dbName ?? model.name
    return [
      [table, makeOpenApiTable(model, models, enums)] as const,
      ...(config.paths
        ? [
            [`${table}_create`, makeOpenApiInput(model, enums, 'create')] as const,
            [`${table}_update`, makeOpenApiInput(model, enums, 'update')] as const,
          ]
        : []),
    ]
  })
  return {
    openapi: '3.1.0',
    info: { title: config.title, version: config.version },
    ...(config.paths ? { paths: Object.fromEntries(pathsOf(models, enums)) } : {}),
    components: {
      schemas: Object.fromEntries([...tables, ...makeOpenApiJoinTables(models, enums)]),
    },
  }
}

/** The CRUD of every model, each under a resource name of its own. */
function pathsOf(models: readonly DMMF.Model[], enums: readonly DMMF.DatamodelEnum[]) {
  const resources = allocate(
    models.map((model) => ({
      key: model.name,
      candidate: pluralize(makeSnakeCase(model.name)).replaceAll('_', '-'),
    })),
    [],
    (name) => name,
  )
  return models.flatMap((model) =>
    makeOpenApiPaths(model, enums, resources.get(model.name) ?? model.name),
  )
}

/**
 * The document as the file to write: YAML as Atlas's template writes it, `type: [string, "null"]`
 * on one line and a string default in quotes, or JSON.
 */
export function openapiContent(
  datamodel: DMMF.Datamodel,
  config: {
    readonly title: string
    readonly version: string
    readonly paths: boolean
    readonly format: 'yaml' | 'json'
  },
) {
  const document = openapiDocument(datamodel, config)
  return config.format === 'json'
    ? `${JSON.stringify(document, null, 2)}\n`
    : toYaml(document, { flow: ['type'], quote: ['default'] })
}
