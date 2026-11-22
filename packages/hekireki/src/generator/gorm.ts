import type { DMMF } from '@prisma/generator-helper'

import {
  collectImports,
  formatImports,
  generateDateTypes,
  generateModelStruct,
  generateNamingStrategy,
} from '../helper/gorm.js'

export function generateGormModels(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
  packageName = 'model',
  provider?: string,
  foreignKeyNames: ReadonlyMap<string, string> = new Map(),
) {
  const idx = indexes ?? []

  const modelBodies = models.map((model) =>
    generateModelStruct(model, models, enums, idx, provider, foreignKeyNames),
  )

  return [
    `package ${packageName}`,
    ...formatImports(collectImports(models)),
    ...generateNamingStrategy(models),
    '',
    modelBodies.join('\n\n'),
    ...generateDateTypes(models, provider),
    '',
  ].join('\n')
}
