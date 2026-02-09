#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { dbmlContent, generateDbmlFile, generatePng } from '../../helper/dbml.js'
import { mkdir } from '../../fsp/index.js'
import { getString } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const { config } = options.generator
  const mapToDbSchema = getString(config?.mapToDbSchema) !== 'false'
  const includeRelationFields = getString(config?.includeRelationFields) !== 'false'

  const content = dbmlContent(options.dmmf.datamodel, mapToDbSchema, includeRelationFields)

  const output = options.generator.output?.value ?? './dbml'
  const dbmlFile = getString(config?.file, 'schema.dbml') ?? 'schema.dbml'
  const pngFile = getString(config?.pngFile, 'er-diagram.png') ?? 'er-diagram.png'

  const mkdirResult = await mkdir(output)
  if (!mkdirResult.ok) {
    throw new Error(`Failed to create directory: ${mkdirResult.error}`)
  }

  const dbmlResult = await generateDbmlFile(output, content, dbmlFile)
  if (!dbmlResult.ok) {
    throw new Error(dbmlResult.error)
  }

  const pngResult = await generatePng(output, content, pngFile)
  if (!pngResult.ok) {
    throw new Error(pngResult.error)
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
