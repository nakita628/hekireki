import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { erContent } from '../helper/mermaid-er.js'

export async function mermaidEr(options: GeneratorOptions): Promise<void> {
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

  await mkdir(resolved.dir, { recursive: true })
  await writeFile(resolved.file, content.join('\n'), 'utf-8')
}
