import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emit } from '../emit/index.js'
import { kyselySchema } from '../generator/kysely.js'
import { GeneratorConfigError } from './errors.js'

export function kysely(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-Kysely. Please specify output in your generator config.',
      })
    }
    const output = options.generator.output.value
    const resolved = path.extname(output)
      ? { dir: path.dirname(output), file: output }
      : { dir: output, file: path.join(output, 'types.ts') }
    return yield* emit(kyselySchema(options.dmmf.datamodel), resolved.dir, resolved.file)
  })
}
