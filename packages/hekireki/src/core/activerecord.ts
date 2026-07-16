import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitMany } from '../emit/index.js'
import { activeRecordModelFiles } from '../generator/activerecord.js'

export async function activerecord(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-ActiveRecord. Please specify output in your generator config.',
    } as const
  }
  const outDir = options.generator.output.value
  const enums = options.dmmf.datamodel.enums
  const files = activeRecordModelFiles(options.dmmf.datamodel.models, enums)
  return emitMany(files, outDir)
}
