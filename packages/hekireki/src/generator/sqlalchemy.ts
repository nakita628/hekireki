import type { DMMF } from '@prisma/generator-helper'

import {
  collectGlobalImports,
  collectManyToManyTables,
  generateAssociationTable,
  generateModelBody,
} from '../helper/sqlalchemy.js'

export function generateSingleFile(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
) {
  const idx = indexes ?? []
  const m2mTables = collectManyToManyTables(models)

  const importLines = collectGlobalImports(models, enums, idx, m2mTables)

  const m2mLines =
    m2mTables.length > 0
      ? m2mTables.flatMap((t, i) =>
          i === 0 ? ['', generateAssociationTable(t)] : ['', generateAssociationTable(t)],
        )
      : []

  const modelBodies = models
    .map((model) => generateModelBody(model, models, enums, idx, m2mTables))
    .filter((body): body is string => body !== null)

  return [
    ...importLines,
    '',
    '',
    'class Base(DeclarativeBase):',
    '    pass',
    ...m2mLines,
    '',
    '',
    ...modelBodies.join('\n\n').split('\n'),
    '',
  ].join('\n')
}

export function sqlalchemySchemas(
  models: readonly DMMF.Model[],
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
) {
  return generateSingleFile(allModels ?? models, enums, indexes)
}
