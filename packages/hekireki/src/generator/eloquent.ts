import type { DMMF } from '@prisma/generator-helper'

import { eloquentEnum, eloquentModels } from '../helper/eloquent.js'

export function eloquentModelFiles(
  models: readonly DMMF.Model[],
  namespace: string | string[],
  enums?: readonly DMMF.DatamodelEnum[],
) {
  const resolvedNamespace = (Array.isArray(namespace) ? namespace.join('\\') : namespace).replace(
    /\./g,
    '\\',
  )
  const modelFiles = models.map((model) => ({
    fileName: `${model.name}.php`,
    code: eloquentModels([model], resolvedNamespace, models, enums),
  }))
  const enumFiles = (enums ?? []).map((enumDef) => ({
    fileName: `${enumDef.name}.php`,
    code: eloquentEnum(enumDef, resolvedNamespace),
  }))
  return [...modelFiles, ...enumFiles].filter((entry) => entry.code.trim().length > 0)
}
