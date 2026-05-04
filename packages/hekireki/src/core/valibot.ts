import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { emit } from '../emit/index.js'
import { valibotCode } from '../generator/valibot.js'
import { getBool } from '../utils/index.js'

export async function valibot(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-Valibot. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const resolved = path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, 'index.ts') }
  const code = valibotCode(
    options.dmmf,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
    getBool(options.generator.config?.relation),
  )
  return emit(code, resolved.dir, resolved.file)
}
