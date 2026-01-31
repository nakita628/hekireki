#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { writeEctoSchemasToFiles } from './generator/ecto.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const output = options.generator.output?.value ?? './ecto'
  const app = options.generator.config?.app ?? 'MyApp'

  const result = await writeEctoSchemasToFiles(options.dmmf.datamodel.models, app, output)
  if (!result.ok) {
    throw new Error(`Failed to write Ecto schemas: ${result.error}`)
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './ecto/',
      prettyName: 'Hekireki-Ecto',
    }
  },
  onGenerate: main,
})
