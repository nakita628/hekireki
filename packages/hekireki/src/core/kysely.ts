import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emit } from '../emit/index.js'
import { kyselySchema } from '../generator/kysely.js'
import { outputFile, requireOutput } from './output.js'

export function kysely(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-Kysely')
    const resolved = outputFile(output, 'types.ts')
    const provider = options.datasources[0]?.activeProvider ?? 'postgresql'
    return yield* emit(kyselySchema(options.dmmf.datamodel, provider), resolved.dir, resolved.file)
  })
}
