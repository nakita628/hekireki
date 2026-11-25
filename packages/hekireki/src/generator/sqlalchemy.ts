import type { DMMF } from '@prisma/generator-helper'

import {
  collectGlobalImports,
  collectManyToManyTables,
  generateAssociationTable,
  generateBase,
  generateModelBody,
} from '../helper/sqlalchemy.js'
import type { SqlIndex } from '../helper/sqlalchemy.js'

// An index with its condition, if it is partial.
function withWhere(index: DMMF.Index, where: string | undefined): SqlIndex {
  return where === undefined ? index : { ...index, where }
}

export function generateSingleFile(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
  provider = 'postgresql',
  views: ReadonlySet<string> = new Set(),
  partialWhere: (model: DMMF.Model, index: DMMF.Index) => string | undefined = () => undefined,
) {
  // Each partial index (the `partialIndexes` preview feature) with its condition, which DMMF drops.
  const modelByName = new Map(models.map((m) => [m.name, m]))
  const idx = (indexes ?? []).map((index) => {
    const model = modelByName.get(index.model)
    return withWhere(index, model === undefined ? undefined : partialWhere(model, index))
  })
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
