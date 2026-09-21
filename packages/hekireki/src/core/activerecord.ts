import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { APPLICATION_RECORD_FILE, activeRecordModelFiles } from '../generator/activerecord.js'
import { activeRecordLocaleFiles, activeRecordProblems } from '../helper/activerecord.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

export function activerecord(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-ActiveRecord. Please specify output in your generator config.',
      })
    }
    const outDir = options.generator.output.value
    const problems = activeRecordProblems(options.dmmf.datamodel.models)
    if (problems.length > 0) {
      return yield* new GeneratorConfigError({
        message: `Hekireki-ActiveRecord cannot read this schema:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      })
    }
    const enums = options.dmmf.datamodel.enums
    // The `///` documentation stays in the schema: a model carries no
    // comment, so there is no `comment` option to read.
    const files = activeRecordModelFiles(options.dmmf.datamodel.models, enums)
    // Written into app/models itself, so the directory can be generated whole;
    // anywhere else (a subdirectory Zeitwerk reads as a namespace) it would
    // define ApplicationRecord under the wrong constant.
    const withBase =
      path.basename(outDir) === 'models' ? [APPLICATION_RECORD_FILE, ...files] : files
    // Translated `@ar.` messages and names go to config/locales as
    // activerecord.<locale>.yml: `locales` names the directory, and from
    // app/models it is the application's own.
    const localeFiles = activeRecordLocaleFiles(options.dmmf.datamodel.models)
    if (localeFiles.length > 0) {
      const locales = getString(options.generator.config?.locales)
      const localesDir =
        locales !== undefined && locales !== ''
          ? path.resolve(outDir, locales)
          : path.basename(outDir) === 'models'
            ? path.resolve(outDir, '..', '..', 'config', 'locales')
            : yield* new GeneratorConfigError({
                message:
                  'locales is required for Hekireki-ActiveRecord when a `@ar.` message names a locale: the directory config/locales is written to, relative to output.',
              })
      yield* emitMany(localeFiles, localesDir)
    }
    return yield* emitMany(withBase, outDir)
  })
}
