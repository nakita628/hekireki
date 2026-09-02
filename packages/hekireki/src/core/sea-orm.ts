import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { seaOrmFiles } from '../generator/sea-orm.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

export function seaOrm(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-SeaORM. Please specify output in your generator config.',
      })
    }
    const outDir = options.generator.output.value
    const renameAll = getString(options.generator.config?.renameAll)
    const serde = { renameAll }
    const enums = options.dmmf.datamodel.enums
    const files = seaOrmFiles(options.dmmf.datamodel.models, enums, serde)
    return yield* emitMany(files, outDir)
  })
}
