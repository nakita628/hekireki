import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { activeRecordModelFiles } from '../generator/activerecord.js'
import { GeneratorConfigError } from './errors.js'

export function activerecord(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-ActiveRecord. Please specify output in your generator config.',
      })
    }
    const outDir = options.generator.output.value
    const enums = options.dmmf.datamodel.enums
    const files = activeRecordModelFiles(options.dmmf.datamodel.models, enums)
    return yield* emitMany(files, outDir)
  })
}
