import type { DMMF } from '@prisma/generator-helper'

import {
  collectGlobalImports,
  collectManyToManyTables,
  generateAssociationTable,
  generateBase,
  generateModelBody,
} from '../helper/sqlalchemy.js'

export function generateSingleFile(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
  provider = 'postgresql',
  views: ReadonlySet<string> = new Set(),
) {
  const idx = indexes ?? []
  const m2mTables = collectManyToManyTables(models)

  const importLines = collectGlobalImports(models, enums, idx, m2mTables, provider, views)

  const m2mLines = m2mTables.flatMap((t) => ['', generateAssociationTable(t, provider)])

  const modelBodies = models
    .map((model) => generateModelBody(model, models, enums, idx, m2mTables, provider, views))
    .filter((body) => body !== null)

  return [
    ...importLines,
    '',
    '',
    ...generateBase(models, provider),
    ...m2mLines,
    '',
    '',
    ...modelBodies.join('\n\n').split('\n'),
    '',
  ].join('\n')
}
