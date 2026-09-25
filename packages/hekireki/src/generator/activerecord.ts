import type { DMMF } from '@prisma/generator-helper'

import { activeRecordModels } from '../helper/activerecord.js'
import { makeSnakeCase } from '../utils/index.js'

/**
 * Rails' own app/models/application_record.rb, so app/models can be generated whole.
 * primary_abstract_class is what `rails new` writes (Rails 7+).
 */
export function applicationRecordFile() {
  return {
    fileName: 'application_record.rb',
    code: `class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class
end
`,
  }
}

/**
 * On SQLite, the type every DateTime column of the models is declared with: it writes the text
 * Prisma Client writes (2030-01-02T03:04:05.678+00:00), not Active Record's
 * (2030-01-02 03:04:05.678000), so the rows of both compare, sort and index alike. A file of its
 * own beside the models, named for the constant it defines, so Zeitwerk loads it from wherever
 * it loads them, whatever `output` is. Nothing when no model has a DateTime column to declare.
 */
export function prismaDateTimeFiles(models: readonly DMMF.Model[], provider?: string) {
  return provider === 'sqlite' &&
    models.some((model) =>
      model.fields.some((f) => f.kind === 'scalar' && f.type === 'DateTime' && !f.isList),
    )
    ? [
        {
          fileName: 'prisma_date_time.rb',
          code: `class PrismaDateTime < ActiveRecord::Type::DateTime
  def serialize(value)
    time = super
    time.respond_to?(:getutc) ? time.getutc.strftime("%Y-%m-%dT%H:%M:%S.%L+00:00") : time
  end
end
`,
        },
      ]
    : []
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
