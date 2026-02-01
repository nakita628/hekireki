#!/usr/bin/env node
/**
 * Hekireki DBML Generator
 *
 * Generates DBML schema and ER diagram PNG from Prisma schema.
 *
 * @module generator/dbml
 */
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { Resvg } from '@resvg/resvg-js'
import { run } from '@softwaretechnik/dbml-renderer'
import { mkdir, writeFile, writeFileBinary } from '../../shared/fsp/index.js'
import { dbmlContent } from './generator/dbml-content.js'

const { generatorHandler } = pkg

/**
 * Get string value from config
 */
const getStringValue = (value: string | string[] | undefined): string | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value[0] : value

/**
 * Get boolean option from config
 */
const getBoolOption = (
  config: Record<string, string | string[] | undefined>,
  key: string,
  defaultValue: boolean,
): boolean => {
  const value = getStringValue(config[key])
  return value === undefined ? defaultValue : value.toLowerCase() !== 'false'
}

/**
 * Generate DBML file
 */
const generateDbml = async (
  outputDir: string,
  content: string,
  fileName: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> => {
  const outputFile = `${outputDir}/${fileName}`
  const writeResult = await writeFile(outputFile, content)

  if (!writeResult.ok) {
    return { ok: false, error: `Failed to write DBML: ${writeResult.error}` }
  }

  return { ok: true }
}

/**
 * Generate PNG from DBML
 */
const generatePng = async (
  outputDir: string,
  dbml: string,
  fileName: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> => {
  const svg = run(dbml, 'svg')
  const resvg = new Resvg(svg, {
    font: {
      loadSystemFonts: true,
    },
  })
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()

  const outputFile = `${outputDir}/${fileName}`
  const writeResult = await writeFileBinary(outputFile, pngBuffer)

  if (!writeResult.ok) {
    return { ok: false, error: `Failed to write PNG: ${writeResult.error}` }
  }

  return { ok: true }
}

/**
 * Main generator function
 */
export const main = async (options: GeneratorOptions): Promise<void> => {
  const { config } = options.generator
  const mapToDbSchema = getBoolOption(config, 'mapToDbSchema', true)
  const includeRelationFields = getBoolOption(config, 'includeRelationFields', true)

  const content = dbmlContent(options.dmmf.datamodel, mapToDbSchema, includeRelationFields)

  const output = options.generator.output?.value ?? './dbml'
  const dbmlFile = getStringValue(config.file) ?? 'schema.dbml'
  const pngFile = getStringValue(config.pngFile) ?? 'er-diagram.png'

  const mkdirResult = await mkdir(output)
  if (!mkdirResult.ok) {
    throw new Error(`❌ Failed to create directory: ${mkdirResult.error}`)
  }

  const dbmlResult = await generateDbml(output, content, dbmlFile)
  if (!dbmlResult.ok) {
    throw new Error(`❌ ${dbmlResult.error}`)
  }

  const pngResult = await generatePng(output, content, pngFile)
  if (!pngResult.ok) {
    throw new Error(`❌ ${pngResult.error}`)
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
