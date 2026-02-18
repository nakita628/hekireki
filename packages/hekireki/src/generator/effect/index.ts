#!/usr/bin/env node
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../format/index.js'
import { mkdir, writeFile } from '../../fsp/index.js'
import { effect, makeEffectRelations } from '../../helper/effect.js'
import { makeRelationsOnly } from '../../helper/prisma.js'
import { getBool } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-Effect. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const resolved = path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, 'index.ts') }
  const enableRelation =
    options.generator.config?.relation === 'true' ||
    (Array.isArray(options.generator.config?.relation) &&
      options.generator.config?.relation[0] === 'true')

  const base = effect(
    options.dmmf.datamodel.models,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
    options.dmmf.datamodel.enums,
  )
  const relations = enableRelation
    ? makeRelationsOnly(options.dmmf, getBool(options.generator.config?.type), makeEffectRelations)
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
      prettyName: 'Hekireki-Effect',
    }
  },
  onGenerate: main,
})
