import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { dbmlContent, makeDbmlFile, makePng, makePngFile } from '../helper/dbml.js'
import { getString } from '../utils/index.js'

export async function dbml(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-DBML. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const { config } = options.generator
  const mapToDbSchema = getString(config?.mapToDbSchema) !== 'false'

  const content = dbmlContent(options.dmmf.datamodel, mapToDbSchema)

  if (output.endsWith('.png') || output.endsWith('.dbml')) {
    const dir = path.dirname(output)
    await mkdir(dir, { recursive: true })
    if (output.endsWith('.png')) {
      await makePngFile(output, content)
    } else {
      await writeFile(output, content, 'utf-8')
    }
  } else {
    const resolved = path.extname(output)
      ? { dir: path.dirname(output), file: output }
      : { dir: output, file: path.join(output, 'schema.dbml') }
    await mkdir(resolved.dir, { recursive: true })
    const fileName = path.basename(resolved.file)
    if (fileName.endsWith('.png')) {
      await makePng(resolved.dir, content, fileName)
    } else {
      await makeDbmlFile(resolved.dir, content, fileName)
    }
  }
}
