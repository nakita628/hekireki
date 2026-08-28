import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitRaw } from '../emit/index.js'
import { djangoCode } from '../generator/django.js'
import { findNameConflicts } from '../helper/django.js'

export async function django(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-Django. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const outPath = path.extname(output) ? output : path.join(output, 'models.py')
  const enums = options.dmmf.datamodel.enums
  const indexes = options.dmmf.datamodel.indexes
  const conflicts = findNameConflicts(options.dmmf.datamodel.models, enums)
  if (conflicts.length > 0) {
    return {
      ok: false,
      error: `Hekireki-Django cannot represent this schema:\n${conflicts.map((c) => `  - ${c}`).join('\n')}`,
    } as const
  }
  const code = djangoCode(options.dmmf.datamodel.models, enums, indexes)
  return emitRaw(code, path.dirname(outPath), outPath)
}
