#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import { output } from './output/index.js'
import { erContent } from './generator/er-content.js'
import pkg from '@prisma/generator-helper'
const { generatorHandler } = pkg

// main function
export async function main(options: GeneratorOptions): Promise<void> {
  // console.log('---')
  // console.log(JSON.stringify(options.dmmf.datamodel.models[0].fields, null, 2))

  // console.log('---')
  output(
    erContent(options.dmmf.datamodel.models),
    options.generator.output?.value ?? './mermaid-er',
    options.generator.config?.file ?? 'ER.md',
  )
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
