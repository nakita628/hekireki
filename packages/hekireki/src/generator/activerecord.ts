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
 * PrismaDateTime, the type a DateTime column Active Record would not store as Prisma Client does
 * is declared with. A file of its own beside the models, named for the constant it defines, so
 * Zeitwerk loads it from wherever it loads them, whatever `output` is. Nothing when no column
 * needs it.
 * - SQLite, every DateTime column: it writes the text Prisma Client writes
 *   (2030-01-02T03:04:05.678+00:00), not Active Record's (2030-01-02 03:04:05.678000), so the
 *   rows of both compare, sort and index alike.
 * - SQL Server, a `@db.DateTime` column (1/300 s): the adapter rounds the milliseconds to that
 *   itself, by an approximation that is not the server's (05.678 is written 05.679, which the
 *   server holds as 05.680, where Prisma's 05.678 is held as 05.677; 05.677 is read back as
 *   05.676). A `@db.SmallDateTime` column (whole minutes): the adapter drops the milliseconds,
 *   so 29.999 goes down to the minute where Prisma's goes up. This keeps milliseconds, as Prisma
 *   does, and leaves the rounding to the server, still sent as the column's type
 *   (`PrismaDateTime.new("smalldatetime")`), so a `where` compares with the column as Prisma's
 *   does.
 */
export function prismaDateTimeFiles(models: readonly DMMF.Model[], provider?: string) {
  const fields = models.flatMap((model) =>
    model.fields.filter((f) => f.kind === 'scalar' && f.type === 'DateTime' && !f.isList),
  )
  if (provider === 'sqlite' && fields.length > 0) {
    return [
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
  }
  if (
    provider === 'sqlserver' &&
    fields.some((f) => ['DateTime', 'SmallDateTime'].includes(f.nativeType?.[0] ?? ''))
  ) {
    return [
      {
        fileName: 'prisma_date_time.rb',
        code: `class PrismaDateTime < ActiveRecord::Type::SQLServer::DateTime2
  attr_reader :sqlserver_type

  def initialize(sqlserver_type = "datetime")
    super(precision: 3)
    @sqlserver_type = sqlserver_type
  end
end
`,
      },
    ]
  }
  return []
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
