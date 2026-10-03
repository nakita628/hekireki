import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emit } from '../emit/index.js'
import { seedSchemaCode } from '../generator/seed.js'
import { outputFile, requireOutput } from './output.js'

/**
 * Hekireki-Seed: writes `schema.ts` into `output`, the schema module hekireki.config.ts imports
 * for `defineConfig(schema, { ... })`.
 */
export function seed(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-Seed')
    const resolved = outputFile(output, 'schema.ts')
    return yield* emit(seedSchemaCode(options.dmmf.datamodel), resolved.dir, resolved.file)
  })
}
