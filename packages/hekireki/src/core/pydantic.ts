import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { pydanticCode } from '../generator/pydantic.js'
import { getBool } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

export function pydantic(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-Pydantic. Please specify output in your generator config.',
      })
    }
    const output = options.generator.output.value
    const outPath = path.extname(output) ? output : path.join(output, 'models.py')
    const code = pydanticCode(
      options.dmmf.datamodel.models,
      options.dmmf.datamodel.enums,
      getBool(options.generator.config?.comment),
      getBool(options.generator.config?.relation),
    )
    return yield* emitRaw(code, path.dirname(outPath), outPath)
  })
}
