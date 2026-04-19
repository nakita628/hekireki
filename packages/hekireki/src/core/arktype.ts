import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'

import { fmt } from '../format/index.js'
import { arktype as arktypeSchema, makeArktypeRelations } from '../helper/arktype.js'
import { makeRelationsOnly } from '../helper/prisma.js'
import { getBool } from '../utils/index.js'

export async function arktype(options: GeneratorOptions): Promise<void> {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    throw new Error(
      'output is required for Hekireki-ArkType. Please specify output in your generator config.',
    )
  }
  const output = options.generator.output.value
  const resolved = path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, 'index.ts') }
  const enableRelation = getBool(options.generator.config?.relation)

  const base = arktypeSchema(
    options.dmmf.datamodel.models,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
    options.dmmf.datamodel.enums,
  )
  const relations = enableRelation
    ? makeRelationsOnly(options.dmmf, getBool(options.generator.config?.type), makeArktypeRelations)
    : ''
  const full = [base, relations].filter(Boolean).join('\n\n')

  const code = await fmt(full)
  await mkdir(resolved.dir, { recursive: true })
  await writeFile(resolved.file, code, 'utf-8')
}
