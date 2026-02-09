#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { erContent } from '../../helper/mermaid-er.js'
import { mkdir, writeFile } from '../../fsp/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const content = erContent(options.dmmf.datamodel.models)
  const output = options.generator.output?.value ?? './mermaid-er'
  const file = options.generator.config?.file ?? 'ER.md'

  const isOutputFile = output.includes('.')
  const outputDir = isOutputFile ? '.' : output
  const outputFile = isOutputFile ? output : `${output}/${file}`

  const mkdirResult = await mkdir(outputDir)
  if (!mkdirResult.ok) {
    throw new Error(`Failed to create directory: ${mkdirResult.error}`)
  }

  const writeResult = await writeFile(outputFile, content.join('\n'))
  if (!writeResult.ok) {
    throw new Error(`Failed to write file: ${writeResult.error}`)
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './mermaid-er',
      prettyName: 'Hekireki-ER',
    }
  },
  onGenerate: main,
})
