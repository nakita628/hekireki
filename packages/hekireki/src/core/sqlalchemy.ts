import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { generateSingleFile } from '../generator/sqlalchemy.js'
import { prismaBlocks, viewNames } from '../prisma/schema-text.js'
import { outputFile, requireOutput } from './output.js'

export function sqlalchemy(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-SQLAlchemy')
    const resolved = outputFile(output, 'models.py')
    const enums = options.dmmf.datamodel.enums
    const indexes = options.dmmf.datamodel.indexes
    const code = generateSingleFile(
      options.dmmf.datamodel.models,
      enums,
      indexes,
      options.datasources[0]?.activeProvider,
      viewNames(prismaBlocks(options.datamodel)),
    )
    return yield* emitRaw(code, resolved.dir, resolved.file)
  })
}
