import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { writeGormFile } from '../helper/gorm.js'
import { getString } from '../utils/index.js'

export async function gorm(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-GORM. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const resolved = path.extname(output) ? output : path.join(output, 'models.go')
  const packageName = getString(options.generator.config.package, 'model')
  const enums = options.dmmf.datamodel.enums
  const indexes = options.dmmf.datamodel.indexes
  await writeGormFile(options.dmmf.datamodel.models, resolved, enums, indexes, packageName)
}
