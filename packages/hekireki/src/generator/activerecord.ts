import type { DMMF } from '@prisma/generator-helper'

import { activeRecordModels } from '../helper/activerecord.js'
import { makeSnakeCase } from '../utils/index.js'

// Rails' own app/models/application_record.rb, so app/models can be generated
// whole. primary_abstract_class is what `rails new` writes (Rails 7+).
export const APPLICATION_RECORD_FILE = {
  fileName: 'application_record.rb',
  code: `class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class
end
`,
}

export function activeRecordModelFiles(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
) {
  return models
    .map((model) => ({
      fileName: `${makeSnakeCase(model.name)}.rb`,
      code: `${activeRecordModels([model], models, enums)}\n`,
    }))
    .filter((entry) => entry.code.trim().length > 0)
}
