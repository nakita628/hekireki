import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitRaw } from '../emit/index.js'
import { transformDMMF } from './docs/generator/transformDMMF.js'
import { generateHTML } from './docs/printer/index.js'

export async function docs(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-Docs. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const dmmf = transformDMMF(options.dmmf)
  const html = generateHTML(dmmf)
  return emitRaw(html, output, path.join(output, 'index.html'))
}
