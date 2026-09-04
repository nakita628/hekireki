import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { generateGormModels } from '../generator/gorm.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

export function gorm(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-GORM. Please specify output in your generator config.',
      })
    }
    const output = options.generator.output.value
    const outPath = path.extname(output) ? output : path.join(output, 'models.go')
    const packageName = getString(options.generator.config.package) ?? 'model'
    const enums = options.dmmf.datamodel.enums
    const indexes = options.dmmf.datamodel.indexes
    const code = generateGormModels(options.dmmf.datamodel.models, enums, indexes, packageName)
    return yield* emitRaw(code, path.dirname(outPath), outPath)
  })
}
