import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emit } from '../emit/index.js'
import { arktypeCode } from '../generator/arktype.js'
import { getBool } from '../utils/index.js'
import { outputFile, requireOutput } from './output.js'

export function arktype(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-ArkType')
    const resolved = outputFile(output, 'index.ts')
    const code = arktypeCode(
      options.dmmf,
      getBool(options.generator.config?.type),
      getBool(options.generator.config?.relation),
    )
    return yield* emit(code, resolved.dir, resolved.file)
  })
}
