import type { DMMF } from '@prisma/generator-helper'

import {
  collectM2MPairs,
  generateEntityFile,
  generateEnum,
  generateM2MEntity,
  generateModRs,
  generatePreludeRs,
  PRISMA_DATE_TIME_RS,
  rustModule,
} from '../helper/sea-orm.js'

export function seaOrmFiles(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
  serde: { readonly renameAll?: string } = {},
  provider?: string,
) {
  const useLines = ['use sea_orm::entity::prelude::*;', 'use serde::{Deserialize, Serialize};']

  const enumFiles = enums.map((e) => ({
    fileName: rustModule(e.name).file,
    moduleName: rustModule(e.name).ident,
    code: [...useLines, '', generateEnum(e, serde), ''].join('\n'),
  }))

  const entities = models
    .map((model) => ({
      model,
      fileName: rustModule(model.name).file,
      moduleName: rustModule(model.name).ident,
      code: generateEntityFile(model, models, enums, serde, provider),
    }))
    .filter((entry) => entry.code.trim().length > 0)
  const entityFiles = entities.map(({ fileName, moduleName, code }) => ({
    fileName,
    moduleName,
    code,
  }))

  const m2mFiles = collectM2MPairs(models).map((pair) => ({
    fileName: rustModule(pair.relationName).file,
    moduleName: rustModule(pair.relationName).ident,
    code: generateM2MEntity(pair.left, pair.right, pair.relationName, models, serde),
  }))

  // Only the models written above: a prelude naming a module there is no file for does not build.
  const preludeEntry = {
    fileName: 'prelude.rs',
    moduleName: 'prelude',
    code: generatePreludeRs(entities.map(({ model }) => model)),
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
  // rustfmt orders `mod` items by name without the `r#` of a raw identifier.
  const moduleNames = allEntries
    .map((e) => e.moduleName)
    .toSorted((a, b) => {
      const [x, y] = [a.replace(/^r#/u, ''), b.replace(/^r#/u, '')]
      return x < y ? -1 : x > y ? 1 : 0
    })
  const modEntry = { fileName: 'mod.rs', code: generateModRs(moduleNames) }

  return [...allEntries.map(({ fileName, code }) => ({ fileName, code })), modEntry]
}
