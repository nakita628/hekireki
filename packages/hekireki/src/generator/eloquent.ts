import type { DMMF } from '@prisma/generator-helper'

import { eloquentBytesCast, eloquentEnum, eloquentModels } from '../helper/eloquent.js'

export function eloquentModelFiles(
  models: readonly DMMF.Model[],
  namespace: string | string[],
  enums?: readonly DMMF.DatamodelEnum[],
  options: { readonly provider?: string } = {},
) {
  const resolvedNamespace = (
    Array.isArray(namespace) ? namespace.join('\\') : namespace
  ).replaceAll('.', '\\')
  const modelFiles = models.map((model) => ({
    fileName: `${model.name}.php`,
    code: eloquentModels([model], resolvedNamespace, models, enums, options),
  }))
  const enumFiles = (enums ?? []).map((enumDef) => ({
    fileName: `${enumDef.name}.php`,
    code: eloquentEnum(enumDef, resolvedNamespace),
  }))
  // The cast the Bytes columns name, written beside the models that use it.
  const castFiles = models.some((model) =>
    model.fields.some((f) => f.type === 'Bytes' && !f.isList),
  )
    ? [{ fileName: 'AsBytes.php', code: eloquentBytesCast(resolvedNamespace) }]
    : []
  return [...modelFiles, ...enumFiles, ...castFiles].filter((entry) => entry.code.trim().length > 0)
}
