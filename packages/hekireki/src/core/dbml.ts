import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { dbmlContent, dbmlToPng } from '../helper/dbml.js'
import { getString } from '../utils/index.js'

function resolveOutPath(output: string) {
  if (path.extname(output)) return output
  return path.join(output, 'schema.dbml')
}

export async function dbml(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-DBML. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const mapToDbSchema = getString(options.generator.config?.mapToDbSchema) !== 'false'

  const content = dbmlContent(options.dmmf.datamodel, mapToDbSchema)
  const outPath = resolveOutPath(output)
  const payload = outPath.endsWith('.png') ? dbmlToPng(content) : content

  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, payload)
}
