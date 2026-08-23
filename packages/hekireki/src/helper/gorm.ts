import type { DMMF } from '@prisma/generator-helper'

import { makeSnakeCase } from '../utils/index.js'

const PRISMA_TO_GO: { [k: string]: string } = {
  String: 'string',
  Int: 'int',
  BigInt: 'int64',
  Float: 'float64',
  Decimal: 'float64',
  Boolean: 'bool',
  DateTime: 'time.Time',
  Json: 'datatypes.JSON',
  Bytes: '[]byte',
}

export function prismaTypeToGoType(type: string, isRequired: boolean) {
  const base = PRISMA_TO_GO[type] ?? 'string'
  if (!isRequired && base !== '[]byte' && base !== 'datatypes.JSON') {
    return `*${base}`
  }
  return base
}

function resolveNativeType(field: DMMF.Field) {
  if (!field.nativeType) return null

  const [nativeName, nativeArgs] = field.nativeType
  const args = nativeArgs ?? []

  switch (nativeName) {
    case 'VarChar':
    case 'Char':
      return args.length > 0 ? `varchar(${args[0]})` : null
    case 'Text':
    case 'MediumText':
    case 'LongText':
    case 'TinyText':
      return 'text'
    case 'SmallInt':
    case 'TinyInt':
      return 'smallint'
    case 'MediumInt':
      return 'mediumint'
    case 'DoublePrecision':
    case 'Double':
    case 'Real':
      return 'double precision'
    case 'Decimal':
    case 'Money':
      return args.length >= 2 ? `decimal(${args[0]},${args[1]})` : 'decimal'
    case 'Uuid':
      return 'char(36)'
    case 'Timestamp':
    case 'Timestamptz':
      return 'timestamp'
    case 'Date':
      return 'date'
    case 'Time':
    case 'Timetz':
      return 'time'
    case 'JsonB':
      return 'jsonb'
    case 'Xml':
      return 'xml'
    default:
      return null
  }
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
    foreignKeys: readonly string[]
    referencesList: readonly string[]
    isList: boolean
    onDelete?: string
    onUpdate?: string
  }[] = []
  const hasOne: {
    name: string
    targetModel: string
    foreignKey: string
    references: string
    foreignKeys: readonly string[]
    referencesList: readonly string[]
    isList: boolean
    onDelete?: string
    onUpdate?: string
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
    const foreignKeys = fkField?.relationFromFields ?? [foreignKey]
    const referencesList = fkField?.relationToFields ?? ['id']

    if (field.isList) {
      hasMany.push({
        name: field.name,
        targetModel: field.type,
        foreignKey,
        references,
        foreignKeys,
        referencesList,
        isList: true,
        onDelete: fkField?.relationOnDelete,
        onUpdate: fkField?.relationOnUpdate,
      })
    } else {
      hasOne.push({
        name: field.name,
        targetModel: field.type,
        foreignKey,
        references,
        foreignKeys,
        referencesList,
        isList: false,
        onDelete: fkField?.relationOnDelete,
        onUpdate: fkField?.relationOnUpdate,
      })
    }
  }

  return { belongsTo, hasMany, hasOne, manyToMany }
}

function isFunctionDefault(
  def: DMMF.Field['default'],
): def is { readonly name: string; readonly args: readonly (string | number)[] } {
  return def !== null && typeof def === 'object' && 'name' in def
}

function isAutoincrement(field: DMMF.Field) {
  return isFunctionDefault(field.default) && field.default.name === 'autoincrement'
}

function formatGoDefault(def: DMMF.Field['default']) {
  if (def === undefined || def === null) return null
  if (typeof def === 'boolean') return def ? 'true' : 'false'
  if (typeof def === 'number') return String(def)
  // String/enum literals must be SQL-quoted: bare `default:USER` is read as the
  // identifier/reserved word `USER` (CURRENT_USER), not the literal 'USER'.
  // The value lives inside a backtick struct tag, so `"` and `\` are written
  // as the two-character sequences \" and \\ (reflect.StructTag unquotes
  // them); the SQL single quote doubles per the SQL standard.
  if (typeof def === 'string') {
    const escaped = def
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"')
      .replaceAll("'", "''")
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r')
    return `'${escaped}'`
  }
  return null
}

export function buildGormTags(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
  compositeIndexTags: readonly string[],
  enums?: readonly DMMF.DatamodelEnum[],
) {
  const columnName = field.dbName ?? makeSnakeCase(field.name)
  const isUuidDefault = isFunctionDefault(field.default) && field.default.name === 'uuid'
  const isUlidDefault = isFunctionDefault(field.default) && field.default.name === 'ulid'
  const isNowDefault =
    field.type === 'DateTime' && isFunctionDefault(field.default) && field.default.name === 'now'
  const nativeType = resolveNativeType(field)
  const includeNativeType =
    nativeType && (!isPk || !isFunctionDefault(field.default) || field.default.name !== 'uuid')
  const includeAutoCreate = isNowDefault && (!isPk || isCompositePk || !isCompositePk)
  // An enum default arrives as the Prisma-level value name; the column stores
  // the @map-ped database value. dbgenerated() is a raw DDL expression, valid
  // on any column including the PK.
  const dbGeneratedExpr =
    isFunctionDefault(field.default) &&
    field.default.name === 'dbgenerated' &&
    typeof field.default.args[0] === 'string'
      ? field.default.args[0]
      : null
  const enumMappedDefault = (() => {
    if (!(field.kind === 'enum' && typeof field.default === 'string')) return null
    const value = enums
      ?.find((e) => e.name === field.type)
      ?.values.find((v) => v.name === field.default)
    return formatGoDefault(value?.dbName ?? field.default)
  })()
  const defaultVal =
    dbGeneratedExpr ??
    ((!isPk || isCompositePk) && !isNowDefault && !field.isUpdatedAt
      ? (enumMappedDefault ?? formatGoDefault(field.default))
      : null)

  const parts = [
    `column:${columnName}`,
    isPk ? 'primaryKey' : null,
    isPk && isAutoincrement(field) ? 'autoIncrement' : null,
    isPk && isUuidDefault ? 'type:char(36)' : null,
    isPk && isUlidDefault ? 'type:char(26)' : null,
    field.isUnique ? 'uniqueIndex' : null,
    ...compositeIndexTags,
    includeNativeType ? `type:${nativeType}` : null,
    // Scalar lists need a serializer so GORM can persist the slice; the built-in
    // json serializer works on every dialect without extra deps.
    field.isList && field.kind !== 'object' ? 'serializer:json' : null,
    includeAutoCreate ? 'autoCreateTime' : null,
    defaultVal !== null ? `default:${defaultVal}` : null,
    field.isUpdatedAt ? 'autoUpdateTime' : null,
    field.isRequired && !isPk ? 'not null' : null,
  ].filter((p) => p !== null)

  return `\`gorm:"${parts.join(';')}" json:"${columnName}"\``
}

function collectCompositeIndexTags(model: DMMF.Model, indexes: readonly DMMF.Index[]) {
  // Index names are global (per-schema) in PostgreSQL, so qualify with the table
  // name to avoid `idx_user_id` colliding across tables during AutoMigrate.
  const tableName = model.dbName ?? makeSnakeCase(model.name)

  const uniqueTags = model.uniqueFields
    .filter((fields) => fields.length > 1)
    .flatMap((fields) => {
      const cols = fields.map((f) => {
        const fo = model.fields.find((mf) => mf.name === f)
        return fo?.dbName ?? makeSnakeCase(f)
      })
      const idxName = `idx_${tableName}_${cols.join('_')}_unique`
      return fields.map((f): [string, string] => [f, `uniqueIndex:${idxName}`])
    })

  const indexTags = indexes
    .filter((idx) => idx.model === model.name && (idx.type === 'normal' || idx.type === 'fulltext'))
    .flatMap((idx) => {
      const idxName =
        idx.dbName ??
        idx.name ??
        `idx_${tableName}_${idx.fields.map((f) => makeSnakeCase(f.name)).join('_')}`
      return idx.fields.map((f): [string, string] => [f.name, `index:${idxName}`])
    })

  return [...uniqueTags, ...indexTags].reduce<Map<string, string[]>>((map, [fieldName, tag]) => {
    const existing = map.get(fieldName) ?? []
    map.set(fieldName, [...existing, tag])
    return map
  }, new Map())
}

// Go initialisms that should be ALL CAPS per https://go.dev/wiki/CodeReviewComments#initialisms
const GO_INITIALISMS = new Set([
  'acl',
  'api',
  'ascii',
  'cpu',
  'css',
  'dns',
  'eof',
  'guid',
  'html',
  'http',
  'https',
  'id',
  'ip',
  'json',
  'lhs',
  'qps',
  'ram',
  'rhs',
  'rpc',
  'sla',
  'smtp',
  'sql',
  'ssh',
  'tcp',
  'tls',
  'ttl',
  'udp',
  'ui',
  'uid',
  'uri',
  'url',
  'utf8',
  'uuid',
  'vm',
  'xml',
  'xmpp',
  'xsrf',
  'xss',
])

function splitGoWords(name: string) {
  return name
    .replaceAll(/([a-z0-9])([A-Z])/gu, '$1\0$2')
    .replaceAll(/_+/gu, '\0')
    .split('\0')
    .filter((part) => part !== '')
    .map((part) => {
      const lower = part.toLowerCase()
      return GO_INITIALISMS.has(lower)
        ? lower.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    })
}

// Struct methods this generator itself may emit: a column whose Go name
// matches would be a field and a method with the same name (compile error).
const GENERATED_METHOD_NAMES = new Set(['TableName', 'BeforeCreate'])

export function goFieldName(name: string) {
  const pascal = splitGoWords(name).join('')
  return GENERATED_METHOD_NAMES.has(pascal) ? `${pascal}_` : pascal
}

export function goModelName(name: string) {
  return splitGoWords(name).join('')
}

function generatedIdExpr(field: DMMF.Field) {
  if (!isFunctionDefault(field.default)) return null
  if (field.default.name === 'uuid') {
    return field.default.args[0] === 7 ? 'uuid.Must(uuid.NewV7()).String()' : 'uuid.NewString()'
  }
  // ulid.Make() draws from time-seeded math/rand; feed crypto/rand instead so
  // generated IDs are unpredictable like every other language target.
  if (field.default.name === 'ulid') return 'ulid.MustNew(ulid.Now(), rand.Reader).String()'
  return null
}

function generatedIdFields(model: DMMF.Model) {
  return model.fields.filter(
    (f) => f.kind === 'scalar' && f.type === 'String' && !f.isList && generatedIdExpr(f) !== null,
  )
}

function generateBeforeCreateHook(model: DMMF.Model) {
  const idFields = generatedIdFields(model)
  if (idFields.length === 0) return []
  const assignments = idFields.flatMap((field) => {
    const fieldName = goFieldName(field.name)
    const expr = generatedIdExpr(field)
    return field.isRequired
      ? [`\tif m.${fieldName} == "" {`, `\t\tm.${fieldName} = ${expr}`, '\t}']
      : [
          `\tif m.${fieldName} == nil {`,
          `\t\tgenerated := ${expr}`,
          `\t\tm.${fieldName} = &generated`,
          '\t}',
        ]
  })
  return [
    '',
    `func (m *${goModelName(model.name)}) BeforeCreate(_ *gorm.DB) error {`,
    ...assignments,
    '\treturn nil',
    '}',
  ]
}

function generateStructField(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
  compositeIndexTags: readonly string[],
  enums?: readonly DMMF.DatamodelEnum[],
) {
  const fieldName = goFieldName(field.name)
  const scalarType =
    field.kind === 'enum'
      ? field.isRequired
        ? 'string'
        : '*string'
      : prismaTypeToGoType(field.type, field.isRequired)
  // A scalar list (e.g. `tags String[]`) is a collection, not a scalar; collapse
  // it to a single value loses data. Emit a slice of the element type.
  const goType = field.isList
    ? `[]${field.kind === 'enum' ? 'string' : prismaTypeToGoType(field.type, true)}`
    : scalarType

  const tag = buildGormTags(field, isPk, isCompositePk, compositeIndexTags, enums)
  const tagStr = tag ? ` ${tag}` : ''

  return `\t${fieldName} ${goType}${tagStr}`
}

function needsReferencesTag(references: string) {
  return references !== 'id'
}

const SQL_ACTION: { [k: string]: string } = {
  Cascade: 'CASCADE',
  SetNull: 'SET NULL',
  Restrict: 'RESTRICT',
  NoAction: 'NO ACTION',
  SetDefault: 'SET DEFAULT',
}

function constraintTag(onDelete: string | undefined, onUpdate: string | undefined) {
  const clauses = [
    onUpdate && SQL_ACTION[onUpdate] ? `OnUpdate:${SQL_ACTION[onUpdate]}` : null,
    onDelete && SQL_ACTION[onDelete] ? `OnDelete:${SQL_ACTION[onDelete]}` : null,
  ].filter((c) => c !== null)
  return clauses.length > 0 ? `constraint:${clauses.join(',')}` : null
}

function buildRelationTag(parts: string[]) {
  return `\`gorm:"${parts.join(';')}"\``
}

function generateRelationFields(
  model: DMMF.Model,
  associations: ReturnType<typeof getAssociations>,
) {
  const belongsToLines = associations.belongsTo.map((assoc) => {
    const fieldName = goFieldName(assoc.name)
    const fkFieldName = assoc.foreignKeys.map(goFieldName).join(',')
    const refsFieldName = assoc.referencesList.map(goFieldName).join(',')
    const isComposite = assoc.foreignKeys.length > 1
    const isAmbiguous =
      fieldName !== goModelName(assoc.targetModel) ||
      associations.belongsTo.filter((a) => a.targetModel === assoc.targetModel).length > 1
    const tagParts = [
      isAmbiguous || isComposite ? `foreignKey:${fkFieldName}` : null,
      isComposite || needsReferencesTag(assoc.references) ? `references:${refsFieldName}` : null,
    ].filter((p) => p !== null)
    // A relation back to the owning model must be a pointer: a struct that
    // embeds itself by value is an illegal recursive type in Go.
    const targetType =
      assoc.targetModel === model.name
        ? `*${goModelName(assoc.targetModel)}`
        : goModelName(assoc.targetModel)
    return tagParts.length > 0
      ? `\t${fieldName} ${targetType} ${buildRelationTag(tagParts)}`
      : `\t${fieldName} ${targetType}`
  })

  const hasManyLines = associations.hasMany.map((assoc) => {
    const tagParts = [
      `foreignKey:${assoc.foreignKeys.map(goFieldName).join(',')}`,
      ...(assoc.foreignKeys.length > 1 || needsReferencesTag(assoc.references)
        ? [`references:${assoc.referencesList.map(goFieldName).join(',')}`]
        : []),
      ...[constraintTag(assoc.onDelete, assoc.onUpdate)].filter((c) => c !== null),
    ]
    return `\t${goFieldName(assoc.name)} []${goModelName(assoc.targetModel)} ${buildRelationTag(tagParts)}`
  })

  const hasOneLines = associations.hasOne.map((assoc) => {
    const tagParts = [
      `foreignKey:${assoc.foreignKeys.map(goFieldName).join(',')}`,
      ...(assoc.foreignKeys.length > 1 || needsReferencesTag(assoc.references)
        ? [`references:${assoc.referencesList.map(goFieldName).join(',')}`]
        : []),
      ...[constraintTag(assoc.onDelete, assoc.onUpdate)].filter((c) => c !== null),
    ]
    // A has-one is always a pointer: the paired belongs_to embeds this model
    // by value, so a value here is an illegal mutually recursive type in Go,
    // and Prisma requires the 1:1 back side to be optional anyway.
    return `\t${goFieldName(assoc.name)} *${goModelName(assoc.targetModel)} ${buildRelationTag(tagParts)}`
  })

  const manyToManyLines = associations.manyToMany.map((assoc) => {
    const joinTable = `_${assoc.relationName}`
    return `\t${goFieldName(assoc.name)} []${goModelName(assoc.targetModel)} \`gorm:"many2many:${joinTable};"\``
  })

  return [...belongsToLines, ...hasManyLines, ...hasOneLines, ...manyToManyLines]
}

export function generateModelStruct(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  indexes: readonly DMMF.Index[],
) {
  const idField = model.fields.find((f) => f.isId)
  const compositePkFieldNames = new Set(model.primaryKey?.fields)
  const isCompositePk = !idField && compositePkFieldNames.size > 0

  if (!(idField || isCompositePk)) return null

  const associations = getAssociations(model, allModels)

  const compositeTagMap = collectCompositeIndexTags(model, indexes)

  const tableName = model.dbName ?? makeSnakeCase(model.name)
  const scalarFields = model.fields.filter((f) => f.kind !== 'object')

  const fieldLines = scalarFields.map((field) => {
    const isPk = field.isId || compositePkFieldNames.has(field.name)
    const fieldIndexTags = compositeTagMap.get(field.name) ?? []
    return generateStructField(field, isPk, isCompositePk, fieldIndexTags, enums)
  })

  const relationLines = generateRelationFields(model, associations)

  const tableNameMethod =
    tableName !== makeSnakeCase(model.name)
      ? [
          '',
          `func (${goModelName(model.name)}) TableName() string {`,
          `\treturn "${tableName}"`,
          '}',
        ]
      : []

  return [
    `type ${goModelName(model.name)} struct {`,
    ...fieldLines,
    ...relationLines,
    '}',
    ...tableNameMethod,
    ...generateBeforeCreateHook(model),
  ].join('\n')
}

export function collectImports(models: readonly DMMF.Model[]) {
  const needsTime = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && f.type === 'DateTime'),
  )
  const needsDatatypes = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && f.type === 'Json'),
  )
  const needsUuid = models.some((m) =>
    generatedIdFields(m).some((f) => isFunctionDefault(f.default) && f.default.name === 'uuid'),
  )
  const needsUlid = models.some((m) =>
    generatedIdFields(m).some((f) => isFunctionDefault(f.default) && f.default.name === 'ulid'),
  )
  return [
    needsUlid ? '"crypto/rand"' : null,
    needsTime ? '"time"' : null,
    needsUuid ? '"github.com/google/uuid"' : null,
    needsUlid ? '"github.com/oklog/ulid/v2"' : null,
    needsDatatypes ? '"gorm.io/datatypes"' : null,
    needsUuid || needsUlid ? '"gorm.io/gorm"' : null,
  ].filter((i) => i !== null)
}

export function formatImports(imports: readonly string[]) {
  if (imports.length === 0) return []
  if (imports.length === 1) return ['', `import ${imports[0]}`]
  return ['', 'import (', ...imports.map((imp) => `\t${imp}`), ')']
}
