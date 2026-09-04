import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { djangoCode } from '../generator/django.js'
import { findNameConflicts } from '../helper/django.js'
import { GeneratorConfigError } from './errors.js'

export function django(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-Django. Please specify output in your generator config.',
      })
    }
    const output = options.generator.output.value
    const outPath = path.extname(output) ? output : path.join(output, 'models.py')
    const enums = options.dmmf.datamodel.enums
    const indexes = options.dmmf.datamodel.indexes
    const conflicts = findNameConflicts(options.dmmf.datamodel.models, enums)
    if (conflicts.length > 0) {
      return yield* new GeneratorConfigError({
        message: `Hekireki-Django cannot represent this schema:\n${conflicts.map((c) => `  - ${c}`).join('\n')}`,
      })
    }
    const code = djangoCode(options.dmmf.datamodel.models, enums, indexes)
    return yield* emitRaw(code, path.dirname(outPath), outPath)
  })
}
