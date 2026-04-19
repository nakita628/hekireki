import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { writeSQLAlchemyFile } from '../helper/sqlalchemy.js'

export async function sqlalchemy(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-SQLAlchemy. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const resolved = path.extname(output) ? output : path.join(output, 'models.py')
  const enums = options.dmmf.datamodel.enums
  const indexes = options.dmmf.datamodel.indexes
  await writeSQLAlchemyFile(options.dmmf.datamodel.models, resolved, enums, indexes)
}
