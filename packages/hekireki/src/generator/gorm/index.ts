#!/usr/bin/env node
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'

import { writeGormFile } from '../../helper/gorm.js'
import { getString } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
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
  const result = await writeGormFile(
    options.dmmf.datamodel.models,
    resolved,
    enums,
    indexes,
    packageName,
  )
  if (!result.ok) {
    throw new Error(`Failed to write GORM models: ${result.error}`)
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-GORM',
    }
  },
  onGenerate: main,
})
