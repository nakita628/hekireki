import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emit } from '../emit/index.js'
import { drizzleSchema, parsePrismaProvider } from '../generator/drizzle.js'
import { GeneratorConfigError } from './errors.js'

export function drizzle(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-Drizzle. Please specify output in your generator config.',
      })
    }
    const provider = options.datasources[0]?.activeProvider ?? 'postgresql'
    const providerResult = parsePrismaProvider(provider)
    if (!providerResult.ok) {
      return yield* new GeneratorConfigError({
        message: `Unsupported provider for Hekireki-Drizzle: ${provider}. Supported providers are postgresql, cockroachdb, mysql, and sqlite.`,
      })
    }
    const output = options.generator.output.value
    const resolved = path.extname(output)
      ? { dir: path.dirname(output), file: output }
      : { dir: output, file: path.join(output, 'schema.ts') }
    const code = drizzleSchema(
      options.dmmf.datamodel,
      providerResult.value,
      options.dmmf.datamodel.indexes,
    )
    return yield* emit(code, resolved.dir, resolved.file)
  })
}
