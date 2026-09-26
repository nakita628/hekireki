import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitMany } from '../emit/index.js'
import { seaOrmFiles } from '../generator/sea-orm.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

export function seaOrm(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-SeaORM. Please specify output in your generator config.',
      })
    }
    const outDir = options.generator.output.value
    const renameAll = getString(options.generator.config?.renameAll)
    const serde = { renameAll }
    const enums = options.dmmf.datamodel.enums
    const models = options.dmmf.datamodel.models
    // sqlx has no chrono type for TIMETZ and SeaORM no column type, so no entity could read it.
    const timetz = models.flatMap((m) =>
      m.fields.filter((f) => f.nativeType?.[0] === 'Timetz').map((f) => `${m.name}.${f.name}`),
    )
    if (timetz.length > 0) {
      return yield* new GeneratorConfigError({
        message: `@db.Timetz is not supported by Hekireki-SeaORM (sqlx cannot read TIMETZ into a Rust type): ${timetz.join(', ')}. Use @db.Time or @db.Timestamptz instead.`,
      })
    }
    const provider = options.datasources[0]?.activeProvider
    const files = seaOrmFiles(models, enums, serde, provider)
    return yield* emitMany(files, outDir)
  })
}
