#!/usr/bin/env node
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { mkdir, writeFile } from '../../fsp/index.js'
import { dbmlContent, makeDbmlFile, makePng, makePngFile } from '../../helper/dbml.js'
import { getString } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
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
    const mkdirResult = await mkdir(dir)
    if (!mkdirResult.ok) {
      throw new Error(`Failed to create directory: ${mkdirResult.error}`)
    }
    if (output.endsWith('.png')) {
      const pngResult = await makePngFile(output, content)
      if (!pngResult.ok) throw new Error(pngResult.error)
    } else {
      const dbmlResult = await writeFile(output, content)
      if (!dbmlResult.ok) throw new Error(`Failed to write DBML: ${dbmlResult.error}`)
    }
  } else {
    const resolved = path.extname(output)
      ? { dir: path.dirname(output), file: output }
      : { dir: output, file: path.join(output, 'schema.dbml') }
    const mkdirResult = await mkdir(resolved.dir)
    if (!mkdirResult.ok) {
      throw new Error(`Failed to create directory: ${mkdirResult.error}`)
    }
    const fileName = path.basename(resolved.file)
    if (fileName.endsWith('.png')) {
      const pngResult = await makePng(resolved.dir, content, fileName)
      if (!pngResult.ok) throw new Error(pngResult.error)
    } else {
      const dbmlResult = await makeDbmlFile(resolved.dir, content, fileName)
      if (!dbmlResult.ok) throw new Error(dbmlResult.error)
    }
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-DBML',
    }
  },
  onGenerate: main,
})
