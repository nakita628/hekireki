import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitRaw } from '../emit/index.js'
import { generateGormModels } from '../generator/gorm.js'
import { getString } from '../utils/index.js'

export async function gorm(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-GORM. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const outPath = path.extname(output) ? output : path.join(output, 'models.go')
  const packageName = getString(options.generator.config.package, 'model')
  const enums = options.dmmf.datamodel.enums
  const indexes = options.dmmf.datamodel.indexes
  const code = generateGormModels(options.dmmf.datamodel.models, enums, indexes, packageName)
  return emitRaw(code, path.dirname(outPath), outPath)
}
