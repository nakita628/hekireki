import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { efcoreFiles } from '../generator/efcore.js'
import { isCSharpIdentifier, isCSharpTypeName } from '../helper/efcore.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'
import { requireOutput } from './output.js'

export function efcore(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-EFCore')
    const provider = options.datasources[0]?.activeProvider ?? 'postgresql'
    if (provider !== 'postgresql' && provider !== 'mysql' && provider !== 'sqlite') {
      return yield* new GeneratorConfigError({
        message: `Unsupported provider for Hekireki-EFCore: ${provider}. Supported providers are postgresql, mysql and sqlite.`,
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
    const files = efcoreFiles(options.dmmf.datamodel, { namespace, context, provider })
    return yield* emitMany(files, output)
  })
}
