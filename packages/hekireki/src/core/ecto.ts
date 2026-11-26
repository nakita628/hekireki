import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { ectoSchemaFiles } from '../generator/ecto.js'
import { ectoProblems } from '../helper/ecto.js'
import { getString } from '../prisma/config.js'
import { prismaBlocks, relationMaps, relationMode } from '../prisma/schema-text.js'
import { GeneratorConfigError } from './errors.js'
import { requireOutput } from './output.js'

export function ecto(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-Ecto')
    const problems = ectoProblems(options.dmmf.datamodel.models)
    if (problems.length > 0) {
      return yield* new GeneratorConfigError({
        message: `Hekireki-Ecto cannot read this schema:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      })
    }
    // Which server a MySQL datasource is, for PrismaJson: the value alone cannot tell.
    const setting = options.generator.config?.['mysqlFlavor']
    const flavor = getString(setting)
    if (
      Array.isArray(setting) ||
      (flavor !== undefined && flavor !== 'mysql' && flavor !== 'mariadb')
    ) {
      return yield* new GeneratorConfigError({
        message: `mysqlFlavor of Hekireki-Ecto is "mysql" or "mariadb", not ${JSON.stringify(setting)}.`,
      })
    }
    const app = options.generator.config?.['app'] ?? 'MyApp'
    const enums = options.dmmf.datamodel.enums
    // DMMF drops the name `@relation(map: ...)` gives a foreign key, and the relation mode: both
    // are read off the schema's text, parsed into its blocks once.
    const blocks = prismaBlocks(options.datamodel)
    const provider = options.datasources[0]?.activeProvider
    const files = ectoSchemaFiles(options.dmmf.datamodel.models, app, enums, {
      ...(provider === undefined ? {} : { provider }),
      indexes: options.dmmf.datamodel.indexes,
      foreignKeyNames: relationMaps(blocks),
      relationMode: relationMode(blocks),
      ...(flavor === undefined ? {} : { mysqlFlavor: flavor }),
    })
    return yield* emitMany(files, output)
  })
}
