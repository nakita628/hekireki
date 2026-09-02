import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { dbmlContent, dbmlToPng } from '../generator/dbml.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

function resolveOutPath(output: string) {
  if (path.extname(output)) return output
  return path.join(output, 'schema.dbml')
}
export function dbml(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-DBML. Please specify output in your generator config.',
      })
    }
    const output = options.generator.output.value
    const mapToDbSchema = getString(options.generator.config?.mapToDbSchema) !== 'false'
    const content = dbmlContent(options.dmmf.datamodel, mapToDbSchema)
    const outPath = resolveOutPath(output)
    const payload = outPath.endsWith('.png') ? dbmlToPng(content) : content
    return yield* emitRaw(payload, path.dirname(outPath), outPath)
  })
}
