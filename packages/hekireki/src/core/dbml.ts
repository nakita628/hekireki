import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { emitRaw } from '../emit/index.js'
import { dbmlContent, dbmlToPng } from '../generator/dbml.js'
import { getString } from '../utils/index.js'

function resolveOutPath(output: string) {
  if (path.extname(output)) return output
  return path.join(output, 'schema.dbml')
}
export async function dbml(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-DBML. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const mapToDbSchema = getString(options.generator.config?.mapToDbSchema) !== 'false'
  const content = dbmlContent(options.dmmf.datamodel, mapToDbSchema)
  const outPath = resolveOutPath(output)
  const payload = outPath.endsWith('.png') ? dbmlToPng(content) : content
  return emitRaw(payload, path.dirname(outPath), outPath)
}
