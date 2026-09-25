import type { DMMF } from '@prisma/generator-helper'

import { activeRecordModels } from '../helper/activerecord.js'
import { makeSnakeCase } from '../utils/index.js'

/**
 * Rails' own app/models/application_record.rb, so app/models can be generated whole.
 * primary_abstract_class is what `rails new` writes (Rails 7+). On SQLite it also holds
 * PrismaDateTime, the type every DateTime column of the models is declared with: it writes the
 * text Prisma Client writes (2030-01-02T03:04:05.678+00:00), not Active Record's
 * (2030-01-02 03:04:05.678000), so the rows of both compare, sort and index alike.
 */
export function applicationRecordFile(provider?: string) {
  return {
    fileName: 'application_record.rb',
    code:
      provider === 'sqlite'
        ? `class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class

  class PrismaDateTime < ActiveRecord::Type::DateTime
    def serialize(value)
      time = super
      time.respond_to?(:getutc) ? time.getutc.strftime("%Y-%m-%dT%H:%M:%S.%L+00:00") : time
    end
  end
end
`
        : `class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class
end
`,
  }
}

export function activeRecordModelFiles(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  provider?: string,
) {
  return models
    .map((model) => ({
      fileName: `${makeSnakeCase(model.name)}.rb`,
      code: `${activeRecordModels([model], models, enums, provider)}\n`,
    }))
    .filter((entry) => entry.code.trim().length > 0)
}
