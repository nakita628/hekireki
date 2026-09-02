import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { generateSingleFile } from '../generator/sqlalchemy.js'
import { GeneratorConfigError } from './errors.js'

export function sqlalchemy(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-SQLAlchemy. Please specify output in your generator config.',
      })
    }
    const output = options.generator.output.value
    const outPath = path.extname(output) ? output : path.join(output, 'models.py')
    const enums = options.dmmf.datamodel.enums
    const indexes = options.dmmf.datamodel.indexes
    const code = generateSingleFile(options.dmmf.datamodel.models, enums, indexes)
    return yield* emitRaw(code, path.dirname(outPath), outPath)
  })
}
