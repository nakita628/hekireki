import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { atlasSchema } from '../generator/atlas.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'
import { outputFile, requireOutput } from './output.js'

export function atlas(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-Atlas')
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
    const schemaName = getString(options.generator.config?.schemaName)
    const content = atlasSchema(options.dmmf.datamodel, provider, { schemaName })
    const resolved = outputFile(output, 'schema.hcl')
    return yield* emitRaw(content, resolved.dir, resolved.file)
  })
}
