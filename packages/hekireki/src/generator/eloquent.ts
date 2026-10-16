import type { DMMF } from '@prisma/generator-helper'

import { eloquentEnum, eloquentModelCodes, eloquentSupportFiles } from '../helper/eloquent.js'
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
  // UserRole.php. The classes are written in one pass, which reads the schema once for them all.
  const codes = eloquentModelCodes(models, resolvedNamespace, models, enums, options)
  const modelFiles = models.map((model, index) => ({
    fileName: `${makePascalCase(model.name)}.php`,
    code: codes[index] ?? '',
  }))
  const enumFiles = (enums ?? []).map((enumDef) => ({
    fileName: `${enumDef.name}.php`,
    code: eloquentEnum(enumDef, resolvedNamespace),
  }))
  // The casts, the trait and the query classes the models name, written beside them.
  const supportFiles = eloquentSupportFiles(models, resolvedNamespace, options.provider)
  return [...modelFiles, ...enumFiles, ...supportFiles].filter(
    (entry) => entry.code.trim().length > 0,
  )
}
