import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { ectoSchemaFiles } from '../generator/ecto.js'
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
    const app = options.generator.config?.app ?? 'MyApp'
    const enums = options.dmmf.datamodel.enums
    const files = ectoSchemaFiles(options.dmmf.datamodel.models, app, enums)
    return yield* emitMany(files, outDir)
  })
}
