#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../format/index.js'
import { mkdir, writeFile } from '../../fsp/index.js'
import { makeRelationsOnly } from '../../helper/prisma.js'
import { makeZodRelations, zod } from '../../helper/zod.js'
import { getBool, getString, requireOutput, resolveOutput } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const output = requireOutput(options.generator.output?.value, 'Hekireki-Zod', options.generator.isCustomOutput)
  const resolved = resolveOutput(output, 'index.ts')
  const zodVersion = getString(options.generator.config?.zod, 'v4')
  const enableRelation =
    options.generator.config?.relation === 'true' ||
    (Array.isArray(options.generator.config?.relation) &&
      options.generator.config?.relation[0] === 'true')

  const base = zod(
    options.dmmf.datamodel.models,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
    zodVersion,
  )
  const relations = enableRelation
    ? makeRelationsOnly(options.dmmf, getBool(options.generator.config?.type), makeZodRelations)
    : ''
  const full = [base, relations].filter(Boolean).join('\n\n')

  const fmtResult = await fmt(full)
  if (!fmtResult.ok) {
    throw new Error(`Format error: ${fmtResult.error}`)
  }

  const mkdirResult = await mkdir(resolved.dir)
  if (!mkdirResult.ok) {
    throw new Error(`Failed to create directory: ${mkdirResult.error}`)
  }

  const writeResult = await writeFile(resolved.file, fmtResult.value)
  if (!writeResult.ok) {
    throw new Error(`Failed to write file: ${writeResult.error}`)
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-Zod',
    }
  },
  onGenerate: main,
})
