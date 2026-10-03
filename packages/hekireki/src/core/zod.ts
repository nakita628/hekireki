import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emit } from '../emit/index.js'
import { zodCode } from '../generator/zod.js'
import { getBool, getString } from '../utils/index.js'
import { outputFile, requireOutput } from './output.js'

export function zod(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-Zod')
    const resolved = outputFile(output, 'index.ts')
    const code = zodCode(
      options.dmmf,
      getBool(options.generator.config?.type),
      getBool(options.generator.config?.relation),
      getString(options.generator.config?.zod) ?? 'v4',
    )
    return yield* emit(code, resolved.dir, resolved.file)
  })
}
