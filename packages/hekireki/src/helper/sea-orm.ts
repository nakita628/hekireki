import type { DMMF } from '@prisma/generator-helper'

import { makeSnakeCase } from '../utils/index.js'

const PRISMA_TO_RUST: { [k: string]: string } = {
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

const RUST_KEYWORDS = new Set([
  'as',
  'break',
  'const',
  'continue',
  'crate',
  'dyn',
  'else',
  'enum',
  'extern',
  'false',
  'fn',
  'for',
  'if',
  'impl',
  'in',
  'let',
  'loop',
  'match',
  'mod',
  'move',
  'mut',
  'pub',
  'ref',
  'return',
  'self',
  'Self',
  'static',
  'struct',
  'super',
  'trait',
  'true',
  'type',
  'unsafe',
  'use',
  'where',
  'while',
  'async',
  'await',
  'abstract',
  'become',
  'box',
  'do',
  'final',
  'macro',
  'override',
  'priv',
  'typeof',
  'unsized',
  'virtual',
  'yield',
  'try',
  'gen',
])
// These four keywords cannot be written as raw identifiers (`r#self` is illegal),
// so a field named after one is renamed and its column preserved via column_name.
const RUST_NON_RAW = new Set(['self', 'Self', 'crate', 'super'])

// Maps a snake_case field name to a valid Rust struct-field identifier, plus the
// column name sea-orm will derive from that identifier (it strips a leading r#).
function rustFieldIdent(snake: string) {
  if (!RUST_KEYWORDS.has(snake)) return { ident: snake, derivedColumn: snake }
  if (RUST_NON_RAW.has(snake)) return { ident: `${snake}_`, derivedColumn: `${snake}_` }
  return { ident: `r#${snake}`, derivedColumn: snake }
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

function generatedIdExpr(field: DMMF.Field) {
  if (!isFunctionDefault(field.default)) return null
  if (field.default.name === 'uuid') {
    return field.default.args[0] === 7
      ? 'uuid::Uuid::now_v7().to_string()'
      : 'uuid::Uuid::new_v4().to_string()'
  }
  // Ulid::generate is the ulid crate 3.x API (1.x/2.x had Ulid::new).
  if (field.default.name === 'ulid') return 'ulid::Ulid::generate().to_string()'
  return null
}

function formatRustDefault(def: DMMF.Field['default']) {
  if (def === undefined || def === null) return null
  if (typeof def === 'boolean') return def ? 'true' : 'false'
  if (typeof def === 'number') return String(def)
  if (typeof def === 'string') return `"${def}"`
  return null
}

export function buildSeaOrmAttributes(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
  derivedColumn?: string,
) {
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

  // column_name: emit when the real column differs from the one sea-orm derives
  // from the (possibly keyword-escaped) Rust field identifier.
  const columnName = field.dbName ?? makeSnakeCase(field.name)
  const snakeName = derivedColumn ?? makeSnakeCase(field.name)
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

export function toSnakeCase(name: string) {
  return makeSnakeCase(name)
}

function toPascalCase(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function toModuleName(modelName: string) {
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
    // SCREAMING_SNAKE values must become UpperCamelCase variants, or
    // `Pending_review`-style names trip the non_camel_case_types lint on
    // every user build; the DB value stays intact in string_value.
    const pascalName = v.name
      .split('_')
      .filter((part) => part !== '')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('')
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

  // Rust allows at most one `impl Related<Target>` per (Self, Target). When several
  // relations point at the same target (self-referential FKs), emit only the first
  // to avoid E0119; the inverse side's `has_many` still resolves against this impl.
  const emittedTargets = new Set<string>()

  for (const assoc of associations.belongsTo) {
    if (emittedTargets.has(assoc.targetModel)) continue
    emittedTargets.add(assoc.targetModel)
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
    if (emittedTargets.has(assoc.targetModel)) continue
    emittedTargets.add(assoc.targetModel)
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
    if (emittedTargets.has(assoc.targetModel)) continue
    emittedTargets.add(assoc.targetModel)
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
    if (emittedTargets.has(assoc.targetModel)) continue
    emittedTargets.add(assoc.targetModel)
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
    const { ident: fieldName, derivedColumn } = rustFieldIdent(toSnakeCase(field.name))
    const attrs = buildSeaOrmAttributes(field, isPk, isCompositePk, derivedColumn)

    const elemType = enumNames.has(field.type) ? field.type : prismaTypeToRustType(field.type, true)
    const rustType = field.isList
      ? `Vec<${elemType}>`
      : enumNames.has(field.type)
        ? field.isRequired
          ? field.type
          : `Option<${field.type}>`
        : prismaTypeToRustType(field.type, field.isRequired)

    for (const attr of attrs) {
      fieldLines.push(`    ${attr}`)
    }
    fieldLines.push(`    pub ${fieldName}: ${rustType},`)
  }

  const relationEnum = generateRelationEnum(model, associations)
  const relatedImpls = generateRelatedImpls(model, associations)

  const enumImports = [
    ...new Set(scalarFields.filter((f) => enumNames.has(f.type)).map((f) => f.type)),
  ]
    .sort()
    .map((name) => `use super::${toSnakeCase(name)}::${name};`)

  const generatedIdFields = scalarFields.filter(
    (f) => f.type === 'String' && !f.isList && generatedIdExpr(f) !== null,
  )

  const useLines = [
    'use sea_orm::entity::prelude::*;',
    ...(generatedIdFields.length > 0 ? ['use sea_orm::Set;'] : []),
    'use serde::{Deserialize, Serialize};',
    ...enumImports,
  ]

  const behaviorImpl =
    generatedIdFields.length === 0
      ? 'impl ActiveModelBehavior for ActiveModel {}'
      : [
          'impl ActiveModelBehavior for ActiveModel {',
          '    fn new() -> Self {',
          '        Self {',
          ...generatedIdFields.map((field) => {
            const { ident } = rustFieldIdent(toSnakeCase(field.name))
            const generate = generatedIdExpr(field)
            const value = field.isRequired ? generate : `Some(${generate})`
            return `            ${ident}: Set(${value}),`
          }),
          '            ..ActiveModelTrait::default()',
          '        }',
          '    }',
          '}',
        ].join('\n')

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
    behaviorImpl,
  ]

  return lines.join('\n')
}

export function generateM2MEntity(
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

export function collectM2MPairs(models: readonly DMMF.Model[]) {
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
