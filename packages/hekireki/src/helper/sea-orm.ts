import { join } from 'node:path'
import type { DMMF } from '@prisma/generator-helper'
import { mkdir, writeFile } from '../fsp/index.js'
import { makeSnakeCase } from '../utils/index.js'

// ============================================================================
// Type Mappings
// ============================================================================

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

export function prismaTypeToRustType(type: string, isRequired: boolean): string {
  const base = PRISMA_TO_RUST[type] ?? 'String'
  if (!isRequired) {
    return `Option<${base}>`
  }
  return base
}

// ============================================================================
// Native Type Resolution → SeaORM column_type
// ============================================================================

export function resolveSeaOrmColumnType(field: DMMF.Field): string | null {
  if (!field.nativeType) return null

  const [nativeName, nativeArgs] = field.nativeType as [string, readonly (string | number)[]]
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

// ============================================================================
// Default Value Handling
// ============================================================================

function isFunctionDefault(
  def: DMMF.Field['default'],
): def is { readonly name: string; readonly args: readonly (string | number)[] } {
  return def !== null && typeof def === 'object' && 'name' in def
}

function isAutoincrement(field: DMMF.Field): boolean {
  return isFunctionDefault(field.default) && field.default.name === 'autoincrement'
}

function formatRustDefault(def: DMMF.Field['default']): string | null {
  if (def === undefined || def === null) return null
  if (typeof def === 'boolean') return def ? 'true' : 'false'
  if (typeof def === 'number') return String(def)
  if (typeof def === 'string') return `"${def}"`
  return null
}

// ============================================================================
// SeaORM Attribute Building
// ============================================================================

export function buildSeaOrmAttributes(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
): string[] {
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

// ============================================================================
// Association Types
// ============================================================================

interface BelongsToAssoc {
  readonly name: string
  readonly targetModel: string
  readonly foreignKey: string
  readonly references: string
}

interface HasAssoc {
  readonly name: string
  readonly targetModel: string
  readonly foreignKey: string
  readonly references: string
  readonly isList: boolean
}

interface ManyToManyAssoc {
  readonly name: string
  readonly targetModel: string
  readonly relationName: string
}

interface Associations {
  readonly belongsTo: readonly BelongsToAssoc[]
  readonly hasMany: readonly HasAssoc[]
  readonly hasOne: readonly HasAssoc[]
  readonly manyToMany: readonly ManyToManyAssoc[]
}

// ============================================================================
// Association Detection (same pattern as GORM)
// ============================================================================

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]): Associations {
  const belongsTo: BelongsToAssoc[] = []
  const hasMany: HasAssoc[] = []
  const hasOne: HasAssoc[] = []
  const manyToMany: ManyToManyAssoc[] = []

  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    if (field.relationFromFields && field.relationFromFields.length > 0) {
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKey: field.relationFromFields[0],
        references: field.relationToFields?.[0] ?? 'id',
      })
    } else if (field.isList) {
      const targetModel = allModels.find((m) => m.name === field.type)
      if (!targetModel) continue

      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )

      if (otherSide?.isList) {
        manyToMany.push({
          name: field.name,
          targetModel: field.type,
          relationName: field.relationName ?? `${model.name}To${field.type}`,
        })
      } else {
        const fkField = targetModel.fields.find(
          (f) =>
            f.relationName === field.relationName &&
            f.relationFromFields &&
            f.relationFromFields.length > 0,
        )
        const foreignKey = fkField?.relationFromFields?.[0]
        if (!foreignKey) continue
        const references = fkField?.relationToFields?.[0] ?? 'id'

        hasMany.push({
          name: field.name,
          targetModel: field.type,
          foreignKey,
          references,
          isList: true,
        })
      }
    } else {
      const targetModel = allModels.find((m) => m.name === field.type)
      if (!targetModel) continue

      const fkField = targetModel.fields.find(
        (f) =>
          f.relationName === field.relationName &&
          f.relationFromFields &&
          f.relationFromFields.length > 0,
      )
      const foreignKey = fkField?.relationFromFields?.[0]
      if (!foreignKey) continue
      const references = fkField?.relationToFields?.[0] ?? 'id'

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

// ============================================================================
// Naming Helpers
// ============================================================================

function toSnakeCase(name: string): string {
  return makeSnakeCase(name)
}

function toPascalCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function toModuleName(modelName: string): string {
  return toSnakeCase(modelName)
}

// ============================================================================
// Serde Options
// ============================================================================

export interface SerdeOptions {
  readonly renameAll?: string
}

function buildSerdeAttributes(opts: SerdeOptions): string[] {
  const parts: string[] = []
  if (opts.renameAll) {
    parts.push(`rename_all = "${opts.renameAll}"`)
  }
  if (parts.length === 0) return []
  return [`#[serde(${parts.join(', ')})]`]
}

// ============================================================================
// Enum Generation
// ============================================================================

export function generateEnum(e: DMMF.DatamodelEnum, serde: SerdeOptions = {}): string {
  const variants = e.values.map((v) => {
    const pascalName = v.name.charAt(0).toUpperCase() + v.name.slice(1).toLowerCase()
    return `    #[sea_orm(string_value = "${v.name}")]\n    ${pascalName},`
  })

  const derives =
    '#[derive(Debug, Clone, PartialEq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]'

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

// ============================================================================
// Relation Enum Generation
// ============================================================================

function generateRelationEnum(_model: DMMF.Model, associations: Associations): string {
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

// ============================================================================
// impl Related Generation
// ============================================================================

function generateRelatedImpls(model: DMMF.Model, associations: Associations): string[] {
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

// ============================================================================
// Entity File Generation
// ============================================================================

export function generateEntityFile(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
  serde: SerdeOptions = {},
): string {
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

    let rustType: string
    if (enumNames.has(field.type)) {
      rustType = field.isRequired ? field.type : `Option<${field.type}>`
    } else {
      rustType = prismaTypeToRustType(field.type, field.isRequired)
    }

    const fieldName = toSnakeCase(field.name)

    for (const attr of attrs) {
      fieldLines.push(`    ${attr}`)
    }
    fieldLines.push(`    pub ${fieldName}: ${rustType},`)
  }

  const relationEnum = generateRelationEnum(model, associations)
  const relatedImpls = generateRelatedImpls(model, associations)

  const useLines = ['use sea_orm::entity::prelude::*;', 'use serde::{Deserialize, Serialize};']

  const deriveModel =
    '#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]'

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

// ============================================================================
// M2M Junction Table Entity Generation
// ============================================================================

function generateM2MEntity(
  leftModel: string,
  rightModel: string,
  _allModels: readonly DMMF.Model[],
  serde: SerdeOptions = {},
): string {
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
    '#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]'

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

// ============================================================================
// mod.rs and prelude.rs Generation
// ============================================================================

export function generateModRs(moduleNames: readonly string[]): string {
  return `${moduleNames.map((m) => `pub mod ${m};`).join('\n')}\n`
}

export function generatePreludeRs(models: readonly DMMF.Model[]): string {
  return `${models
    .map((m) => {
      const moduleName = toModuleName(m.name)
      return `pub use super::${moduleName}::Entity as ${m.name};`
    })
    .join('\n')}\n`
}

// ============================================================================
// File Output
// ============================================================================

export async function writeSeaOrmFiles(
  models: readonly DMMF.Model[],
  outDir: string,
  enums: readonly DMMF.DatamodelEnum[],
  serde: SerdeOptions = {},
): Promise<
  { readonly ok: true; readonly value: undefined } | { readonly ok: false; readonly error: string }
> {
  const mkdirResult = await mkdir(outDir)
  if (!mkdirResult.ok) return mkdirResult

  const moduleNames: string[] = []

  // Collect M2M junction tables to generate
  const m2mJunctions = new Set<string>()
  const m2mPairs: { left: string; right: string }[] = []

  for (const model of models) {
    const associations = getAssociations(model, models)
    for (const assoc of associations.manyToMany) {
      const [left, right] =
        model.name < assoc.targetModel
          ? [model.name, assoc.targetModel]
          : [assoc.targetModel, model.name]
      const key = `${left}_${right}`
      if (!m2mJunctions.has(key)) {
        m2mJunctions.add(key)
        m2mPairs.push({ left, right })
      }
    }
  }

  // Generate enum files
  for (const e of enums) {
    const moduleName = toSnakeCase(e.name)
    const useLines = ['use sea_orm::entity::prelude::*;', 'use serde::{Deserialize, Serialize};']
    const code = [...useLines, '', generateEnum(e, serde), ''].join('\n')
    const filePath = join(outDir, `${moduleName}.rs`)
    const writeResult = await writeFile(filePath, code)
    if (!writeResult.ok) return writeResult
    moduleNames.push(moduleName)
    console.log(`wrote ${filePath}`)
  }

  // Generate entity files
  for (const model of models) {
    const code = generateEntityFile(model, models, enums, serde)
    if (!code.trim()) continue

    const moduleName = toModuleName(model.name)
    const filePath = join(outDir, `${moduleName}.rs`)
    const writeResult = await writeFile(filePath, code)
    if (!writeResult.ok) return writeResult
    moduleNames.push(moduleName)
    console.log(`wrote ${filePath}`)
  }

  // Generate M2M junction table files
  for (const pair of m2mPairs) {
    const moduleName = toSnakeCase(`${pair.left}To${pair.right}`)
    const code = generateM2MEntity(pair.left, pair.right, models, serde)
    const filePath = join(outDir, `${moduleName}.rs`)
    const writeResult = await writeFile(filePath, code)
    if (!writeResult.ok) return writeResult
    moduleNames.push(moduleName)
    console.log(`wrote ${filePath}`)
  }

  // Generate prelude.rs
  const preludeCode = generatePreludeRs(models)
  const preludePath = join(outDir, 'prelude.rs')
  const preludeResult = await writeFile(preludePath, preludeCode)
  if (!preludeResult.ok) return preludeResult
  moduleNames.push('prelude')
  console.log(`wrote ${preludePath}`)

  // Generate mod.rs
  moduleNames.sort()
  const modCode = generateModRs(moduleNames)
  const modPath = join(outDir, 'mod.rs')
  const modResult = await writeFile(modPath, modCode)
  if (!modResult.ok) return modResult
  console.log(`wrote ${modPath}`)

  return { ok: true, value: undefined }
}
