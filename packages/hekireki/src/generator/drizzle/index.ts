#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../format/index.js'
import { mkdir, writeFile } from '../../fsp/index.js'
import { drizzleSchema } from '../../helper/drizzle.js'
import { requireOutput, resolveOutput } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const output = requireOutput(options.generator.output?.value, 'Hekireki-Drizzle', options.generator.isCustomOutput)
  const resolved = resolveOutput(output, 'schema.ts')
  const provider = options.datasources[0]?.activeProvider ?? 'postgresql'

  const code = drizzleSchema(options.dmmf.datamodel, provider, options.dmmf.datamodel.indexes)

  const fmtResult = await fmt(code)
  if (!fmtResult.ok) throw new Error(`Format error: ${fmtResult.error}`)

  const mkdirResult = await mkdir(resolved.dir)
  if (!mkdirResult.ok) throw new Error(`Failed to create directory: ${mkdirResult.error}`)

  const writeResult = await writeFile(resolved.file, fmtResult.value)
  if (!writeResult.ok) throw new Error(`Failed to write file: ${writeResult.error}`)
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-Drizzle',
    }
  },
  onGenerate: main,
})
