import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitRaw } from '../emit/index.js'
import { erContent } from '../generator/mermaid-er.js'

export async function mermaidEr(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error: 'output is required for Hekireki-ER. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const content = erContent(options.dmmf.datamodel.models)
  const resolved = path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, 'ER.md') }
  return emitRaw(content.join('\n'), resolved.dir, resolved.file)
}
