#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { mkdir, writeFile } from '../../shared/fsp/index.js'
import { dbmlContent } from './generator/dbml-content.js'

const { generatorHandler } = pkg

/**
 * Get string value from config
 */
function getStringValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}

/**
 * Get boolean option from config
 */
function getBoolOption(
  config: Record<string, string | string[] | undefined>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = getStringValue(config[key])
  if (value === undefined) return defaultValue
  return value.toLowerCase() !== 'false'
}

export async function main(options: GeneratorOptions): Promise<void> {
  const { config } = options.generator
  const mapToDbSchema = getBoolOption(config, 'mapToDbSchema', true)
  const includeRelationFields = getBoolOption(config, 'includeRelationFields', true)

  const content = dbmlContent(options.dmmf.datamodel, mapToDbSchema, includeRelationFields)

  const output = options.generator.output?.value ?? './dbml'
  const file = getStringValue(config.file) ?? 'schema.dbml'

  const isOutputFile = output.includes('.')
  const outputDir = isOutputFile ? '.' : output
  const outputFile = isOutputFile ? output : `${output}/${file}`

  const mkdirResult = await mkdir(outputDir)
  if (!mkdirResult.ok) {
    throw new Error(`Failed to create directory: ${mkdirResult.error}`)
  }

  const writeResult = await writeFile(outputFile, content)
  if (!writeResult.ok) {
    throw new Error(`Failed to write file: ${writeResult.error}`)
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
