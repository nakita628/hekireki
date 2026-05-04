import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { emit } from '../emit/index.js'
import { drizzleSchema, parsePrismaProvider } from '../generator/drizzle.js'

export async function drizzle(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-Drizzle. Please specify output in your generator config.',
    } as const
  }
  const providerResult = parsePrismaProvider(options.datasources[0]?.activeProvider ?? 'postgresql')
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
  return emit(code, resolved.dir, resolved.file)
}
