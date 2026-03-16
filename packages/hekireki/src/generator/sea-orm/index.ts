#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import type { SerdeOptions } from '../../helper/sea-orm.js'
import { writeSeaOrmFiles } from '../../helper/sea-orm.js'
import { getString } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-SeaORM. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const renameAll = getString(options.generator.config?.renameAll)

  const serde: SerdeOptions = {
    renameAll,
  }

  const enums = options.dmmf.datamodel.enums
  const result = await writeSeaOrmFiles(options.dmmf.datamodel.models, output, enums, serde)
  if (!result.ok) {
    throw new Error(`Failed to write SeaORM entities: ${result.error}`)
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-SeaORM',
    }
  },
  onGenerate: main,
})
