import type { DMMF } from '@prisma/generator-helper'

import {
  entityFile,
  enumFile,
  joinTableFile,
  planExposed,
  schemaFile,
  supportFile,
  tableFile,
} from '../helper/exposed.js'

export function exposedFiles(
  datamodel: {
    readonly models: readonly DMMF.Model[]
    readonly enums: readonly DMMF.DatamodelEnum[]
    readonly indexes?: readonly DMMF.Index[]
  },
  options: {
    readonly package: string
    readonly dao: boolean
    readonly source?: string
  },
) {
  const plan = planExposed(datamodel, options)
  const support = supportFile(plan)
  return [
    ...plan.models.map((model) => tableFile(plan, model)),
    ...plan.models
      .filter((model) => plan.names.entities.has(model.name))
      .map((model) => entityFile(plan, model)),
    ...plan.manyToMany.map((m2m) => joinTableFile(plan, m2m)),
    ...datamodel.enums.map((e) => enumFile(plan, e)),
    ...(support ? [support] : []),
    schemaFile(plan),
  ]
}
