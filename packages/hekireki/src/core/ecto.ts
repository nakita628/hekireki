import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { ectoSchemaFiles } from '../generator/ecto.js'
import { ectoProblems } from '../helper/ecto.js'
import { prismaBlocks, relationMaps, relationMode } from '../utils/prisma-schema-text.js'
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
    const app = options.generator.config?.app ?? 'MyApp'
    const enums = options.dmmf.datamodel.enums
    // DMMF drops the name `@relation(map: ...)` gives a foreign key, and the relation mode: both
    // are read off the schema's text, parsed into its blocks once.
    const blocks = prismaBlocks(options.datamodel)
    const files = ectoSchemaFiles(options.dmmf.datamodel.models, app, enums, {
      provider: options.datasources[0]?.activeProvider,
      indexes: options.dmmf.datamodel.indexes,
      foreignKeyNames: relationMaps(blocks),
      relationMode: relationMode(blocks),
    })
    return yield* emitMany(files, output)
  })
}
