import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { generateGormModels } from '../helper/gorm.js'
import { getString } from '../utils/index.js'

export async function gorm(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-GORM. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const outPath = path.extname(output) ? output : path.join(output, 'models.go')
  const packageName = getString(options.generator.config.package, 'model')
  const enums = options.dmmf.datamodel.enums
  const indexes = options.dmmf.datamodel.indexes

  const code = generateGormModels(options.dmmf.datamodel.models, enums, indexes, packageName)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, code)
}
