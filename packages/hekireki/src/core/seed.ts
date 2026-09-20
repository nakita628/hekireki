import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emit } from '../emit/index.js'
import { seedSchemaCode } from '../generator/seed.js'
import { GeneratorConfigError } from './errors.js'

/**
 * Hekireki-Seed: writes `schema.ts` into `output`, the schema module hekireki.config.ts imports
 * for `defineConfig(schema, { ... })`.
 */
export function seed(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-Seed. Please specify output in your generator config.',
      })
    }
    const output = options.generator.output.value
    const resolved = path.extname(output)
      ? { dir: path.dirname(output), file: output }
      : { dir: output, file: path.join(output, 'schema.ts') }
    return yield* emit(seedSchemaCode(options.dmmf.datamodel), resolved.dir, resolved.file)
  })
}
