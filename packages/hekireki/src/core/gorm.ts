import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { generateGormModels } from '../generator/gorm.js'
import { gormProblems } from '../helper/gorm.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'
import { outputFile, requireOutput } from './output.js'

export function gorm(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-GORM')
    const problems = gormProblems(options.dmmf.datamodel.models)
    if (problems.length > 0) {
      return yield* new GeneratorConfigError({
        message: `Hekireki-GORM cannot write this schema:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      })
    }
    const resolved = outputFile(output, 'models.go')
    const packageName = getString(options.generator.config.package) ?? 'model'
    const enums = options.dmmf.datamodel.enums
    const indexes = options.dmmf.datamodel.indexes
    const code = generateGormModels(
      options.dmmf.datamodel.models,
      enums,
      indexes,
      packageName,
      options.datasources[0]?.activeProvider,
    )
    return yield* emitRaw(code, resolved.dir, resolved.file)
  })
}
