import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { generateSingleFile } from '../helper/sqlalchemy.js'

export async function sqlalchemy(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-SQLAlchemy. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const outPath = path.extname(output) ? output : path.join(output, 'models.py')
  const enums = options.dmmf.datamodel.enums
  const indexes = options.dmmf.datamodel.indexes

  const code = generateSingleFile(options.dmmf.datamodel.models, enums, indexes)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, code)
}
