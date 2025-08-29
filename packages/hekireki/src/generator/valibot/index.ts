#!/usr/bin/env node
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { collectRelationProps } from '../../shared/helper/relations.js'
import { fmt } from '../../shared/format/index.js'
import { buildValibotModel, buildValibotRelations } from './generator/schema.js'

const { generatorHandler } = pkg

const fileHeader = `import * as v from 'valibot'\n`

const buildCode = (dmmf: GeneratorOptions['dmmf'], enableRelation: boolean): string => {
  const models = dmmf.datamodel.models
  const relIndex = collectRelationProps(models)
  const relByModel = Object.groupBy(relIndex, (r) => r.model)

  const baseSchemas = models.map((model) => buildValibotModel(model)).join('\n\n')

  const relationSchemas = enableRelation
    ? models
        .map((model) =>
          buildValibotRelations(
            model,
            (relByModel[model.name] ?? []).map(({ key, targetModel, isMany }) => ({
              key,
              targetModel,
              isMany,
            })),
          ),
        )
        .filter((code): code is string => Boolean(code))
        .join('\n\n')
    : ''

  const body = relationSchemas ? `${baseSchemas}\n\n${relationSchemas}` : baseSchemas
  return `${fileHeader}\n${body}\n`
}

const emit = async (
  outDir: string,
  dmmf: GeneratorOptions['dmmf'],
  enableRelation: boolean,
): Promise<void> => {
  const code = await fmt(buildCode(dmmf, enableRelation))
  await fsp.mkdir(outDir, { recursive: true })
  await fsp.writeFile(path.join(outDir, 'index.ts'), code, 'utf8')
}

export const onGenerate = (options: GeneratorOptions) =>
  emit(
    options.generator.output?.value ?? './valibot',
    options.dmmf,
    options.generator.config?.relation === 'true',
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
