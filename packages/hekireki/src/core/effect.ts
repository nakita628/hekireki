import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emit } from '../emit/index.js'
import { effectCode } from '../generator/effect.js'
import { getBool } from '../utils/index.js'
import { outputFile, requireOutput } from './output.js'

export function effect(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-Effect')
    const resolved = outputFile(output, 'index.ts')
    const code = effectCode(
      options.dmmf,
      getBool(options.generator.config?.type),
      getBool(options.generator.config?.relation),
    )
    return yield* emit(code, resolved.dir, resolved.file)
  })
}
