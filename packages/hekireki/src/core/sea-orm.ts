import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import type { SerdeOptions } from '../helper/sea-orm.js'
import { seaOrmFiles } from '../helper/sea-orm.js'
import { getString } from '../utils/index.js'

export async function seaOrm(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-SeaORM. Please specify output in your generator config.',
    )
  }
  const outDir = options.generator.output.value
  const renameAll = getString(options.generator.config?.renameAll)
  const serde: SerdeOptions = { renameAll }
  const enums = options.dmmf.datamodel.enums

  const files = seaOrmFiles(options.dmmf.datamodel.models, enums, serde)
  await mkdir(outDir, { recursive: true })
  await Promise.all(files.map((file) => writeFile(path.join(outDir, file.fileName), file.code)))
}
