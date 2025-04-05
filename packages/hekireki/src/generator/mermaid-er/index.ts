#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import { OutputFile } from './output'
import { generatorHandler } from '@prisma/generator-helper'
import { generateERContent } from './generator/generate-er-content'

export type Config = {
  output?: string
  file?: string | string[]
}

const DEFAULT_CONFIG: Config = {
  output: './mermaid-er',
  file: 'ER.md',
} as const

// ER diagram header
export const ER_HEADER = ['```mermaid', 'erDiagram'] as const

// ER diagram footer
export const ER_FOOTER = ['```'] as const

// main function
export async function main(options: GeneratorOptions): Promise<void> {
  const config: Config = {
    output: options.generator.output?.value ?? DEFAULT_CONFIG.output,
    file: options.generator.config?.file ?? DEFAULT_CONFIG.file,
  }

  const models = options.dmmf.datamodel.models

  const content = generateERContent(models)

  if (!config.output) {
    throw new Error('output is required')
  }

  OutputFile(content, config)
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
