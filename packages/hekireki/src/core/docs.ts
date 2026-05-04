import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitRaw } from '../emit/index.js'
import { docsHTML } from '../generator/docs.js'

export async function docs(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-Docs. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const html = docsHTML(options.dmmf)
  return emitRaw(html, output, path.join(output, 'index.html'))
}
