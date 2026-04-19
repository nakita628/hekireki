import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { DMMF } from '@prisma/generator-helper'

import { makeSnakeCase } from '../utils/index.js'

const PRISMA_TO_GO: Record<string, string> = {
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

  const [nativeName, nativeArgs] = field.nativeType as [string, readonly (string | number)[]]
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
  const parts: string[] = [`column:${columnName}`]

  if (isPk) {
    parts.push('primaryKey')
    if (isAutoincrement(field)) {
      parts.push('autoIncrement')
    }
    if (isFunctionDefault(field.default) && field.default.name === 'uuid') {
      parts.push('type:char(36)')
    }
  }

  if (field.isUnique) {
    parts.push('uniqueIndex')
  }

  // Composite unique / index tags from @@unique and @@index
  for (const tag of compositeIndexTags) {
    parts.push(tag)
  }

  // Native type
  const nativeType = resolveNativeType(field)
  if (nativeType && !isPk) {
    parts.push(`type:${nativeType}`)
  } else if (nativeType && isPk && !isFunctionDefault(field.default)) {
    parts.push(`type:${nativeType}`)
  } else if (
    nativeType &&
    isPk &&
    isFunctionDefault(field.default) &&
    field.default.name !== 'uuid'
  ) {
    parts.push(`type:${nativeType}`)
  }

  // Default value
  if (!isPk || isCompositePk) {
    if (
      field.type === 'DateTime' &&
      isFunctionDefault(field.default) &&
      field.default.name === 'now'
    ) {
      parts.push('autoCreateTime')
    } else if (field.isUpdatedAt) {
      // handled below
    } else {
      const defaultVal = formatGoDefault(field.default)
      if (defaultVal !== null) {
        parts.push(`default:${defaultVal}`)
      }
    }
  } else if (isPk && !isCompositePk) {
    if (
      field.type === 'DateTime' &&
      isFunctionDefault(field.default) &&
      field.default.name === 'now'
    ) {
      parts.push('autoCreateTime')
    }
  }

  if (field.isUpdatedAt) {
    parts.push('autoUpdateTime')
  }

  // not null for required non-PK fields
  if (field.isRequired && !isPk) {
    parts.push('not null')
  }

  return `\`gorm:"${parts.join(';')}" json:"${columnName}"\``
}

function collectCompositeIndexTags(
  model: DMMF.Model,
  indexes: readonly DMMF.Index[],
): ReadonlyMap<string, readonly string[]> {
  const tagMap = new Map<string, string[]>()

  const addTag = (fieldName: string, tag: string) => {
    const existing = tagMap.get(fieldName) ?? []
    existing.push(tag)
    tagMap.set(fieldName, existing)
  }

  // @@unique([a, b]) → uniqueIndex:idx_name on each field
  for (const fields of model.uniqueFields) {
    if (fields.length <= 1) continue
    const cols = fields.map((f) => {
      const fo = model.fields.find((mf) => mf.name === f)
      return fo?.dbName ?? makeSnakeCase(f)
    })
    const idxName = `idx_${cols.join('_')}_unique`
    for (const f of fields) {
      addTag(f, `uniqueIndex:${idxName}`)
    }
  }

  // @@index([a, b]) → index:idx_name on each field
  for (const idx of indexes) {
    if (idx.model !== model.name) continue
    if (idx.type !== 'normal' && idx.type !== 'fulltext') continue
    const idxName =
      idx.dbName ?? idx.name ?? `idx_${idx.fields.map((f) => makeSnakeCase(f.name)).join('_')}`
    for (const f of idx.fields) {
      addTag(f.name, `index:${idxName}`)
    }
  }

  return tagMap
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

function generateRelationFields(model: DMMF.Model, associations: Associations) {
  const lines: string[] = []

  // BelongsTo: relation struct field
  for (const assoc of associations.belongsTo) {
    const fieldName = goFieldName(assoc.name)
    const fkFieldName = goFieldName(assoc.foreignKey)
    const refsFieldName = goFieldName(assoc.references)
    const isAmbiguous =
      fieldName !== assoc.targetModel ||
      associations.belongsTo.filter((a) => a.targetModel === assoc.targetModel).length > 1
    const tagParts: string[] = []
    if (isAmbiguous) tagParts.push(`foreignKey:${fkFieldName}`)
    if (needsReferencesTag(assoc.references)) tagParts.push(`references:${refsFieldName}`)

    if (tagParts.length > 0) {
      lines.push(`\t${fieldName} ${assoc.targetModel} ${buildRelationTag(tagParts)}`)
    } else {
      lines.push(`\t${fieldName} ${assoc.targetModel}`)
    }
  }

  // HasMany
  for (const assoc of associations.hasMany) {
    const fkFieldName = goFieldName(assoc.foreignKey)
    const tagParts = [`foreignKey:${fkFieldName}`]
    if (needsReferencesTag(assoc.references)) {
      tagParts.push(`references:${goFieldName(assoc.references)}`)
    }
    lines.push(`\t${goFieldName(assoc.name)} []${assoc.targetModel} ${buildRelationTag(tagParts)}`)
  }

  // HasOne
  for (const assoc of associations.hasOne) {
    const fkFieldName = goFieldName(assoc.foreignKey)
    const tagParts = [`foreignKey:${fkFieldName}`]
    if (needsReferencesTag(assoc.references)) {
      tagParts.push(`references:${goFieldName(assoc.references)}`)
    }
    lines.push(`\t${goFieldName(assoc.name)} ${assoc.targetModel} ${buildRelationTag(tagParts)}`)
  }

  // ManyToMany
  for (const assoc of associations.manyToMany) {
    const [leftName, rightName] =
      model.name < assoc.targetModel
        ? [model.name, assoc.targetModel]
        : [assoc.targetModel, model.name]
    const joinTable = `_${leftName}To${rightName}`
    lines.push(
      `\t${goFieldName(assoc.name)} []${assoc.targetModel} \`gorm:"many2many:${joinTable};"\``,
    )
  }

  return lines
}

function generateModelStruct(
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

  const lines = [
    `type ${model.name} struct {`,
    ...fieldLines,
    ...(relationLines.length > 0 ? relationLines : []),
    '}',
  ]

  // Add TableName method if dbName differs from default
  if (tableName !== makeSnakeCase(model.name)) {
    lines.push('')
    lines.push(`func (${model.name}) TableName() string {`)
    lines.push(`\treturn "${tableName}"`)
    lines.push('}')
  }

  return lines.join('\n')
}

function collectImports(models: readonly DMMF.Model[]) {
  const imports: string[] = []

  const needsTime = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && f.type === 'DateTime'),
  )
  const needsDatatypes = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && f.type === 'Json'),
  )

  if (needsTime) imports.push('"time"')
  if (needsDatatypes) imports.push('"gorm.io/datatypes"')

  return imports
}

export function generateGormModels(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
  packageName = 'model',
) {
  const idx = indexes ?? []

  const modelBodies = models
    .map((model) => generateModelStruct(model, models, enums, idx))
    .filter((body): body is string => body !== null)

  const imports = collectImports(models)

  const lines: string[] = [`package ${packageName}`]

  if (imports.length > 0) {
    lines.push('')
    if (imports.length === 1) {
      lines.push(`import ${imports[0]}`)
    } else {
      lines.push('import (')
      for (const imp of imports) {
        lines.push(`\t${imp}`)
      }
      lines.push(')')
    }
  }

  lines.push('')
  lines.push(modelBodies.join('\n\n'))
  lines.push('')

  return lines.join('\n')
}

export async function writeGormFile(
  models: readonly DMMF.Model[],
  outPath: string,
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
  packageName = 'model',
): Promise<void> {
  const dir = dirname(outPath)
  await mkdir(dir, { recursive: true })

  const code = generateGormModels(models, enums, indexes, packageName)
  await writeFile(outPath, code)
  console.log(`wrote ${outPath}`)
}
