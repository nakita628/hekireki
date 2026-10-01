import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emit } from '../emit/index.js'
import { drizzleSchema, parsePrismaProvider } from '../generator/drizzle.js'
import { GeneratorConfigError } from './errors.js'
import { outputFile, requireOutput } from './output.js'

export function drizzle(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-Drizzle')
    const provider = options.datasources[0]?.activeProvider ?? 'postgresql'
    const providerResult = parsePrismaProvider(provider)
    if (!providerResult.ok) {
      return yield* new GeneratorConfigError({
        message: `Unsupported provider for Hekireki-Drizzle: ${provider}. Supported providers are postgresql, cockroachdb, mysql, and sqlite.`,
      })
    }
    const resolved = outputFile(output, 'schema.ts')
    const code = drizzleSchema(
      options.dmmf.datamodel,
      providerResult.value,
      options.dmmf.datamodel.indexes,
    )
    return yield* emit(code, resolved.dir, resolved.file)
  })
}
