import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { exposedFiles } from '../generator/exposed.js'
import { isKotlinIdentifier } from '../helper/exposed.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

export function exposed(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-Exposed. Please specify output in your generator config.',
      })
    }
    const provider = options.datasources[0]?.activeProvider ?? 'postgresql'
    if (provider !== 'postgresql') {
      return yield* new GeneratorConfigError({
        message: `Unsupported provider for Hekireki-Exposed: ${provider}. Supported providers are postgresql.`,
      })
    }
    const packageName = getString(options.generator.config?.package) ?? 'models'
    if (!packageName.split('.').every(isKotlinIdentifier)) {
      return yield* new GeneratorConfigError({
        message: `package for Hekireki-Exposed must be a Kotlin package such as "com.example.db": ${packageName}`,
      })
    }
    const dao = getString(options.generator.config?.dao) ?? 'true'
    if (dao !== 'true' && dao !== 'false') {
      return yield* new GeneratorConfigError({
        message: `dao for Hekireki-Exposed must be true or false: ${dao}`,
      })
    }
    const files = exposedFiles(options.dmmf.datamodel, {
      package: packageName,
      dao: dao === 'true',
      source: options.datamodel,
    })
    return yield* emitMany(files, options.generator.output.value)
  })
}
