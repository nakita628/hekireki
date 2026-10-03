import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { pydanticCode } from '../generator/pydantic.js'
import { getBool } from '../utils/index.js'
import { outputFile, requireOutput } from './output.js'

export function pydantic(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-Pydantic')
    const resolved = outputFile(output, 'models.py')
    const code = pydanticCode(
      options.dmmf.datamodel.models,
      options.dmmf.datamodel.enums,
      getBool(options.generator.config?.relation),
    )
    return yield* emitRaw(code, resolved.dir, resolved.file)
  })
}
