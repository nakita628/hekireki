import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { atlasSchema } from '../generator/atlas.js'
import { getBool, getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

export function atlas(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-Atlas. Please specify output in your generator config.',
      })
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
      return yield* new GeneratorConfigError({
        message: `Unsupported provider for Hekireki-Atlas: ${provider}. Supported providers are postgresql, cockroachdb, mysql, and sqlite.`,
      })
    }
    const output = options.generator.output.value
    const schemaName = getString(options.generator.config?.schemaName)
    const comment = getBool(options.generator.config?.comment)
    const content = atlasSchema(options.dmmf.datamodel, provider, { schemaName, comment })
    const outPath = path.extname(output) ? output : path.join(output, 'schema.hcl')
    return yield* emitRaw(content, path.dirname(outPath), outPath)
  })
}
