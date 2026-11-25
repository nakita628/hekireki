import type { DMMF } from '@prisma/generator-helper'

import {
  collectImports,
  formatImports,
  generateBitBoolType,
  generateDateTypes,
  generateModelStruct,
  generateNamingStrategy,
  generateScalarListType,
} from '../helper/gorm.js'
import { partialIndexWhere, withPlainUniques } from '../prisma/partial-index.js'
import type { PrismaBlock } from '../prisma/schema-text.js'

export function generateGormModels(
  schemaModels: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
  packageName = 'model',
  provider?: string,
  foreignKeyNames: ReadonlyMap<string, string> = new Map(),
  views: ReadonlySet<string> = new Set(),
  // The schema's text, read into its blocks: it carries the `where` of a partial index, which DMMF
  // drops.
  blocks: readonly PrismaBlock[] = [],
) {
  const idx = indexes ?? []
  const indexWhere = partialIndexWhere(blocks, provider)
  const models = withPlainUniques(schemaModels, idx, indexWhere)

  const modelBodies = models.map((model) =>
    generateModelStruct(model, models, enums, idx, provider, foreignKeyNames, views, indexWhere),
  )

  return [
    `package ${packageName}`,
    ...formatImports(collectImports(models, provider)),
    ...generateNamingStrategy(models),
    '',
    modelBodies.join('\n\n'),
    ...generateDateTypes(models, provider),
    ...generateScalarListType(models, provider),
    ...generateBitBoolType(models, provider),
    '',
  ].join('\n')
}
