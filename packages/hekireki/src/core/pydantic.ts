import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitRaw } from '../emit/index.js'
import { pydanticCode } from '../generator/pydantic.js'
import { getBool } from '../utils/index.js'

export async function pydantic(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-Pydantic. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const outPath = path.extname(output) ? output : path.join(output, 'models.py')
  const code = pydanticCode(
    options.dmmf.datamodel.models,
    options.dmmf.datamodel.enums,
    getBool(options.generator.config?.comment),
    getBool(options.generator.config?.relation),
  )
  return emitRaw(code, path.dirname(outPath), outPath)
}
