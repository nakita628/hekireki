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
    const providerResult = parsePrismaProvider(
      options.datasources[0]?.activeProvider ?? 'postgresql',
    )
    if (!providerResult.ok) return providerResult
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
