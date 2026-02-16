#!/usr/bin/env node
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { mkdir, writeFile } from '../../fsp/index.js'
import { erContent } from '../../helper/mermaid-er.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-ER. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const content = erContent(options.dmmf.datamodel.models)
  const resolved = path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, 'ER.md') }

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
