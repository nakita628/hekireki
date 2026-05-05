import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitMany } from '../emit/index.js'
import { ectoSchemaFiles } from '../generator/ecto.js'

export async function ecto(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-Ecto. Please specify output in your generator config.',
    } as const
  }
  const outDir = options.generator.output.value
  const app = options.generator.config?.app ?? 'MyApp'
  const enums = options.dmmf.datamodel.enums
  const files = ectoSchemaFiles(options.dmmf.datamodel.models, app, enums)
  return emitMany(files, outDir)
}
