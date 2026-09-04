import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { eloquentModelFiles } from '../generator/eloquent.js'
import { GeneratorConfigError } from './errors.js'

export function eloquent(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-Eloquent. Please specify output in your generator config.',
      })
    }
    const outDir = options.generator.output.value
    const namespace = options.generator.config?.namespace ?? 'App\\Models'
    const enums = options.dmmf.datamodel.enums
    const files = eloquentModelFiles(options.dmmf.datamodel.models, namespace, enums)
    return yield* emitMany(files, outDir)
  })
}
