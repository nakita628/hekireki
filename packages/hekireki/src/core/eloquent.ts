import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { eloquentModelFiles } from '../generator/eloquent.js'
import { eloquentProblems } from '../helper/eloquent.js'
import { GeneratorConfigError } from './errors.js'
import { requireOutput } from './output.js'

export function eloquent(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-Eloquent')
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
    return yield* emitMany(files, output)
  })
}
