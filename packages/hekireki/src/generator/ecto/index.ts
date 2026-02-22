#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { writeEctoSchemasToFiles } from '../../helper/ecto.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-Ecto. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const app = options.generator.config?.app ?? 'MyApp'

  const enums = options.dmmf.datamodel.enums
  const result = await writeEctoSchemasToFiles(options.dmmf.datamodel.models, app, output, enums)
  if (!result.ok) {
    throw new Error(`Failed to write Ecto schemas: ${result.error}`)
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-Ecto',
    }
  },
  onGenerate: main,
})
