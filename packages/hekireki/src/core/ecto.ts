import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { ectoSchemaFiles } from '../generator/ecto.js'
import { ectoProblems } from '../helper/ecto.js'
import { relationMaps, relationMode } from '../utils/prisma-schema-text.js'
import { GeneratorConfigError } from './errors.js'

export function ecto(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-Ecto. Please specify output in your generator config.',
      })
    }
    const outDir = options.generator.output.value
    const problems = ectoProblems(options.dmmf.datamodel.models)
    if (problems.length > 0) {
      return yield* new GeneratorConfigError({
        message: `Hekireki-Ecto cannot read this schema:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      })
    }
    const app = options.generator.config?.app ?? 'MyApp'
    const enums = options.dmmf.datamodel.enums
    const files = ectoSchemaFiles(options.dmmf.datamodel.models, app, enums, {
      provider: options.datasources[0]?.activeProvider,
      indexes: options.dmmf.datamodel.indexes,
      // DMMF drops the name `@relation(map: ...)` gives a foreign key, and the relation mode.
      foreignKeyNames: relationMaps(options.datamodel),
      relationMode: relationMode(options.datamodel),
    })
    return yield* emitMany(files, outDir)
  })
}
