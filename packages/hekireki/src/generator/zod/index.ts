#!/usr/bin/env node
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../shared/format/index.js'
import { mkdir, writeFile } from '../../shared/fsp/index.js'
import { getBool, getString } from '../../shared/generator/index.js'
import { collectRelationProps } from '../../shared/helper/relations.js'
import { buildZodRelations } from './generator/schema.js'
import { zod } from './generator/zod.js'

const { generatorHandler } = pkg

const buildRelationsOnly = (dmmf: GeneratorOptions['dmmf'], includeType: boolean): string => {
  const models = dmmf.datamodel.models
  const relIndex = collectRelationProps(models)
  const relByModel: Record<
    string,
    readonly {
      readonly model: string
      readonly key: string
      readonly targetModel: string
      readonly isMany: boolean
    }[]
  > = {}

  for (const r of relIndex) {
    const existing = relByModel[r.model] ?? []
    relByModel[r.model] = [...existing, r]
  }
  const blocks = models
    .map((model) => {
      const relProps = (relByModel[model.name] ?? []).map(({ key, targetModel, isMany }) => ({
        key,
        targetModel,
        isMany,
      }))
      if (relProps.length === 0) return ''
      const schema = buildZodRelations(model, relProps)
      const typeLine = includeType
        ? `\n\nexport type ${model.name}Relations = z.infer<typeof ${model.name}RelationsSchema>`
        : ''
      return `${schema}${typeLine}`
    })
    .filter(Boolean)
  return blocks.join('\n\n')
}

const emit = async (options: GeneratorOptions, enableRelation: boolean): Promise<void> => {
  const outDir = options.generator.output?.value ?? './zod'
  const file = getString(options.generator.config?.file, 'index.ts') ?? 'index.ts'
  const zodVersion = getString(options.generator.config?.zod, 'v4')
  const base = zod(
    options.dmmf.datamodel.models,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
    zodVersion,
  )
  const relations = enableRelation
    ? buildRelationsOnly(options.dmmf, getBool(options.generator.config?.type))
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

export const onGenerate = (options: GeneratorOptions) =>
  emit(
    options,
    options.generator.config?.relation === 'true' ||
      (Array.isArray(options.generator.config?.relation) &&
        options.generator.config?.relation[0] === 'true'),
  )

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './zod/',
      prettyName: 'Hekireki-Zod',
    }
  },
  onGenerate,
})
