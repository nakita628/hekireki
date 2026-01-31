#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { Resvg } from '@resvg/resvg-js'
import { run } from '@softwaretechnik/dbml-renderer'
import { mkdir, writeFile, writeFileBinary } from '../../shared/fsp/index.js'
import { dbmlContent } from '../dbml/generator/dbml-content.js'

const { generatorHandler } = pkg

type DiagramFormat = 'svg' | 'png' | 'dot'

/**
 * Get boolean option from config
 */
function getBoolOption(
  config: Record<string, string>,
  key: string,
  defaultValue: boolean
): boolean {
  const value = config[key]
  if (value === undefined) return defaultValue
  return value.toLowerCase() !== 'false'
}

/**
 * Get file extension for format
 */
function getExtension(format: DiagramFormat): string {
  switch (format) {
    case 'png':
      return 'png'
    case 'dot':
      return 'dot'
    default:
      return 'svg'
  }
}

export async function main(options: GeneratorOptions): Promise<void> {
  const { config } = options.generator
  const mapToDbSchema = getBoolOption(config, 'mapToDbSchema', false)
  const includeRelationFields = getBoolOption(config, 'includeRelationFields', false)

  // Get format option (svg, png, or dot)
  const format = (config.format?.toLowerCase() as DiagramFormat) || 'png'

  // Generate DBML content from DMMF
  const dbml = dbmlContent(options.dmmf.datamodel, mapToDbSchema, includeRelationFields)

  // Determine output path
  const output = options.generator.output?.value ?? './docs'
  const defaultFile = `er-diagram.${getExtension(format)}`
  const file = config.file ?? defaultFile

  const isOutputFile = output.includes('.')
  const outputDir = isOutputFile ? '.' : output
  const outputFile = isOutputFile ? output : `${output}/${file}`

  const mkdirResult = await mkdir(outputDir)
  if (!mkdirResult.ok) {
    throw new Error(`Failed to create directory: ${mkdirResult.error}`)
  }

  // Render based on format
  if (format === 'dot') {
    const dot = run(dbml, 'dot')
    const writeResult = await writeFile(outputFile, dot)
    if (!writeResult.ok) {
      throw new Error(`Failed to write file: ${writeResult.error}`)
    }
  } else {
    // Generate SVG using dbml-renderer
    const svg = run(dbml, 'svg')

    if (format === 'png') {
      // Convert SVG to PNG
      const resvg = new Resvg(svg, {
        font: {
          loadSystemFonts: true,
        },
      })
      const pngData = resvg.render()
      const pngBuffer = pngData.asPng()

      const writeResult = await writeFileBinary(outputFile, pngBuffer)
      if (!writeResult.ok) {
        throw new Error(`Failed to write file: ${writeResult.error}`)
      }
    } else {
      // SVG format
      const writeResult = await writeFile(outputFile, svg)
      if (!writeResult.ok) {
        throw new Error(`Failed to write file: ${writeResult.error}`)
      }
    }
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './docs',
      prettyName: 'Hekireki-SVG',
    }
  },
  onGenerate: main,
})
