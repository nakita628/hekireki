#!/usr/bin/env node
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'

import { writeSQLAlchemyFile } from '../../helper/sqlalchemy.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-SQLAlchemy. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const resolved = path.extname(output) ? output : path.join(output, 'models.py')

  const enums = options.dmmf.datamodel.enums
  const indexes = options.dmmf.datamodel.indexes
  const result = await writeSQLAlchemyFile(options.dmmf.datamodel.models, resolved, enums, indexes)
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
