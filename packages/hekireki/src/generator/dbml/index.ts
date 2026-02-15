#!/usr/bin/env node
import { dirname } from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { mkdir } from '../../fsp/index.js'
import { writeFile } from '../../fsp/index.js'
import { dbmlContent, generateDbmlFile, generatePng, generatePngFile } from '../../helper/dbml.js'
import { getString } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const { config } = options.generator
  const mapToDbSchema = getString(config?.mapToDbSchema) !== 'false'
  const includeRelationFields = getString(config?.includeRelationFields) !== 'false'

  const content = dbmlContent(options.dmmf.datamodel, mapToDbSchema, includeRelationFields)

  const output = options.generator.output?.value ?? './dbml'

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
    const file = getString(config?.file, 'schema.dbml') ?? 'schema.dbml'
    const mkdirResult = await mkdir(output)
    if (!mkdirResult.ok) {
      throw new Error(`Failed to create directory: ${mkdirResult.error}`)
    }
    if (file.endsWith('.png')) {
      const pngResult = await generatePng(output, content, file)
      if (!pngResult.ok) throw new Error(pngResult.error)
    } else {
      const dbmlResult = await generateDbmlFile(output, content, file)
      if (!dbmlResult.ok) throw new Error(dbmlResult.error)
    }
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './dbml',
      prettyName: 'Hekireki-DBML',
    }
  },
  onGenerate: main,
})
