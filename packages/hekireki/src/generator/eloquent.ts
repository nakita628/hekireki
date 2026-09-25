import type { DMMF } from '@prisma/generator-helper'

import { eloquentEnum, eloquentModels, eloquentSupportFiles } from '../helper/eloquent.js'
import { makePascalCase } from '../utils/index.js'

export function eloquentModelFiles(
  models: readonly DMMF.Model[],
  namespace: string | string[],
  enums?: readonly DMMF.DatamodelEnum[],
  options: { readonly provider?: string } = {},
) {
  const resolvedNamespace = (
    Array.isArray(namespace) ? namespace.join('\\') : namespace
  ).replaceAll('.', '\\')
  // The file is named after the class, as PSR-4 autoloading looks for it: `user_role` is
  // UserRole.php.
  const modelFiles = models.map((model) => ({
    fileName: `${makePascalCase(model.name)}.php`,
    code: eloquentModels([model], resolvedNamespace, models, enums, options),
  }))
  const enumFiles = (enums ?? []).map((enumDef) => ({
    fileName: `${enumDef.name}.php`,
    code: eloquentEnum(enumDef, resolvedNamespace),
  }))
  // The casts and the query builder the models name, written beside them.
  const supportFiles = eloquentSupportFiles(models, resolvedNamespace)
  return [...modelFiles, ...enumFiles, ...supportFiles].filter(
    (entry) => entry.code.trim().length > 0,
  )
}
