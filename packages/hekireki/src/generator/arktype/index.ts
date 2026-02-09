#!/usr/bin/env node
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../format/index.js'
import { mkdir, writeFile } from '../../fsp/index.js'
import { arktype, makeArktypeRelations } from '../../helper/arktype.js'
import { makeRelationsOnly } from '../../helper/prisma.js'
import { getBool, getString } from '../../utils/index.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const outDir = options.generator.output?.value ?? './arktype'
  const file = getString(options.generator.config?.file, 'index.ts') ?? 'index.ts'
  const enableRelation =
    options.generator.config?.relation === 'true' ||
    (Array.isArray(options.generator.config?.relation) &&
      options.generator.config?.relation[0] === 'true')

  const base = arktype(
    options.dmmf.datamodel.models,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
  )
  const relations = enableRelation
    ? makeRelationsOnly(
        options.dmmf,
        getBool(options.generator.config?.type),
        makeArktypeRelations,
      )
    : ''
  const full = [base, relations].filter(Boolean).join('\n\n')

  const fmtResult = await fmt(full)
  if (!fmtResult.ok) {
    throw new Error(`Format error: ${fmtResult.error}`)
  }

  const mkdirResult = await mkdir(outDir)
  if (!mkdirResult.ok) {
    throw new Error(`Failed to create directory: ${mkdirResult.error}`)
  }

  const writeResult = await writeFile(path.join(outDir, file), fmtResult.value)
  if (!writeResult.ok) {
    throw new Error(`Failed to write file: ${writeResult.error}`)
  }
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './arktype/',
      prettyName: 'Hekireki-ArkType',
    }
  },
  onGenerate: main,
})
