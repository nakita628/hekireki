#!/usr/bin/env node
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../format/index.js'
import { mkdir, writeFile } from '../../fsp/index.js'
import { drizzleSchema } from '../../helper/drizzle.js'
import { getString } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const outDir = options.generator.output?.value ?? './drizzle'
  const file = getString(options.generator.config?.file, 'schema.ts') ?? 'schema.ts'
  const provider = options.datasources[0]?.activeProvider ?? 'postgresql'

  const code = drizzleSchema(options.dmmf.datamodel, provider, options.dmmf.datamodel.indexes)

  const fmtResult = await fmt(code)
  if (!fmtResult.ok) throw new Error(`Format error: ${fmtResult.error}`)

  const mkdirResult = await mkdir(outDir)
  if (!mkdirResult.ok) throw new Error(`Failed to create directory: ${mkdirResult.error}`)

  const writeResult = await writeFile(path.join(outDir, file), fmtResult.value)
  if (!writeResult.ok) throw new Error(`Failed to write file: ${writeResult.error}`)
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './drizzle/',
      prettyName: 'Hekireki-Drizzle',
    }
  },
  onGenerate: main,
})
