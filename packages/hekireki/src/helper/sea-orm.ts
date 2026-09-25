import type { DMMF } from '@prisma/generator-helper'

import { makeSnakeCase } from '../utils/index.js'

const PRISMA_TO_RUST: { [k: string]: string } = {
  String: 'String',
  Int: 'i32',
  BigInt: 'i64',
  Float: 'f64',
  Decimal: 'Decimal',
  Boolean: 'bool',
  // Prisma DateTime is timestamp without time zone on PostgreSQL; sqlx only
  // decodes that as NaiveDateTime (sea-orm's DateTime), not DateTime<Utc>.
  DateTime: 'DateTime',
  Json: 'Json',
  Bytes: 'Vec<u8>',
}

// The Rust type of a DateTime column where it is not the Prisma-scalar default. On SQLite the
// instant is text that is compared as text, and Prisma writes it with exactly three decimals
// (`2030-01-02T03:04:05.000+00:00`); sqlx writes DateTimeUtc with none on a whole second and
// DateTime as `2030-01-02 03:04:05.678`, so the column is a PrismaDateTime (prisma_date_time.rs)
// that writes Prisma's text. sqlx reads a MySQL TIMESTAMP only as DateTime<Utc>.
function rustTypeForNative(field: DMMF.Field, provider: string | undefined) {
  const nativeName = field.nativeType?.[0]
  if (nativeName === 'Timestamptz') return 'DateTimeWithTimeZone'
  if (nativeName === 'Timestamp' && provider === 'mysql') return 'DateTimeUtc'
  if (nativeName === 'Date') return 'Date'
  if (nativeName === 'Time') return 'Time'
  if (field.type === 'DateTime' && provider === 'sqlite') return 'PrismaDateTime'
  return null
}

// For each Rust type a DateTime column can have: how the DateTimeUtc `now` becomes one, and the
// part of an ISO instant (`2024-01-15T10:30:00.000Z`) its FromStr reads.
const DATE_TIME_FORMS: {
  [k: string]: { readonly fromUtc: string; readonly text: readonly [number, number?] }
} = {
  DateTime: { fromUtc: '.naive_utc()', text: [0, -1] },
  DateTimeUtc: { fromUtc: '', text: [0] },
  PrismaDateTime: { fromUtc: '.into()', text: [0] },
  DateTimeWithTimeZone: { fromUtc: '.fixed_offset()', text: [0] },
  Date: { fromUtc: '.date_naive()', text: [0, 10] },
  Time: { fromUtc: '.time()', text: [11, -1] },
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
      return null
    case 'Timestamptz':
      return 'TimestampWithTimeZone'
    case 'Date':
      return 'Date'
    case 'Time':
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
  if (typeof def === 'string') {
    const escaped = def
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"')
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r')
    return `"${escaped}"`
  }
  return null
}

export function buildSeaOrmAttributes(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
  derivedColumn?: string,
  enums?: readonly DMMF.DatamodelEnum[],
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
  const columnName = field.dbName ?? field.name
  const snakeName = derivedColumn ?? makeSnakeCase(field.name)
  if (columnName !== snakeName) {
    columnParts.push(`column_name = "${columnName}"`)
  }

  const colType = resolveSeaOrmColumnType(field)
  if (colType) {
    columnParts.push(`column_type = "${colType}"`)
  }

  // A DateTime default (now() or a literal) is filled in by ActiveModelBehavior, as Prisma Client
  // does: sea-query would write a literal back as `2024-01-15 10:30:00 +00:00`.
  if ((!isPk || isCompositePk) && field.type !== 'DateTime') {
    // An enum default arrives as the Prisma-level value name; the column
    // stores the @map-ped database value.
    const enumMappedDefault =
      field.kind === 'enum' && typeof field.default === 'string'
        ? (enums?.find((e) => e.name === field.type)?.values.find((v) => v.name === field.default)
            ?.dbName ?? null)
        : null
    const defaultVal = formatRustDefault(enumMappedDefault ?? field.default)
    if (defaultVal !== null) {
      columnParts.push(`default_value = ${defaultVal}`)
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
    foreignKeys: readonly string[]
    referencesList: readonly string[]
    onDelete?: string
    onUpdate?: string
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
        foreignKeys: field.relationFromFields,
        referencesList: field.relationToFields ?? ['id'],
        onDelete: field.relationOnDelete,
        onUpdate: field.relationOnUpdate,
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

// UpperCamelCase the way sea-orm's derive macro names Column variants: split on
// underscores, capitalize each part, keep inner camelCase capitals.
function toPascalCase(name: string) {
  return name
    .split('_')
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

// Types that do NOT implement Eq in Rust (f64: NaN != NaN)
const NON_EQ_PRISMA_TYPES = new Set(['Float'])

export function canDeriveEq(fields: readonly DMMF.Field[]) {
  return fields.filter((f) => f.kind !== 'object').every((f) => !NON_EQ_PRISMA_TYPES.has(f.type))
}

function buildSerdeAttributes(opts: { readonly renameAll?: string }) {
  const parts: string[] = []
  if (opts.renameAll) {
    parts.push(`rename_all = "${opts.renameAll}"`)
  }
  if (parts.length === 0) return []
  return [`#[serde(${parts.join(', ')})]`]
}

export function generateEnum(e: DMMF.DatamodelEnum, serde: { readonly renameAll?: string } = {}) {
  const variants = e.values.map((value) => {
    // SCREAMING_SNAKE values must become UpperCamelCase variants, or
    // `Pending_review`-style names trip the non_camel_case_types lint on
    // every user build; the DB value stays intact in string_value.
    const pascalName = value.name
      .split('_')
      .filter((part) => part !== '')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('')
    return `    #[sea_orm(string_value = "${value.dbName ?? value.name}")]\n    ${pascalName},`
  })

  const derives =
    '#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]'

  const serdeAttrs = buildSerdeAttributes(serde)

  return [
    derives,
    ...serdeAttrs,
    `#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "${e.dbName ?? e.name}")]`,
    `pub enum ${e.name} {`,
    ...variants,
    '}',
  ].join('\n')
}

function generateRelationEnum(
  _model: DMMF.Model,
  associations: ReturnType<typeof getAssociations>,
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

  // A bare has_many/has_one derives its join from the target's single
  // Related<Self> impl. With two relations to the same target (Follow
  // follower/following) every variant would resolve to that one impl's
  // columns, so ambiguous variants pin their join with explicit from/to.
  const targetCount = new Map<string, number>()
  for (const assoc of [
    ...associations.belongsTo,
    ...associations.hasMany,
    ...associations.hasOne,
  ]) {
    targetCount.set(assoc.targetModel, (targetCount.get(assoc.targetModel) ?? 0) + 1)
  }
  const isAmbiguous = (targetModel: string) => (targetCount.get(targetModel) ?? 0) > 1

  for (const assoc of associations.belongsTo) {
    const variantName = toPascalCase(assoc.name)
    const targetModule = makeSnakeCase(assoc.targetModel)
    // Composite FKs use sea-orm's tuple syntax: from = "(Column::A, Column::B)".
    const fromCol =
      assoc.foreignKeys.length > 1
        ? `(${assoc.foreignKeys.map((c) => `Column::${toPascalCase(c)}`).join(', ')})`
        : `Column::${toPascalCase(assoc.foreignKey)}`
    const toCol =
      assoc.referencesList.length > 1
        ? `(${assoc.referencesList
            .map((c) => `super::${targetModule}::Column::${toPascalCase(c)}`)
            .join(', ')})`
        : `super::${targetModule}::Column::${toPascalCase(assoc.references)}`
    // Prisma action names match sea-orm's ForeignKeyAction variants verbatim.
    const actionLines = [
      assoc.onUpdate ? `        on_update = "${assoc.onUpdate}"` : null,
      assoc.onDelete ? `        on_delete = "${assoc.onDelete}"` : null,
    ].filter((l) => l !== null)
    variants.push(
      `    #[sea_orm(\n${[`        belongs_to = "super::${targetModule}::Entity"`, `        from = "${fromCol}"`, `        to = "${toCol}"`, ...actionLines].join(',\n')}\n    )]\n    ${variantName},`,
    )
  }

  for (const assoc of associations.hasMany) {
    const variantName = toPascalCase(assoc.name)
    const targetModule = makeSnakeCase(assoc.targetModel)
    variants.push(
      isAmbiguous(assoc.targetModel)
        ? `    #[sea_orm(\n        has_many = "super::${targetModule}::Entity",\n        from = "Column::${toPascalCase(assoc.references)}",\n        to = "super::${targetModule}::Column::${toPascalCase(assoc.foreignKey)}"\n    )]\n    ${variantName},`
        : `    #[sea_orm(has_many = "super::${targetModule}::Entity")]\n    ${variantName},`,
    )
  }

  for (const assoc of associations.hasOne) {
    const variantName = toPascalCase(assoc.name)
    const targetModule = makeSnakeCase(assoc.targetModel)
    variants.push(
      isAmbiguous(assoc.targetModel)
        ? `    #[sea_orm(\n        has_one = "super::${targetModule}::Entity",\n        from = "Column::${toPascalCase(assoc.references)}",\n        to = "super::${targetModule}::Column::${toPascalCase(assoc.foreignKey)}"\n    )]\n    ${variantName},`
        : `    #[sea_orm(has_one = "super::${targetModule}::Entity")]\n    ${variantName},`,
    )
  }

  return [
    '#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]',
    'pub enum Relation {',
    ...variants,
    '}',
  ].join('\n')
}

function generateRelatedImpls(model: DMMF.Model, associations: ReturnType<typeof getAssociations>) {
  const impls: string[] = []

  // Rust allows at most one `impl Related<Target>` per (Self, Target). When several
  // relations point at the same target (self-referential FKs), emit only the first
  // to avoid E0119; the inverse side's `has_many` still resolves against this impl.
  const emittedTargets = new Set<string>()

  for (const assoc of associations.belongsTo) {
    if (emittedTargets.has(assoc.targetModel)) continue
    emittedTargets.add(assoc.targetModel)
    const targetModule = makeSnakeCase(assoc.targetModel)
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
    const targetModule = makeSnakeCase(assoc.targetModel)
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
    const targetModule = makeSnakeCase(assoc.targetModel)
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

  for (const assoc of associations.manyToMany) {
    if (emittedTargets.has(assoc.targetModel)) continue
    emittedTargets.add(assoc.targetModel)
    const targetModule = makeSnakeCase(assoc.targetModel)
    const junctionModule = makeSnakeCase(assoc.relationName)
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
  serde: { readonly renameAll?: string } = {},
  provider?: string,
) {
  const idField = model.fields.find((f) => f.isId)
  const compositePkFieldNames = new Set(model.primaryKey?.fields)
  const isCompositePk = !idField && compositePkFieldNames.size > 0

  if (!(idField || isCompositePk)) return ''

  const tableName = model.dbName ?? model.name
  const associations = getAssociations(model, allModels)
  const enumNames = new Set(enums.map((e) => e.name))

  const scalarFields = model.fields.filter((f) => f.kind !== 'object')
  const fieldLines: string[] = []
  // What before_save sets, as Prisma Client does: an @updatedAt on every save the caller left it
  // out of, a now() or literal default on insert.
  const stampLines: string[] = []
  let stampsNow = false
  let stampsOnInsert = false

  for (const field of scalarFields) {
    const isPk = field.isId || compositePkFieldNames.has(field.name)
    const { ident: fieldName, derivedColumn } = rustFieldIdent(makeSnakeCase(field.name))
    const attrs = buildSeaOrmAttributes(field, isPk, isCompositePk, derivedColumn, enums)

    const nativeOverride = rustTypeForNative(field, provider)
    const elemType = enumNames.has(field.type)
      ? field.type
      : (nativeOverride ?? prismaTypeToRustType(field.type, true))
    const rustType = field.isList
      ? `Vec<${elemType}>`
      : enumNames.has(field.type) || nativeOverride !== null
        ? field.isRequired
          ? elemType
          : `Option<${elemType}>`
        : prismaTypeToRustType(field.type, field.isRequired)

    for (const attr of attrs) {
      fieldLines.push(`    ${attr}`)
    }
    fieldLines.push(`    pub ${fieldName}: ${rustType},`)

    if (field.type !== 'DateTime' || field.isList) continue
    // `now` is a DateTimeUtc at Prisma's millisecond precision; a literal is parsed as the
    // field's own type, which Set leaves the compiler to infer.
    const form = DATE_TIME_FORMS[elemType] ?? DATE_TIME_FORMS.DateTime
    const value =
      field.isUpdatedAt || (isFunctionDefault(field.default) && field.default.name === 'now')
        ? `now${form.fromUtc}`
        : typeof field.default === 'string'
          ? `"${new Date(field.default).toISOString().slice(...form.text)}".parse().unwrap()`
          : null
    if (value === null) continue
    stampsNow ||= value.startsWith('now')
    stampsOnInsert ||= !field.isUpdatedAt
    stampLines.push(
      field.isUpdatedAt
        ? `        if !self.${fieldName}.is_set() {`
        : `        if insert && self.${fieldName}.is_not_set() {`,
      `            self.${fieldName} = Set(${field.isRequired ? value : `Some(${value})`});`,
      '        }',
    )
  }

  const relationEnum = generateRelationEnum(model, associations)
  const relatedImpls = generateRelatedImpls(model, associations)

  const superImports = [
    ...new Set(
      scalarFields.flatMap((f) =>
        enumNames.has(f.type)
          ? [f.type]
          : f.type === 'DateTime' && provider === 'sqlite'
            ? ['PrismaDateTime']
            : [],
      ),
    ),
  ]
    .map((name) => `use super::${makeSnakeCase(name)}::${name};`)
    .toSorted()

  const generatedIdFields = scalarFields.filter(
    (f) => f.type === 'String' && !f.isList && generatedIdExpr(f) !== null,
  )

  // rustfmt puts `super` first.
  const useLines = [
    ...superImports,
    ...(stampsNow ? ['use chrono::SubsecRound;'] : []),
    'use sea_orm::entity::prelude::*;',
    ...(generatedIdFields.length > 0 || stampLines.length > 0 ? ['use sea_orm::Set;'] : []),
    'use serde::{Deserialize, Serialize};',
  ]

  const newFn =
    generatedIdFields.length === 0
      ? []
      : [
          '    fn new() -> Self {',
          '        Self {',
          ...generatedIdFields.map((field) => {
            const { ident } = rustFieldIdent(makeSnakeCase(field.name))
            const generate = generatedIdExpr(field)
            const value = field.isRequired ? generate : `Some(${generate})`
            return `            ${ident}: Set(${value}),`
          }),
          '            ..ActiveModelTrait::default()',
          '        }',
          '    }',
        ]
  const beforeSave =
    stampLines.length === 0
      ? []
      : [
          `    async fn before_save<C>(mut self, _db: &C, ${stampsOnInsert ? 'insert' : '_insert'}: bool) -> Result<Self, DbErr>`,
          '    where',
          '        C: ConnectionTrait,',
          '    {',
          ...(stampsNow ? ['        let now = chrono::Utc::now().trunc_subsecs(3);'] : []),
          ...stampLines,
          '        Ok(self)',
          '    }',
        ]
  const behaviorImpl =
    newFn.length === 0 && beforeSave.length === 0
      ? 'impl ActiveModelBehavior for ActiveModel {}'
      : [
          ...(beforeSave.length > 0 ? ['#[async_trait::async_trait]'] : []),
          'impl ActiveModelBehavior for ActiveModel {',
          ...newFn,
          ...(newFn.length > 0 && beforeSave.length > 0 ? [''] : []),
          ...beforeSave,
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
    '',
  ]

  return lines.join('\n')
}

function pkRustType(modelName: string, models: readonly DMMF.Model[]) {
  const pkField = models.find((m) => m.name === modelName)?.fields.find((f) => f.isId)
  return pkField ? prismaTypeToRustType(pkField.type, true) : 'String'
}

export function generateM2MEntity(
  leftModel: string,
  rightModel: string,
  relationName: string,
  allModels: readonly DMMF.Model[],
  serde: { readonly renameAll?: string } = {},
) {
  const [sortedLeft, sortedRight] =
    leftModel < rightModel ? [leftModel, rightModel] : [rightModel, leftModel]

  const tableName = `_${relationName}`
  const leftModule = makeSnakeCase(sortedLeft)
  const rightModule = makeSnakeCase(sortedRight)
  const leftFk = `${makeSnakeCase(sortedLeft)}_id`
  const rightFk = `${makeSnakeCase(sortedRight)}_id`
  const leftCol = toPascalCase(`${makeSnakeCase(sortedLeft)}Id`)
  const rightCol = toPascalCase(`${makeSnakeCase(sortedRight)}Id`)
  const leftType = pkRustType(sortedLeft, allModels)
  const rightType = pkRustType(sortedRight, allModels)

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
    // Prisma's implicit join table stores its FKs in columns "A"/"B" (models
    // in alphabetical order), not <model>_id.
    '    #[sea_orm(primary_key, auto_increment = false, column_name = "A")]',
    `    pub ${leftFk}: ${leftType},`,
    '    #[sea_orm(primary_key, auto_increment = false, column_name = "B")]',
    `    pub ${rightFk}: ${rightType},`,
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
    '',
  ].join('\n')
}

// The column type of every DateTime on SQLite, written beside the entities that use it. sqlx
// decodes what Prisma or a database default wrote; only the text it writes is Prisma's own.
export const PRISMA_DATE_TIME_RS = `//! A Prisma \`DateTime\` on SQLite, where the instant is text and SQLite compares it as text.
//! Prisma writes it in UTC with exactly three decimals (\`2030-01-02T03:04:05.000+00:00\`);
//! sqlx writes a \`DateTimeUtc\` with none on a whole second and with nanoseconds below a
//! millisecond, so a filter or a key on it would miss Prisma's rows. Filter with
//! \`Column::At.eq(PrismaDateTime(instant))\`: a bare \`DateTimeUtc\` is bound as sqlx writes it.
use sea_orm::entity::prelude::*;
use sea_orm::sea_query::{ArrayType, Nullable, ValueType, ValueTypeErr};
use sea_orm::{ColIdx, TryFromU64, TryGetError, TryGetable};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct PrismaDateTime(pub DateTimeUtc);

impl From<DateTimeUtc> for PrismaDateTime {
    fn from(instant: DateTimeUtc) -> Self {
        Self(instant)
    }
}

impl From<PrismaDateTime> for DateTimeUtc {
    fn from(value: PrismaDateTime) -> Self {
        value.0
    }
}

impl std::str::FromStr for PrismaDateTime {
    type Err = <DateTimeUtc as std::str::FromStr>::Err;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        text.parse().map(Self)
    }
}

impl std::fmt::Display for PrismaDateTime {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl From<PrismaDateTime> for Value {
    fn from(value: PrismaDateTime) -> Self {
        let text = value.0.format("%Y-%m-%dT%H:%M:%S%.3f+00:00").to_string();
        Value::String(Some(Box::new(text)))
    }
}

impl Nullable for PrismaDateTime {
    fn null() -> Value {
        Value::String(None)
    }
}

impl ValueType for PrismaDateTime {
    fn try_from(v: Value) -> Result<Self, ValueTypeErr> {
        match v {
            Value::String(Some(text)) => text.parse().map_err(|_| ValueTypeErr),
            _ => Err(ValueTypeErr),
        }
    }

    fn type_name() -> String {
        "PrismaDateTime".to_owned()
    }

    fn array_type() -> ArrayType {
        ArrayType::String
    }

    fn column_type() -> ColumnType {
        ColumnType::DateTime
    }
}

impl TryGetable for PrismaDateTime {
    fn try_get_by<I: ColIdx>(res: &QueryResult, index: I) -> Result<Self, TryGetError> {
        DateTimeUtc::try_get_by(res, index).map(Self)
    }
}

impl TryFromU64 for PrismaDateTime {
    fn try_from_u64(_: u64) -> Result<Self, DbErr> {
        Err(DbErr::ConvertFromU64("PrismaDateTime"))
    }
}
`

export function generateModRs(moduleNames: readonly string[]) {
  return `${moduleNames.map((m) => `pub mod ${m};`).join('\n')}\n`
}

export function generatePreludeRs(models: readonly DMMF.Model[]) {
  return `${models
    .map((m) => `pub use super::${makeSnakeCase(m.name)}::Entity as ${m.name};`)
    .toSorted()
    .join('\n')}\n`
}

export function collectM2MPairs(models: readonly DMMF.Model[]) {
  const pairs = models.flatMap((model) =>
    getAssociations(model, models).manyToMany.map((assoc) => {
      const [left, right] =
        model.name < assoc.targetModel
          ? [model.name, assoc.targetModel]
          : [assoc.targetModel, model.name]
      return { left, right, relationName: assoc.relationName }
    }),
  )
  const seen = new Set<string>()
  return pairs.filter((pair) => {
    const key = pair.relationName
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
