import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { generateGormModels } from '../generator/gorm.js'
import { gormProblems } from '../helper/gorm.js'
import { getString } from '../prisma/config.js'
import { partialIndexWhere } from '../prisma/partial-index.js'
import { prismaBlocks, relationMaps, viewNames } from '../prisma/schema-text.js'
import { GeneratorConfigError } from './errors.js'
import { outputFile, requireOutput } from './output.js'

export function gorm(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-GORM')
    const problems = gormProblems(
      options.dmmf.datamodel.models,
      options.datasources[0]?.activeProvider,
      options.dmmf.datamodel.indexes,
      partialIndexWhere(prismaBlocks(options.datamodel), options.datasources[0]?.activeProvider),
    )
    if (problems.length > 0) {
      return yield* new GeneratorConfigError({
        message: `Hekireki-GORM cannot write this schema:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      })
    }
    const resolved = outputFile(output, 'models.go')
    const packageName = getString(options.generator.config['package']) ?? 'model'
    const enums = options.dmmf.datamodel.enums
    const indexes = options.dmmf.datamodel.indexes
    const blocks = prismaBlocks(options.datamodel)
    const code = generateGormModels(
      options.dmmf.datamodel.models,
      enums,
      indexes,
      packageName,
      options.datasources[0]?.activeProvider,
      relationMaps(blocks),
      viewNames(blocks),
      blocks,
    )
    return yield* emitRaw(code, resolved.dir, resolved.file)
  })
}
