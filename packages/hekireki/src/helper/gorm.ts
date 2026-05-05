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
  if (typeof def === 'string') return def
  return null
}

export function buildGormTags(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
  compositeIndexTags: readonly string[],
) {
  const columnName = field.dbName ?? makeSnakeCase(field.name)
  const isUuidDefault = isFunctionDefault(field.default) && field.default.name === 'uuid'
  const isNowDefault =
    field.type === 'DateTime' && isFunctionDefault(field.default) && field.default.name === 'now'
  const nativeType = resolveNativeType(field)
  const includeNativeType =
    nativeType && (!isPk || !isFunctionDefault(field.default) || field.default.name !== 'uuid')
  const includeAutoCreate = isNowDefault && (!isPk || isCompositePk || !isCompositePk)
  const defaultVal =
    (!isPk || isCompositePk) && !isNowDefault && !field.isUpdatedAt
      ? formatGoDefault(field.default)
      : null

  const parts = [
    `column:${columnName}`,
    isPk ? 'primaryKey' : null,
    isPk && isAutoincrement(field) ? 'autoIncrement' : null,
    isPk && isUuidDefault ? 'type:char(36)' : null,
    field.isUnique ? 'uniqueIndex' : null,
    ...compositeIndexTags,
    includeNativeType ? `type:${nativeType}` : null,
    includeAutoCreate ? 'autoCreateTime' : null,
    defaultVal !== null ? `default:${defaultVal}` : null,
    field.isUpdatedAt ? 'autoUpdateTime' : null,
    field.isRequired && !isPk ? 'not null' : null,
  ].filter((p): p is string => p !== null)

  return `\`gorm:"${parts.join(';')}" json:"${columnName}"\``
}

function collectCompositeIndexTags(model: DMMF.Model, indexes: readonly DMMF.Index[]) {
  // @@unique([a, b]) → uniqueIndex:idx_name on each field
  const uniqueTags = model.uniqueFields
    .filter((fields) => fields.length > 1)
    .flatMap((fields) => {
      const cols = fields.map((f) => {
        const fo = model.fields.find((mf) => mf.name === f)
        return fo?.dbName ?? makeSnakeCase(f)
      })
      const idxName = `idx_${cols.join('_')}_unique`
      return fields.map((f): [string, string] => [f, `uniqueIndex:${idxName}`])
    })

  // @@index([a, b]) → index:idx_name on each field
  const indexTags = indexes
    .filter((idx) => idx.model === model.name && (idx.type === 'normal' || idx.type === 'fulltext'))
    .flatMap((idx) => {
      const idxName =
        idx.dbName ?? idx.name ?? `idx_${idx.fields.map((f) => makeSnakeCase(f.name)).join('_')}`
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

/**
 * Split a camelCase/PascalCase name into words, applying Go initialism rules.
 * e.g. "userId" -> ["User", "ID"], "avatarUrl" -> ["Avatar", "URL"],
 *      "ipAddress" -> ["IP", "Address"], "createdAt" -> ["Created", "At"]
 */
function splitGoWords(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1\0$2')
    .split('\0')
    .map((part) => {
      const lower = part.toLowerCase()
      return GO_INITIALISMS.has(lower)
        ? lower.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    })
}

export function goFieldName(name: string) {
  return splitGoWords(name).join('')
}

function generateStructField(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
  compositeIndexTags: readonly string[],
  _enumNames: ReadonlySet<string>,
) {
  const fieldName = goFieldName(field.name)
  const goType =
    field.kind === 'enum'
      ? field.isRequired
        ? 'string'
        : '*string'
      : prismaTypeToGoType(field.type, field.isRequired)

  const tag = buildGormTags(field, isPk, isCompositePk, compositeIndexTags)
  const tagStr = tag ? ` ${tag}` : ''

  return `\t${fieldName} ${goType}${tagStr}`
}

function needsReferencesTag(references: string) {
  return references !== 'id'
}

function buildRelationTag(parts: string[]) {
  return `\`gorm:"${parts.join(';')}"\``
}

function generateRelationFields(
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
  const belongsToLines = associations.belongsTo.map((assoc) => {
    const fieldName = goFieldName(assoc.name)
    const fkFieldName = goFieldName(assoc.foreignKey)
    const refsFieldName = goFieldName(assoc.references)
    const isAmbiguous =
      fieldName !== assoc.targetModel ||
      associations.belongsTo.filter((a) => a.targetModel === assoc.targetModel).length > 1
    const tagParts = [
      isAmbiguous ? `foreignKey:${fkFieldName}` : null,
      needsReferencesTag(assoc.references) ? `references:${refsFieldName}` : null,
    ].filter((p): p is string => p !== null)
    return tagParts.length > 0
      ? `\t${fieldName} ${assoc.targetModel} ${buildRelationTag(tagParts)}`
      : `\t${fieldName} ${assoc.targetModel}`
  })

  const hasManyLines = associations.hasMany.map((assoc) => {
    const tagParts = [
      `foreignKey:${goFieldName(assoc.foreignKey)}`,
      ...(needsReferencesTag(assoc.references)
        ? [`references:${goFieldName(assoc.references)}`]
        : []),
    ]
    return `\t${goFieldName(assoc.name)} []${assoc.targetModel} ${buildRelationTag(tagParts)}`
  })

  const hasOneLines = associations.hasOne.map((assoc) => {
    const tagParts = [
      `foreignKey:${goFieldName(assoc.foreignKey)}`,
      ...(needsReferencesTag(assoc.references)
        ? [`references:${goFieldName(assoc.references)}`]
        : []),
    ]
    return `\t${goFieldName(assoc.name)} ${assoc.targetModel} ${buildRelationTag(tagParts)}`
  })

  const manyToManyLines = associations.manyToMany.map((assoc) => {
    const [leftName, rightName] =
      model.name < assoc.targetModel
        ? [model.name, assoc.targetModel]
        : [assoc.targetModel, model.name]
    const joinTable = `_${leftName}To${rightName}`
    return `\t${goFieldName(assoc.name)} []${assoc.targetModel} \`gorm:"many2many:${joinTable};"\``
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
  const compositePkFieldNames = new Set(model.primaryKey?.fields ?? [])
  const isCompositePk = !idField && compositePkFieldNames.size > 0

  if (!(idField || isCompositePk)) return null

  const associations = getAssociations(model, allModels)
  const enumNames = new Set((enums ?? []).map((e) => e.name))
  const compositeTagMap = collectCompositeIndexTags(model, indexes)

  const tableName = model.dbName ?? makeSnakeCase(model.name)
  const scalarFields = model.fields.filter((f) => f.kind !== 'object')

  const fieldLines = scalarFields.map((field) => {
    const isPk = field.isId || compositePkFieldNames.has(field.name)
    const fieldIndexTags = compositeTagMap.get(field.name) ?? []
    return generateStructField(field, isPk, isCompositePk, fieldIndexTags, enumNames)
  })

  const relationLines = generateRelationFields(model, associations)

  const tableNameMethod =
    tableName !== makeSnakeCase(model.name)
      ? ['', `func (${model.name}) TableName() string {`, `\treturn "${tableName}"`, '}']
      : []

  return [
    `type ${model.name} struct {`,
    ...fieldLines,
    ...relationLines,
    '}',
    ...tableNameMethod,
  ].join('\n')
}

export function collectImports(models: readonly DMMF.Model[]) {
  const needsTime = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && f.type === 'DateTime'),
  )
  const needsDatatypes = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && f.type === 'Json'),
  )
  return [needsTime ? '"time"' : null, needsDatatypes ? '"gorm.io/datatypes"' : null].filter(
    (i): i is string => i !== null,
  )
}

export function formatImports(imports: readonly string[]) {
  if (imports.length === 0) return []
  if (imports.length === 1) return ['', `import ${imports[0]}`]
  return ['', 'import (', ...imports.map((imp) => `\t${imp}`), ')']
}
