#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { writeSQLAlchemyModelsToFiles } from '../../helper/sqlalchemy.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-SQLAlchemy. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value

  const enums = options.dmmf.datamodel.enums
  const result = await writeSQLAlchemyModelsToFiles(options.dmmf.datamodel.models, output, enums)
  if (!result.ok) {
    throw new Error(`Failed to write SQLAlchemy models: ${result.error}`)
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-SQLAlchemy',
    }
  },
  onGenerate: main,
})
