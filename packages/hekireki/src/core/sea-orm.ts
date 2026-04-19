import type { GeneratorOptions } from '@prisma/generator-helper'

import type { SerdeOptions } from '../helper/sea-orm.js'
import { writeSeaOrmFiles } from '../helper/sea-orm.js'
import { getString } from '../utils/index.js'

export async function seaOrm(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-SeaORM. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const renameAll = getString(options.generator.config?.renameAll)
  const serde: SerdeOptions = { renameAll }
  const enums = options.dmmf.datamodel.enums
  await writeSeaOrmFiles(options.dmmf.datamodel.models, output, enums, serde)
}
