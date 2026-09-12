import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { efcoreFiles } from '../generator/efcore.js'
import { isCSharpIdentifier, isCSharpTypeName } from '../helper/efcore.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

export function efcore(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-EFCore. Please specify output in your generator config.',
      })
    }
    const provider = options.datasources[0]?.activeProvider ?? 'postgresql'
    if (provider !== 'postgresql') {
      return yield* new GeneratorConfigError({
        message: `Unsupported provider for Hekireki-EFCore: ${provider}. Supported providers are postgresql.`,
      })
    }
    const namespace = getString(options.generator.config?.namespace) ?? 'Models'
    if (!namespace.split('.').every(isCSharpIdentifier)) {
      return yield* new GeneratorConfigError({
        message: `namespace for Hekireki-EFCore must be a C# namespace such as "MyApp.Models": ${namespace}`,
      })
    }
    const context = getString(options.generator.config?.context) ?? 'AppDbContext'
    if (!isCSharpTypeName(context)) {
      return yield* new GeneratorConfigError({
        message: `context for Hekireki-EFCore must be a C# class name such as "AppDbContext": ${context}`,
      })
    }
    const files = efcoreFiles(options.dmmf.datamodel, { namespace, context })
    return yield* emitMany(files, options.generator.output.value)
  })
}
