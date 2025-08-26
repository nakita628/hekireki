#!/usr/bin/env node
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { collectRelationProps } from './generator/relations.js'
import { buildZodModel, buildZodRelations } from './generator/schema.js'

const { generatorHandler } = pkg

const fileHeader = `import * as z from 'zod'\n`

const emit = async (outDir: string, dmmf: GeneratorOptions['dmmf']) => {
  const models = dmmf.datamodel.models
  const relIndex = collectRelationProps(models)
  const relByModel = Object.groupBy(relIndex, (r) => r.model) as Record<string, typeof relIndex>

  // 基本スキーマを先に生成
  const baseSchemas = models.map((m) => buildZodModel(m)).join('\n\n')

  // リレーションスキーマを後に生成
  const relationSchemas = models
    .map((m) => {
      const relProps = (relByModel[m.name] ?? []).map(({ key, targetModel, isMany }) => ({
        key,
        targetModel,
        isMany,
      }))
      return buildZodRelations(m, relProps)
    })
    .filter(Boolean)
    .join('\n\n')

  const body = relationSchemas ? `${baseSchemas}\n\n${relationSchemas}` : baseSchemas
  const code = `${fileHeader}\n${body}\n`
  await fsp.mkdir(outDir, { recursive: true })
  await fsp.writeFile(path.join(outDir, 'index.ts'), code, 'utf8')
}

export const onGenerate = (options: GeneratorOptions) =>
  emit(options.generator.output?.value ?? './zod', options.dmmf)

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './zod/',
      prettyName: 'Hekireki-Zod',
    }
  },
  onGenerate,
})
