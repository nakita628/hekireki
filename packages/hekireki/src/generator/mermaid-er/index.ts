#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import { output} from './output/index.js'
import { generatorHandler } from '@prisma/generator-helper'
import { erContent } from './generator/er-content.js'


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

  const content = erContent(models)

  if (!config.output) {
    throw new Error('output is required')
  }

  output(content, config)
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
