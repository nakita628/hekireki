#!/usr/bin/env node
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../shared/format/index.js'
import { collectRelationProps } from '../../shared/helper/relations.js'
import { buildValibotRelations } from './generator/schema.js'
import { valibot } from './generator/valibot.js'

const { generatorHandler } = pkg

const buildRelationsOnly = (dmmf: GeneratorOptions['dmmf'], includeType: boolean): string => {
  const models = dmmf.datamodel.models
  const relIndex = collectRelationProps(models)
  const relByModel = Object.groupBy(relIndex, (r) => r.model)
  return models
    .map((model) =>
      buildValibotRelations(
        model,
        (relByModel[model.name] ?? []).map(({ key, targetModel, isMany }) => ({ key, targetModel, isMany })),
        { includeType },
      ),
    )
    .filter((code): code is string => Boolean(code))
    .join('\n\n')
}

const getString = (v: string | string[] | undefined, fallback?: string): string | undefined =>
  typeof v === 'string' ? v : Array.isArray(v) ? v[0] ?? fallback : fallback

const getBool = (v: unknown, fallback = false): boolean =>
  v === true || v === 'true' || (Array.isArray(v) && v[0] === 'true') ? true : fallback

const emit = async (options: GeneratorOptions, enableRelation: boolean): Promise<void> => {
  const outDir = options.generator.output?.value ?? './valibot'
  const file = getString(options.generator.config?.file, 'index.ts') ?? 'index.ts'
  const base = valibot(
    options.dmmf.datamodel.models,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
  )
  const relations = enableRelation ? buildRelationsOnly(options.dmmf, getBool(options.generator.config?.type)) : ''
  const full = [base, relations].filter(Boolean).join('\n\n')
  const code = await fmt(full)
  await fsp.mkdir(outDir, { recursive: true })
  await fsp.writeFile(path.join(outDir, file), code, 'utf8')
}

export const onGenerate = (options: GeneratorOptions) =>
  emit(
    options,
    (options.generator.config?.relation === 'true' || Array.isArray(options.generator.config?.relation) && options.generator.config?.relation[0] === 'true') &&
      (options.generator.config?.type === 'true' || Array.isArray(options.generator.config?.type) && options.generator.config?.type[0] === 'true'),
  )

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './valibot/',
      prettyName: 'Hekireki-Valibot',
    }
  },
  onGenerate,
})
