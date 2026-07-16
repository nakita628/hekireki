import type { DMMF } from '@prisma/generator-helper'

import { activeRecordModels } from '../helper/activerecord.js'
import { makeSnakeCase } from '../utils/index.js'

export function activeRecordModelFiles(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
) {
  return models
    .map((model) => ({
      fileName: `${makeSnakeCase(model.name)}.rb`,
      code: activeRecordModels([model], models, enums),
    }))
    .filter((entry) => entry.code.trim().length > 0)
}
