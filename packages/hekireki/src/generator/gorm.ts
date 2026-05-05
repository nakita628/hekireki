import type { DMMF } from '@prisma/generator-helper'

import { collectImports, formatImports, generateModelStruct } from '../helper/gorm.js'

export function generateGormModels(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
  packageName = 'model',
) {
  const idx = indexes ?? []

  const modelBodies = models
    .map((model) => generateModelStruct(model, models, enums, idx))
    .filter((body): body is string => body !== null)

  return [
    `package ${packageName}`,
    ...formatImports(collectImports(models)),
    '',
    modelBodies.join('\n\n'),
    '',
  ].join('\n')
}
