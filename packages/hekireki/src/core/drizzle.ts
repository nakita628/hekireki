import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { fmt } from '../format/index.js'
import { drizzleSchema } from '../helper/drizzle.js'

function parsePrismaProvider(raw: string): 'postgresql' | 'cockroachdb' | 'mysql' | 'sqlite' {
  if (raw === 'postgresql' || raw === 'cockroachdb' || raw === 'mysql' || raw === 'sqlite') {
    return raw
  }
  throw new Error(`Unsupported provider: ${raw}`)
}

export async function drizzle(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-Drizzle. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const resolved = path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, 'schema.ts') }
  const provider = parsePrismaProvider(options.datasources[0]?.activeProvider ?? 'postgresql')

  const code = drizzleSchema(options.dmmf.datamodel, provider, options.dmmf.datamodel.indexes)
  const formatted = await fmt(code)
  await mkdir(resolved.dir, { recursive: true })
  await writeFile(resolved.file, formatted, 'utf-8')
}
