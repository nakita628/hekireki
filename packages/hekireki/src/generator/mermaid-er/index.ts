#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import { erContent } from './generator/er-content.js'
import fsp from 'fs/promises'
import pkg from '@prisma/generator-helper'
const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const content = erContent(options.dmmf.datamodel.models)
  const output = options.generator.output?.value ?? './mermaid-er'
  const file = options.generator.config?.file ?? 'ER.md'
  await fsp.mkdir(output, { recursive: true })
  await fsp.writeFile(`${output}/${file}`, content.join('\n'), { encoding: 'utf-8' })
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
