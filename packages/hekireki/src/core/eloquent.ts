import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { eloquentModelFiles } from '../generator/eloquent.js'
import { eloquentProblems } from '../helper/eloquent.js'
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
    const problems = eloquentProblems(options.dmmf.datamodel.models, options.dmmf.datamodel.enums)
    if (problems.length > 0) {
      return yield* new GeneratorConfigError({
        message: `Hekireki-Eloquent cannot write this schema:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      })
    }
    const namespace = options.generator.config?.namespace ?? 'App\\Models'
    const enums = options.dmmf.datamodel.enums
    const files = eloquentModelFiles(options.dmmf.datamodel.models, namespace, enums, {
      provider: options.datasources[0]?.activeProvider,
    })
    return yield* emitMany(files, outDir)
  })
}
