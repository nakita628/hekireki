import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emit } from '../emit/index.js'
import { ajvCode } from '../generator/ajv.js'
import { getBool } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

export function ajv(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-AJV. Please specify output in your generator config.',
      })
    }
    const output = options.generator.output.value
    const resolved = path.extname(output)
      ? { dir: path.dirname(output), file: output }
      : { dir: output, file: path.join(output, 'index.ts') }
    const code = ajvCode(
      options.dmmf,
      getBool(options.generator.config?.type),
      getBool(options.generator.config?.comment),
      getBool(options.generator.config?.relation),
    )
    return yield* emit(code, resolved.dir, resolved.file)
  })
}
