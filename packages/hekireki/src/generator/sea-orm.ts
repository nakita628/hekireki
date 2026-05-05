import type { DMMF } from '@prisma/generator-helper'

import {
  collectM2MPairs,
  generateEntityFile,
  generateEnum,
  generateM2MEntity,
  generateModRs,
  generatePreludeRs,
  type SerdeOptions,
  toModuleName,
  toSnakeCase,
} from '../helper/sea-orm.js'

export type { SerdeOptions }

export function seaOrmFiles(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
  serde: SerdeOptions = {},
) {
  const useLines = ['use sea_orm::entity::prelude::*;', 'use serde::{Deserialize, Serialize};']

  const enumFiles = enums.map((e) => ({
    fileName: `${toSnakeCase(e.name)}.rs`,
    moduleName: toSnakeCase(e.name),
    code: [...useLines, '', generateEnum(e, serde), ''].join('\n'),
  }))

  const entityFiles = models
    .map((model) => ({
      fileName: `${toModuleName(model.name)}.rs`,
      moduleName: toModuleName(model.name),
      code: generateEntityFile(model, models, enums, serde),
    }))
    .filter((entry) => entry.code.trim().length > 0)

  const m2mFiles = collectM2MPairs(models).map((pair) => {
    const moduleName = toSnakeCase(`${pair.left}To${pair.right}`)
    return {
      fileName: `${moduleName}.rs`,
      moduleName,
      code: generateM2MEntity(pair.left, pair.right, models, serde),
    }
  })

  const preludeEntry = {
    fileName: 'prelude.rs',
    moduleName: 'prelude',
    code: generatePreludeRs(models),
  }

  const allEntries = [...enumFiles, ...entityFiles, ...m2mFiles, preludeEntry]
  const moduleNames = allEntries.map((e) => e.moduleName).sort()
  const modEntry = { fileName: 'mod.rs', code: generateModRs(moduleNames) }

  return [...allEntries.map(({ fileName, code }) => ({ fileName, code })), modEntry]
}
