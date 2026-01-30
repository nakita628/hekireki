#!/usr/bin/env node
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../shared/format/index.js'
import { mkdir, writeFile } from '../../shared/fsp/index.js'
import { getBool, getString } from '../../shared/generator/index.js'
import { arktype } from './generator/arktype.js'

const { generatorHandler } = pkg

const emit = async (options: GeneratorOptions): Promise<void> => {
  const outDir = options.generator.output?.value ?? './arktype'
  const file = getString(options.generator.config?.file, 'index.ts') ?? 'index.ts'
  const content = arktype(
    options.dmmf.datamodel.models,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
  )

  const fmtResult = await fmt(content)
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

export const onGenerate = (options: GeneratorOptions) => emit(options)

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './arktype/',
      prettyName: 'Hekireki-ArkType',
    }
  },
  onGenerate,
})
