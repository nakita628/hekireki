#!/usr/bin/env node
import fsp from 'node:fs/promises'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { erContent } from './generator/er-content.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const content = erContent(options.dmmf.datamodel.models)
  const output = options.generator.output?.value ?? './mermaid-er'
  const file = options.generator.config?.file ?? 'ER.md'

  // Handle case where output is a file path (contains extension)
  const isOutputFile = output.includes('.')
  const outputDir = isOutputFile ? '.' : output
  const outputFile = isOutputFile ? output : `${output}/${file}`

  await fsp.mkdir(outputDir, { recursive: true })
  await fsp.writeFile(outputFile, content.join('\n'), { encoding: 'utf-8' })
}

// prisma generator handler
generatorHandler({
  onManifest() {
    return {
      defaultOutput: './mermaid-er',
      prettyName: 'Hekireki-ER',
    }
  },
  onGenerate: main,
})
