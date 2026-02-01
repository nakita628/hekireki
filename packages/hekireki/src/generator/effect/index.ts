#!/usr/bin/env node
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../shared/format/index.js'
import { mkdir, writeFile } from '../../shared/fsp/index.js'
import { getBool, getString } from '../../shared/generator/index.js'
import { collectRelationProps } from '../../shared/helper/relations.js'
import { effect } from './generator/effect.js'
import { makeEffectRelations } from './generator/schema.js'

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
  return models
    .map((model) =>
      makeEffectRelations(
        model,
        (relByModel[model.name] ?? []).map(({ key, targetModel, isMany }) => ({
          key,
          targetModel,
          isMany,
        })),
        { includeType },
      ),
    )
    .filter((code): code is string => Boolean(code))
    .join('\n\n')
}

const emit = async (options: GeneratorOptions, enableRelation: boolean): Promise<void> => {
  const outDir = options.generator.output?.value ?? './effect'
  const file = getString(options.generator.config?.file, 'index.ts') ?? 'index.ts'
  const base = effect(
    options.dmmf.datamodel.models,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
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
      defaultOutput: './effect/',
      prettyName: 'Hekireki-Effect',
    }
  },
  onGenerate,
})
