import type { DMMF } from '@prisma/generator-helper'

import { contextFile, entityFile, enumFile, planEfCore } from '../helper/efcore.js'

export function efcoreFiles(
  datamodel: {
    readonly models: readonly DMMF.Model[]
    readonly enums: readonly DMMF.DatamodelEnum[]
    readonly indexes?: readonly DMMF.Index[]
  },
  options: { readonly namespace: string; readonly context: string },
) {
  const plan = planEfCore(datamodel, options)
  return [
    ...datamodel.models.map((model) => entityFile(plan, model)),
    ...datamodel.enums.map((e) => enumFile(plan, e)),
    contextFile(plan),
  ]
}
