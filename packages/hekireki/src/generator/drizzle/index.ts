#!/usr/bin/env node
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../format/index.js'
import { mkdir, writeFile } from '../../fsp/index.js'
import { drizzleSchema } from '../../helper/drizzle.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  if (!options.generator.isCustomOutput || !options.generator.output?.value) {
    throw new Error(
      'output is required for Hekireki-Drizzle. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const resolved = path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, 'schema.ts') }
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
