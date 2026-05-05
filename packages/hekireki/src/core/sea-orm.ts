import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitMany } from '../emit/index.js'
import { type SerdeOptions, seaOrmFiles } from '../generator/sea-orm.js'
import { getString } from '../utils/index.js'

export async function seaOrm(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-SeaORM. Please specify output in your generator config.',
    } as const
  }
  const outDir = options.generator.output.value
  const renameAll = getString(options.generator.config?.renameAll)
  const serde: SerdeOptions = { renameAll }
  const enums = options.dmmf.datamodel.enums
  const files = seaOrmFiles(options.dmmf.datamodel.models, enums, serde)
  return emitMany(files, outDir)
}
