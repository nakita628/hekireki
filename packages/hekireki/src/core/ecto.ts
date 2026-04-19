import type { GeneratorOptions } from '@prisma/generator-helper'

import { writeEctoSchemasToFiles } from '../helper/ecto.js'

export async function ecto(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-Ecto. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const app = options.generator.config?.app ?? 'MyApp'
  const enums = options.dmmf.datamodel.enums
  await writeEctoSchemasToFiles(options.dmmf.datamodel.models, app, output, enums)
}
