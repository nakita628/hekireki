import type { DMMF, GeneratorOptions } from '@prisma/generator-helper'

import { emitMany } from '../emit/index.js'
import { getString, makeSnakeCase } from '../utils/index.js'

const PRISMA_TO_RUST: Record<string, string> = {
  String: 'String',
  Int: 'i32',
  BigInt: 'i64',
  Float: 'f64',
  Decimal: 'Decimal',
  Boolean: 'bool',
  DateTime: 'DateTimeUtc',
  Json: 'Json',
  Bytes: 'Vec<u8>',
}

export function prismaTypeToRustType(type: string, isRequired: boolean) {
  const base = PRISMA_TO_RUST[type] ?? 'String'
  if (!isRequired) {
    return `Option<${base}>`
  }
  return base
}

export function resolveSeaOrmColumnType(field: DMMF.Field) {
  if (!field.nativeType) return null

  const [nativeName, nativeArgs] = field.nativeType
  const args = nativeArgs ?? []

  switch (nativeName) {
    case 'VarChar':
    case 'Char':
      return args.length > 0 ? `String(StringLen::N(${args[0]}))` : null
    case 'Text':
    case 'MediumText':
    case 'LongText':
    case 'TinyText':
      return 'Text'
    case 'SmallInt':
    case 'TinyInt':
      return 'SmallInteger'
    case 'MediumInt':
      return 'Integer'
    case 'DoublePrecision':
    case 'Double':
    case 'Real':
      return 'Double'
    case 'Decimal':
    case 'Money':
      return args.length >= 2 ? `Decimal(Some((${args[0]}, ${args[1]})))` : 'Decimal(None)'
    case 'Uuid':
      return 'Uuid'
    case 'Timestamp':
    case 'Timestamptz':
      return 'TimestampWithTimeZone'
    case 'Date':
      return 'Date'
    case 'Time':
    case 'Timetz':
      return 'Time'
    case 'JsonB':
      return 'JsonBinary'
    default:
      return null
  }
}

function isFunctionDefault(
  def: DMMF.Field['default'],
): def is { readonly name: string; readonly args: readonly (string | number)[] } {
  return def !== null && typeof def === 'object' && 'name' in def
}

function isAutoincrement(field: DMMF.Field) {
  return isFunctionDefault(field.default) && field.default.name === 'autoincrement'
}

function formatRustDefault(def: DMMF.Field['default']) {
  if (def === undefined || def === null) return null
  if (typeof def === 'boolean') return def ? 'true' : 'false'
  if (typeof def === 'number') return String(def)
  if (typeof def === 'string') return `"${def}"`
  return null
}

export function buildSeaOrmAttributes(field: DMMF.Field, isPk: boolean, isCompositePk: boolean) {
  const attrs: string[] = []

  if (isPk) {
    const parts: string[] = ['primary_key']
    if (!isAutoincrement(field)) {
      parts.push('auto_increment = false')
    }
    attrs.push(`#[sea_orm(${parts.join(', ')})]`)
  }

  if (field.isUnique) {
    attrs.push('#[sea_orm(unique)]')
  }

  const columnParts: string[] = []

  // column_name
  const columnName = field.dbName ?? makeSnakeCase(field.name)
  const snakeName = makeSnakeCase(field.name)
  if (columnName !== snakeName) {
    columnParts.push(`column_name = "${columnName}"`)
  }

  // column_type from native type
  const colType = resolveSeaOrmColumnType(field)
  if (colType) {
    columnParts.push(`column_type = "${colType}"`)
  }

  // default_value
  if (!isPk || isCompositePk) {
    if (
      !(
        (field.type === 'DateTime' &&
          isFunctionDefault(field.default) &&
          field.default.name === 'now') ||
        field.isUpdatedAt
      )
    ) {
      const defaultVal = formatRustDefault(field.default)
      if (defaultVal !== null) {
        columnParts.push(`default_value = ${defaultVal}`)
      }
    }
  }

  if (columnParts.length > 0) {
    attrs.push(`#[sea_orm(${columnParts.join(', ')})]`)
  }

  return attrs
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const belongsTo: {
    name: string
    targetModel: string
    foreignKey: string
    references: string
  }[] = []
  const hasMany: {
    name: string
    targetModel: string
    foreignKey: string
    references: string
    isList: boolean
  }[] = []
  const hasOne: {
    name: string
    targetModel: string
    foreignKey: string
    references: string
    isList: boolean
  }[] = []
  const manyToMany: { name: string; targetModel: string; relationName: string }[] = []

  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    if (field.relationFromFields && field.relationFromFields.length > 0) {
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKey: field.relationFromFields[0],
        references: field.relationToFields?.[0] ?? 'id',
      })
      continue
    }

    const targetModel = allModels.find((m) => m.name === field.type)
    if (!targetModel) continue

    if (field.isList) {
      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )
      if (otherSide?.isList) {
        manyToMany.push({
          name: field.name,
          targetModel: field.type,
          relationName: field.relationName ?? `${model.name}To${field.type}`,
        })
        continue
      }
    }

    const fkField = targetModel.fields.find(
      (f) =>
        f.relationName === field.relationName &&
        f.relationFromFields &&
        f.relationFromFields.length > 0,
    )
    const foreignKey = fkField?.relationFromFields?.[0]
    if (!foreignKey) continue
    const references = fkField?.relationToFields?.[0] ?? 'id'

    if (field.isList) {
      hasMany.push({
        name: field.name,
        targetModel: field.type,
        foreignKey,
        references,
        isList: true,
      })
    } else {
      hasOne.push({
        name: field.name,
        targetModel: field.type,
        foreignKey,
        references,
        isList: false,
      })
    }
  }

  return { belongsTo, hasMany, hasOne, manyToMany }
}

function toSnakeCase(name: string) {
  return makeSnakeCase(name)
}

function toPascalCase(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function toModuleName(modelName: string) {
  return toSnakeCase(modelName)
}

export interface SerdeOptions {
  readonly renameAll?: string
}

// Types that do NOT implement Eq in Rust (f64: NaN != NaN)
const NON_EQ_PRISMA_TYPES = new Set(['Float'])

export function canDeriveEq(fields: readonly DMMF.Field[]) {
  return fields.filter((f) => f.kind !== 'object').every((f) => !NON_EQ_PRISMA_TYPES.has(f.type))
}

function buildSerdeAttributes(opts: SerdeOptions) {
  const parts: string[] = []
  if (opts.renameAll) {
    parts.push(`rename_all = "${opts.renameAll}"`)
  }
  if (parts.length === 0) return []
  return [`#[serde(${parts.join(', ')})]`]
}

export function generateEnum(e: DMMF.DatamodelEnum, serde: SerdeOptions = {}) {
  const variants = e.values.map((v) => {
    const pascalName = v.name.charAt(0).toUpperCase() + v.name.slice(1).toLowerCase()
    return `    #[sea_orm(string_value = "${v.name}")]\n    ${pascalName},`
  })

  const derives =
    '#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]'

  const serdeAttrs = buildSerdeAttributes(serde)

  return [
    derives,
    ...serdeAttrs,
    '#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)")]',
    `pub enum ${e.name} {`,
    ...variants,
    '}',
  ].join('\n')
}

function generateRelationEnum(
  _model: DMMF.Model,
  associations: {
    belongsTo: { name: string; targetModel: string; foreignKey: string; references: string }[]
    hasMany: {
      name: string
      targetModel: string
      foreignKey: string
      references: string
      isList: boolean
    }[]
    hasOne: {
      name: string
      targetModel: string
      foreignKey: string
      references: string
      isList: boolean
    }[]
    manyToMany: { name: string; targetModel: string; relationName: string }[]
  },
) {
  const hasAny =
    associations.belongsTo.length > 0 ||
    associations.hasMany.length > 0 ||
    associations.hasOne.length > 0

  if (!hasAny) {
    return ['#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]', 'pub enum Relation {}'].join(
      '\n',
    )
  }

  const variants: string[] = []

  for (const assoc of associations.belongsTo) {
    const variantName = toPascalCase(assoc.name)
    const targetModule = toModuleName(assoc.targetModel)
    const fromCol = toPascalCase(assoc.foreignKey)
    const toCol = toPascalCase(assoc.references)
    variants.push(
      `    #[sea_orm(\n        belongs_to = "super::${targetModule}::Entity",\n        from = "Column::${fromCol}",\n        to = "super::${targetModule}::Column::${toCol}"\n    )]\n    ${variantName},`,
    )
  }

  for (const assoc of associations.hasMany) {
    const variantName = toPascalCase(assoc.name)
    const targetModule = toModuleName(assoc.targetModel)
    variants.push(
      `    #[sea_orm(has_many = "super::${targetModule}::Entity")]\n    ${variantName},`,
    )
  }

  for (const assoc of associations.hasOne) {
    const variantName = toPascalCase(assoc.name)
    const targetModule = toModuleName(assoc.targetModel)
    variants.push(`    #[sea_orm(has_one = "super::${targetModule}::Entity")]\n    ${variantName},`)
  }

  return [
    '#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]',
    'pub enum Relation {',
    ...variants,
    '}',
  ].join('\n')
}

function generateRelatedImpls(
  model: DMMF.Model,
  associations: {
    belongsTo: { name: string; targetModel: string; foreignKey: string; references: string }[]
    hasMany: {
      name: string
      targetModel: string
      foreignKey: string
      references: string
      isList: boolean
    }[]
    hasOne: {
      name: string
      targetModel: string
      foreignKey: string
      references: string
      isList: boolean
    }[]
    manyToMany: { name: string; targetModel: string; relationName: string }[]
  },
) {
  const impls: string[] = []

  // Track models with M2M to avoid duplicate Related impls
  const m2mTargets = new Set(associations.manyToMany.map((a) => a.targetModel))

  for (const assoc of associations.belongsTo) {
    if (m2mTargets.has(assoc.targetModel)) continue
    const targetModule = toModuleName(assoc.targetModel)
    impls.push(
      [
        `impl Related<super::${targetModule}::Entity> for Entity {`,
        '    fn to() -> RelationDef {',
        `        Relation::${toPascalCase(assoc.name)}.def()`,
        '    }',
        '}',
      ].join('\n'),
    )
  }

  for (const assoc of associations.hasMany) {
    if (m2mTargets.has(assoc.targetModel)) continue
    const targetModule = toModuleName(assoc.targetModel)
    impls.push(
      [
        `impl Related<super::${targetModule}::Entity> for Entity {`,
        '    fn to() -> RelationDef {',
        `        Relation::${toPascalCase(assoc.name)}.def()`,
        '    }',
        '}',
      ].join('\n'),
    )
  }

  for (const assoc of associations.hasOne) {
    if (m2mTargets.has(assoc.targetModel)) continue
    const targetModule = toModuleName(assoc.targetModel)
    impls.push(
      [
        `impl Related<super::${targetModule}::Entity> for Entity {`,
        '    fn to() -> RelationDef {',
        `        Relation::${toPascalCase(assoc.name)}.def()`,
        '    }',
        '}',
      ].join('\n'),
    )
  }

  // M2M: impl Related with via()
  for (const assoc of associations.manyToMany) {
    const targetModule = toModuleName(assoc.targetModel)
    const [leftName, rightName] =
      model.name < assoc.targetModel
        ? [model.name, assoc.targetModel]
        : [assoc.targetModel, model.name]
    const junctionModule = toSnakeCase(`${leftName}To${rightName}`)
    const junctionRelToTarget = toPascalCase(assoc.targetModel)
    const junctionRelToSelf = toPascalCase(model.name)

    impls.push(
      [
        `impl Related<super::${targetModule}::Entity> for Entity {`,
        '    fn to() -> RelationDef {',
        `        super::${junctionModule}::Relation::${junctionRelToTarget}.def()`,
        '    }',
        '    fn via() -> Option<RelationDef> {',
        `        Some(super::${junctionModule}::Relation::${junctionRelToSelf}.def().rev())`,
        '    }',
        '}',
      ].join('\n'),
    )
  }

  return impls
}

export function generateEntityFile(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
  serde: SerdeOptions = {},
) {
  const idField = model.fields.find((f) => f.isId)
  const compositePkFieldNames = new Set(model.primaryKey?.fields ?? [])
  const isCompositePk = !idField && compositePkFieldNames.size > 0

  if (!(idField || isCompositePk)) return ''

  const tableName = model.dbName ?? toSnakeCase(model.name)
  const associations = getAssociations(model, allModels)
  const enumNames = new Set(enums.map((e) => e.name))

  // Build scalar fields
  const scalarFields = model.fields.filter((f) => f.kind !== 'object')
  const fieldLines: string[] = []

  for (const field of scalarFields) {
    const isPk = field.isId || compositePkFieldNames.has(field.name)
    const attrs = buildSeaOrmAttributes(field, isPk, isCompositePk)

    const rustType = enumNames.has(field.type)
      ? field.isRequired
        ? field.type
        : `Option<${field.type}>`
      : prismaTypeToRustType(field.type, field.isRequired)

    const fieldName = toSnakeCase(field.name)

    for (const attr of attrs) {
      fieldLines.push(`    ${attr}`)
    }
    fieldLines.push(`    pub ${fieldName}: ${rustType},`)
  }

  const relationEnum = generateRelationEnum(model, associations)
  const relatedImpls = generateRelatedImpls(model, associations)

  const useLines = ['use sea_orm::entity::prelude::*;', 'use serde::{Deserialize, Serialize};']

  const eq = canDeriveEq(scalarFields)
  const deriveModel = eq
    ? '#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]'
    : '#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]'

  const serdeAttrs = buildSerdeAttributes(serde)

  const lines = [
    ...useLines,
    '',
    deriveModel,
    ...serdeAttrs,
    `#[sea_orm(table_name = "${tableName}")]`,
    'pub struct Model {',
    ...fieldLines,
    '}',
    '',
    relationEnum,
    '',
    ...relatedImpls.map((impl) => `${impl}\n`),
    'impl ActiveModelBehavior for ActiveModel {}',
  ]

  return lines.join('\n')
}

function generateM2MEntity(
  leftModel: string,
  rightModel: string,
  _allModels: readonly DMMF.Model[],
  serde: SerdeOptions = {},
) {
  const [sortedLeft, sortedRight] =
    leftModel < rightModel ? [leftModel, rightModel] : [rightModel, leftModel]

  const tableName = `_${sortedLeft}To${sortedRight}`
  const leftModule = toModuleName(sortedLeft)
  const rightModule = toModuleName(sortedRight)
  const leftFk = `${toSnakeCase(sortedLeft)}_id`
  const rightFk = `${toSnakeCase(sortedRight)}_id`
  const leftCol = toPascalCase(`${toSnakeCase(sortedLeft)}Id`)
  const rightCol = toPascalCase(`${toSnakeCase(sortedRight)}Id`)

  const useLines = ['use sea_orm::entity::prelude::*;', 'use serde::{Deserialize, Serialize};']

  const deriveModel =
    '#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]'

  const serdeAttrs = buildSerdeAttributes(serde)

  return [
    ...useLines,
    '',
    deriveModel,
    ...serdeAttrs,
    `#[sea_orm(table_name = "${tableName}")]`,
    'pub struct Model {',
    '    #[sea_orm(primary_key, auto_increment = false)]',
    `    pub ${leftFk}: String,`,
    '    #[sea_orm(primary_key, auto_increment = false)]',
    `    pub ${rightFk}: String,`,
    '}',
    '',
    '#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]',
    'pub enum Relation {',
    '    #[sea_orm(',
    `        belongs_to = "super::${leftModule}::Entity",`,
    `        from = "Column::${leftCol}",`,
    `        to = "super::${leftModule}::Column::Id"`,
    '    )]',
    `    ${sortedLeft},`,
    '    #[sea_orm(',
    `        belongs_to = "super::${rightModule}::Entity",`,
    `        from = "Column::${rightCol}",`,
    `        to = "super::${rightModule}::Column::Id"`,
    '    )]',
    `    ${sortedRight},`,
    '}',
    '',
    'impl ActiveModelBehavior for ActiveModel {}',
  ].join('\n')
}

export function generateModRs(moduleNames: readonly string[]) {
  return `${moduleNames.map((m) => `pub mod ${m};`).join('\n')}\n`
}

export function generatePreludeRs(models: readonly DMMF.Model[]) {
  return `${models
    .map((m) => {
      const moduleName = toModuleName(m.name)
      return `pub use super::${moduleName}::Entity as ${m.name};`
    })
    .join('\n')}\n`
}

function collectM2MPairs(models: readonly DMMF.Model[]) {
  const pairs = models.flatMap((model) =>
    getAssociations(model, models).manyToMany.map((assoc) => {
      const [left, right] =
        model.name < assoc.targetModel
          ? [model.name, assoc.targetModel]
          : [assoc.targetModel, model.name]
      return { left, right }
    }),
  )
  const seen = new Set<string>()
  return pairs.filter((pair) => {
    const key = `${pair.left}_${pair.right}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

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

export async function seaOrm(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-SeaORM. Please specify output in your generator config.',
    } as const
  }
  const outDir = options.generator.output.value
  const renameAll = getString(options.generator.config?.renameAll)
  const serde: SerdeOptions = { renameAll }
  const enums = options.dmmf.datamodel.enums

  const files = seaOrmFiles(options.dmmf.datamodel.models, enums, serde)
  return emitMany(files, outDir)
}
