import type { DMMF } from '@prisma/generator-helper'

import {
  collectM2MPairs,
  generateEntityFile,
  generateEnum,
  generateM2MEntity,
  generateModRs,
  generatePreludeRs,
  PRISMA_DATE_TIME_RS,
} from '../helper/sea-orm.js'
import { makeSnakeCase } from '../utils/index.js'

export function seaOrmFiles(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
  serde: { readonly renameAll?: string } = {},
  provider?: string,
) {
  const useLines = ['use sea_orm::entity::prelude::*;', 'use serde::{Deserialize, Serialize};']

  const enumFiles = enums.map((e) => ({
    fileName: `${makeSnakeCase(e.name)}.rs`,
    moduleName: makeSnakeCase(e.name),
    code: [...useLines, '', generateEnum(e, serde), ''].join('\n'),
  }))

  const entityFiles = models
    .map((model) => ({
      fileName: `${makeSnakeCase(model.name)}.rs`,
      moduleName: makeSnakeCase(model.name),
      code: generateEntityFile(model, models, enums, serde, provider),
    }))
    .filter((entry) => entry.code.trim().length > 0)

  const m2mFiles = collectM2MPairs(models).map((pair) => {
    const moduleName = makeSnakeCase(pair.relationName)
    return {
      fileName: `${moduleName}.rs`,
      moduleName,
      code: generateM2MEntity(pair.left, pair.right, pair.relationName, models, serde),
    }
  })

  const preludeEntry = {
    fileName: 'prelude.rs',
    moduleName: 'prelude',
    code: generatePreludeRs(models),
  }

  const prismaDateTimeFiles =
    provider === 'sqlite' && models.some((m) => m.fields.some((f) => f.type === 'DateTime'))
      ? [
          {
            fileName: 'prisma_date_time.rs',
            moduleName: 'prisma_date_time',
            code: PRISMA_DATE_TIME_RS,
          },
        ]
      : []

  const allEntries = [
    ...enumFiles,
    ...entityFiles,
    ...m2mFiles,
    ...prismaDateTimeFiles,
    preludeEntry,
  ]
  const moduleNames = allEntries.map((e) => e.moduleName).toSorted()
  const modEntry = { fileName: 'mod.rs', code: generateModRs(moduleNames) }

  return [...allEntries.map(({ fileName, code }) => ({ fileName, code })), modEntry]
}
