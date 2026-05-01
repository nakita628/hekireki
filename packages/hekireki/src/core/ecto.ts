import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { ectoSchemaFiles } from '../helper/ecto.js'

export async function ecto(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-Ecto. Please specify output in your generator config.',
    )
  }
  const outDir = options.generator.output.value
  const app = options.generator.config?.app ?? 'MyApp'
  const enums = options.dmmf.datamodel.enums

  const files = ectoSchemaFiles(options.dmmf.datamodel.models, app, enums)
  await mkdir(outDir, { recursive: true })
  await Promise.all(files.map((file) => writeFile(path.join(outDir, file.fileName), file.code)))
}
