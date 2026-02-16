#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { mkdir, writeFile } from '../../fsp/index.js'
import { erContent } from '../../helper/mermaid-er.js'
import { requireOutput, resolveOutput } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const content = erContent(options.dmmf.datamodel.models)
  const output = requireOutput(options.generator.output?.value, 'Hekireki-ER', options.generator.isCustomOutput)
  const resolved = resolveOutput(output, 'ER.md')

  const mkdirResult = await mkdir(resolved.dir)
  if (!mkdirResult.ok) {
    throw new Error(`Failed to create directory: ${mkdirResult.error}`)
  }

  const writeResult = await writeFile(resolved.file, content.join('\n'))
  if (!writeResult.ok) {
    throw new Error(`Failed to write file: ${writeResult.error}`)
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-ER',
    }
  },
  onGenerate: main,
})
