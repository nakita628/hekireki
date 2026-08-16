import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitRaw } from '../emit/index.js'
import { atlasSchema } from '../generator/atlas.js'
import { getBool, getString } from '../utils/index.js'

export async function atlas(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-Atlas. Please specify output in your generator config.',
    } as const
  }
  const provider = options.datasources[0]?.activeProvider ?? 'postgresql'
  if (
    !(
      provider === 'postgresql' ||
      provider === 'cockroachdb' ||
      provider === 'mysql' ||
      provider === 'sqlite'
    )
  ) {
    return {
      ok: false,
      error: `Unsupported provider for Hekireki-Atlas: ${provider}. Supported providers are postgresql, cockroachdb, mysql, and sqlite.`,
    } as const
  }
  const output = options.generator.output.value
  const schemaName = getString(options.generator.config?.schemaName)
  const comment = getBool(options.generator.config?.comment)
  const content = atlasSchema(options.dmmf.datamodel, provider, { schemaName, comment })
  const outPath = path.extname(output) ? output : path.join(output, 'schema.hcl')
  return emitRaw(content, path.dirname(outPath), outPath)
}
