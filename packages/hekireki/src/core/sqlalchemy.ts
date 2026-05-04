import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitRaw } from '../emit/index.js'
import { generateSingleFile } from '../generator/sqlalchemy.js'

export async function sqlalchemy(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-SQLAlchemy. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const outPath = path.extname(output) ? output : path.join(output, 'models.py')
  const enums = options.dmmf.datamodel.enums
  const indexes = options.dmmf.datamodel.indexes
  const code = generateSingleFile(options.dmmf.datamodel.models, enums, indexes)
  return emitRaw(code, path.dirname(outPath), outPath)
}
