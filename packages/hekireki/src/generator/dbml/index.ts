#!/usr/bin/env node
import { basename, dirname } from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { mkdir, writeFile } from '../../fsp/index.js'
import { dbmlContent, generateDbmlFile, generatePng, generatePngFile } from '../../helper/dbml.js'
import { getString, requireOutput, resolveOutput } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const { config } = options.generator
  const mapToDbSchema = getString(config?.mapToDbSchema) !== 'false'

  const content = dbmlContent(options.dmmf.datamodel, mapToDbSchema)

  const output = requireOutput(options.generator.output?.value, 'Hekireki-DBML', options.generator.isCustomOutput)

  if (output.endsWith('.png') || output.endsWith('.dbml')) {
    const dir = dirname(output)
    const mkdirResult = await mkdir(dir)
    if (!mkdirResult.ok) {
      throw new Error(`Failed to create directory: ${mkdirResult.error}`)
    }
    if (output.endsWith('.png')) {
      const pngResult = await generatePngFile(output, content)
      if (!pngResult.ok) throw new Error(pngResult.error)
    } else {
      const dbmlResult = await writeFile(output, content)
      if (!dbmlResult.ok) throw new Error(`Failed to write DBML: ${dbmlResult.error}`)
    }
  } else {
    const resolved = resolveOutput(output, 'schema.dbml')
    const mkdirResult = await mkdir(resolved.dir)
    if (!mkdirResult.ok) {
      throw new Error(`Failed to create directory: ${mkdirResult.error}`)
    }
    const fileName = basename(resolved.file)
    if (fileName.endsWith('.png')) {
      const pngResult = await generatePng(resolved.dir, content, fileName)
      if (!pngResult.ok) throw new Error(pngResult.error)
    } else {
      const dbmlResult = await generateDbmlFile(resolved.dir, content, fileName)
      if (!dbmlResult.ok) throw new Error(dbmlResult.error)
    }
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-DBML',
    }
  },
  onGenerate: main,
})
