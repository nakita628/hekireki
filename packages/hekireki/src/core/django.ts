import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { djangoCode } from '../generator/django.js'
import { findNameConflicts } from '../helper/django.js'
import { GeneratorConfigError } from './errors.js'
import { outputFile, requireOutput } from './output.js'

export function django(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-Django')
    const resolved = outputFile(output, 'models.py')
    const enums = options.dmmf.datamodel.enums
    const indexes = options.dmmf.datamodel.indexes
    const conflicts = findNameConflicts(options.dmmf.datamodel.models, enums)
    if (conflicts.length > 0) {
      return yield* new GeneratorConfigError({
        message: `Hekireki-Django cannot represent this schema:\n${conflicts.map((c) => `  - ${c}`).join('\n')}`,
      })
    }
    const provider = options.datasources[0]?.activeProvider
    const code = djangoCode(options.dmmf.datamodel.models, enums, indexes, provider)
    return yield* emitRaw(code, resolved.dir, resolved.file)
  })
}
