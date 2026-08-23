import type { DMMF } from '@prisma/generator-helper'

import {
  makeAtlasEnums,
  makeAtlasM2MJoinTables,
  makeAtlasSchemas,
  makeAtlasTable,
} from '../helper/atlas.js'

export function atlasSchema(
  datamodel: DMMF.Datamodel,
  provider: 'postgresql' | 'cockroachdb' | 'mysql' | 'sqlite',
  config: { readonly schemaName?: string; readonly comment?: boolean },
) {
  const dialect = provider === 'cockroachdb' ? 'postgresql' : provider
  const defaultSchema = config.schemaName ?? (dialect === 'sqlite' ? 'main' : 'public')
  const comment = config.comment ?? false
  const models = datamodel.models
  const blocks = [
    ...makeAtlasEnums(datamodel.enums, dialect, defaultSchema),
    ...models.map((model) =>
      makeAtlasTable(model, models, datamodel.indexes, dialect, datamodel.enums, {
        schemaName: defaultSchema,
        comment,
      }),
    ),
    ...makeAtlasM2MJoinTables(models, dialect, datamodel.enums, defaultSchema),
    ...makeAtlasSchemas(models, defaultSchema),
  ]
  return `${blocks.join('\n\n')}\n`
}
