import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitMany } from '../emit/index.js'
import { eloquentModelFiles } from '../generator/eloquent.js'

export async function eloquent(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-Eloquent. Please specify output in your generator config.',
    } as const
  }
  const outDir = options.generator.output.value
  const namespace = options.generator.config?.namespace ?? 'App\\Models'
  const enums = options.dmmf.datamodel.enums
  const files = eloquentModelFiles(options.dmmf.datamodel.models, namespace, enums)
  return emitMany(files, outDir)
}
