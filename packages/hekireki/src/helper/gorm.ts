import type { DMMF } from '@prisma/generator-helper'

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
    // A time's precision and zone are kept: `timestamp` would turn a timestamptz column into
    // one without a zone, and a (0) into the dialect's default.
    case 'Timestamp':
    case 'Timestamptz':
    case 'DateTime':
    case 'Time':
    case 'Timetz': {
      const name = nativeName.toLowerCase()
      return args.length > 0 ? `${name}(${args[0]})` : name
    }
    case 'Date':
      return 'date'
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

function formatGoDefault(def: DMMF.Field['default'], type: string, kind: DMMF.FieldKind) {
  if (def === undefined || def === null) return null
  if (typeof def === 'boolean') return def ? 'true' : 'false'
  if (typeof def === 'number') return String(def)
  if (typeof def !== 'string') return null
  // BigInt and Decimal literals reach the DMMF as strings; GORM parses an
  // integer or float column's default with strconv, which a quote fails.
  if (type === 'BigInt' || type === 'Decimal') return def
  // The value lives inside a backtick struct tag, so `"` and `\` are written
  // as the two-character sequences \" and \\ (reflect.StructTag unquotes
  // them), and a `;` as \\; (GORM's tag parser rejoins what it escapes).
  // Quoted, so `default:USER` is not read as the identifier USER. A string
  // column's default is a value to GORM: it trims the quotes and writes the
  // rest into the row, so a `'` inside is not doubled. Every other default,
  // and a string with parentheses, is an SQL expression GORM puts into DDL as
  // it is, where the SQL quote doubles.
  const isValue =
    (type === 'String' || kind === 'enum') && !(def.includes('(') && def.includes(')'))
  const escaped = (isValue ? def : def.replaceAll("'", "''"))
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll(';', '\\\\;')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
  return `'${escaped}'`
}

/** Whether a field is one DateTime, held by one of the time types written beside the models. */
function isDateTimeScalar(field: DMMF.Field) {
  return field.kind === 'scalar' && field.type === 'DateTime' && !field.isList
}

/** Whether a field is a DateTime[] (PostgreSQL), held by one of the list types beside the models. */
function isDateTimeList(field: DMMF.Field) {
  return field.kind === 'scalar' && field.type === 'DateTime' && field.isList
}

/**
 * The type written beside the models that holds a DateTime field: a date or a time of day where
 * the native type keeps only that much of it, an instant otherwise; a list of them for a
 * DateTime[].
 */
function dateTimeGoType(field: DMMF.Field) {
  const nativeName = field.nativeType?.[0]
  const element =
    nativeName === 'Date'
      ? 'Date'
      : nativeName === 'Time' || nativeName === 'Timetz'
        ? 'TimeOfDay'
        : 'DateTime'
  return field.isList ? (`${element}List` as const) : element
}

export function buildGormTags(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
  compositeIndexTags: readonly string[],
  enums?: readonly DMMF.DatamodelEnum[],
  provider?: string,
) {
  const columnName = field.dbName ?? field.name
  const isUuidDefault = isFunctionDefault(field.default) && field.default.name === 'uuid'
  const isUlidDefault = isFunctionDefault(field.default) && field.default.name === 'ulid'
  const isNowDefault =
    field.type === 'DateTime' && isFunctionDefault(field.default) && field.default.name === 'now'
  const nativeType = resolveNativeType(field)
  const includeNativeType =
    nativeType && (!isPk || !isFunctionDefault(field.default) || field.default.name !== 'uuid')
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
    return formatGoDefault(value?.dbName ?? field.default, field.type, field.kind)
  })()
  // A DateTime literal is written as the model writes the value (BeforeCreate fills it, so this
  // is what the table's DDL and a create that skips hooks see): an ISO string on SQLite, where
  // the text is compared, and the UTC value elsewhere.
  const dateTimeDefault = (() => {
    if (!(isDateTimeScalar(field) && typeof field.default === 'string')) return null
    const iso = new Date(field.default).toISOString()
    const goType = dateTimeGoType(field)
    if (goType === 'Date') return `'${iso.slice(0, 10)}'`
    if (goType === 'TimeOfDay') return `'${iso.slice(11, 23)}'`
    return provider === 'sqlite'
      ? `'${iso.replace('Z', '+00:00')}'`
      : `'${iso.slice(0, 10)} ${iso.slice(11, 23)}'`
  })()
  const defaultVal =
    dbGeneratedExpr ??
    dateTimeDefault ??
    ((!isPk || isCompositePk) && !isNowDefault && !field.isUpdatedAt
      ? (enumMappedDefault ?? formatGoDefault(field.default, field.type, field.kind))
      : null)
  // GORM fills a time field named CreatedAt or UpdatedAt on its own, with the application's
  // clock bound as a time.Time the driver formats; the hooks fill what the schema asks for.
  const fieldName = goFieldName(field.name)
  const isDateTime = isDateTimeScalar(field)

  const parts = [
    `column:${columnName}`,
    isPk ? 'primaryKey' : null,
    isPk && isAutoincrement(field) ? 'autoIncrement' : null,
    isPk && isUuidDefault ? 'type:char(36)' : null,
    isPk && isUlidDefault ? 'type:char(26)' : null,
    field.isUnique ? 'uniqueIndex' : null,
    ...compositeIndexTags,
    // A DateTime[] is a PostgreSQL array, `timestamp(3)[]` unless the native type says otherwise,
    // which the list type writes and reads as Prisma Client does.
    isDateTimeList(field)
      ? `type:${nativeType ?? 'timestamp(3)'}[]`
      : includeNativeType
        ? `type:${nativeType}`
        : null,
    // Other scalar lists need a serializer so GORM can persist the slice; the built-in
    // json serializer works on every dialect without extra deps.
    field.isList && field.kind !== 'object' && !isDateTimeList(field) ? 'serializer:json' : null,
    defaultVal !== null ? `default:${defaultVal}` : null,
    isDateTime && fieldName === 'CreatedAt' ? 'autoCreateTime:false' : null,
    isDateTime && fieldName === 'UpdatedAt' ? 'autoUpdateTime:false' : null,
    field.isRequired && !isPk ? 'not null' : null,
  ].filter((p) => p !== null)

  return `\`gorm:"${parts.join(';')}" json:"${columnName}"\``
}

function collectCompositeIndexTags(model: DMMF.Model, indexes: readonly DMMF.Index[]) {
  // An index Prisma left unnamed is named as Prisma Migrate names it
  // (`Post_authorId_idx`, `User_email_key`), so AutoMigrate and the migration
  // agree; index names are global per schema in PostgreSQL either way.
  const tableName = model.dbName ?? model.name

  const uniqueTags = model.uniqueFields
    .filter((fields) => fields.length > 1)
    .flatMap((fields) => {
      const cols = fields.map((f) => {
        const fo = model.fields.find((mf) => mf.name === f)
        return fo?.dbName ?? f
      })
      const idxName = `${tableName}_${cols.join('_')}_key`
      return fields.map((f): [string, string] => [f, `uniqueIndex:${idxName}`])
    })

  const indexTags = indexes
    .filter((idx) => idx.model === model.name && (idx.type === 'normal' || idx.type === 'fulltext'))
    .flatMap((idx) => {
      const idxName =
        idx.dbName ??
        idx.name ??
        `${tableName}_${idx.fields.map((f) => model.fields.find((mf) => mf.name === f.name)?.dbName ?? f.name).join('_')}_idx`
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
const GENERATED_METHOD_NAMES = new Set(['TableName', 'BeforeCreate', 'BeforeUpdate'])

export function goFieldName(name: string) {
  const pascal = splitGoWords(name).join('')
  return GENERATED_METHOD_NAMES.has(pascal) ? `${pascal}_` : pascal
}

function goModelName(name: string) {
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
  // Prisma makes these in its client, not in the database: without a hook the
  // key would be "" for the first row and a conflict for the second.
  if (field.default.name === 'cuid') {
    return field.default.args[0] === 2 ? 'cuid2.Generate()' : 'cuid.New()'
  }
  if (field.default.name === 'nanoid') {
    return typeof field.default.args[0] === 'number'
      ? `gonanoid.Must(${field.default.args[0]})`
      : 'gonanoid.Must()'
  }
  return null
}

function generatedIdFields(model: DMMF.Model) {
  return model.fields.filter(
    (f) => f.kind === 'scalar' && f.type === 'String' && !f.isList && generatedIdExpr(f) !== null,
  )
}

/**
 * The value Prisma Client gives a DateTime on create when none is given: `now` (the clock of the
 * hook) for `now()` and `@updatedAt`, the instant of a literal default, or null where it gives
 * none.
 *
 * @example
 * ```go
 * time.Date(2020, 2, 29, 23, 59, 59, 999000000, time.UTC)
 * ```
 */
function createdTimeExpr(field: DMMF.Field) {
  if (!isDateTimeScalar(field)) return null
  if (field.isUpdatedAt || (isFunctionDefault(field.default) && field.default.name === 'now')) {
    return 'now'
  }
  if (typeof field.default !== 'string') return null
  const at = new Date(field.default)
  return `time.Date(${at.getUTCFullYear()}, ${at.getUTCMonth() + 1}, ${at.getUTCDate()}, ${at.getUTCHours()}, ${at.getUTCMinutes()}, ${at.getUTCSeconds()}, ${at.getUTCMilliseconds() * 1_000_000}, time.UTC)`
}

// Prisma Client makes these values itself rather than leave them to the table: a key from
// uuid(), cuid(), ulid() or nanoid(), and a DateTime from now(), @updatedAt or a literal, in UTC
// to the millisecond (SQLite's CURRENT_TIMESTAMP writes other text). A value the caller set is
// kept.
function generateBeforeCreateHook(model: DMMF.Model) {
  const assignments = model.fields.flatMap((field) => {
    const fieldName = goFieldName(field.name)
    const idExpr =
      field.kind === 'scalar' && field.type === 'String' && !field.isList
        ? generatedIdExpr(field)
        : null
    if (idExpr !== null) {
      return field.isRequired
        ? [`\tif m.${fieldName} == "" {`, `\t\tm.${fieldName} = ${idExpr}`, '\t}']
        : [
            `\tif m.${fieldName} == nil {`,
            `\t\tgenerated := ${idExpr}`,
            `\t\tm.${fieldName} = &generated`,
            '\t}',
          ]
    }
    const timeExpr = createdTimeExpr(field)
    if (timeExpr === null) return []
    const value = `${dateTimeGoType(field)}{Time: ${timeExpr}}`
    return field.isRequired
      ? [`\tif m.${fieldName}.IsZero() {`, `\t\tm.${fieldName} = ${value}`, '\t}']
      : [`\tif m.${fieldName} == nil {`, `\t\tm.${fieldName} = &${value}`, '\t}']
  })
  if (assignments.length === 0) return []
  const usesNow = model.fields.some((field) => createdTimeExpr(field) === 'now')
  return [
    '',
    `func (m *${goModelName(model.name)}) BeforeCreate(${usesNow ? 'tx' : '_'} *gorm.DB) error {`,
    ...(usesNow ? ['\tnow := tx.NowFunc().UTC().Truncate(time.Millisecond)'] : []),
    ...assignments,
    '\treturn nil',
    '}',
  ]
}

// Prisma Client stamps every @updatedAt on each update; GORM's own autoUpdateTime binds the
// application's clock as a time.Time, past the generated type, and GORM calls this hook on
// Update, Updates and Save alike. A value the update sets itself is kept.
function generateBeforeUpdateHook(model: DMMF.Model) {
  const stamped = model.fields.filter((field) => isDateTimeScalar(field) && field.isUpdatedAt)
  if (stamped.length === 0) return []
  return [
    '',
    `func (*${goModelName(model.name)}) BeforeUpdate(tx *gorm.DB) error {`,
    '\tnow := tx.NowFunc().UTC().Truncate(time.Millisecond)',
    ...stamped.flatMap((field) => {
      const fieldName = goFieldName(field.name)
      return [
        `\tif !tx.Statement.Changed("${fieldName}") {`,
        `\t\ttx.Statement.SetColumn("${fieldName}", ${field.isRequired ? '' : '&'}${dateTimeGoType(field)}{Time: now})`,
        '\t}',
      ]
    }),
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
  provider?: string,
) {
  const fieldName = goFieldName(field.name)
  // GORM skips a zero value in a column with a default and lets the default
  // in: `false` under `@default(true)` would be stored as true. A pointer
  // tells the two apart, as GORM's documentation advises: nil takes the
  // default, a pointer to the zero value is stored as it is.
  const def = field.default
  const hasNonZeroDefault =
    field.kind === 'scalar' &&
    !isPk &&
    ['Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'String'].includes(field.type) &&
    (def === true ||
      (typeof def === 'number' && def !== 0) ||
      (typeof def === 'string' && (field.type === 'String' ? def !== '' : Number(def) !== 0)))
  const scalarType =
    field.kind === 'enum'
      ? field.isRequired
        ? 'string'
        : '*string'
      : prismaTypeToGoType(field.type, field.isRequired && !hasNonZeroDefault)
  // A scalar list (e.g. `tags String[]`) is a collection, not a scalar; collapse
  // it to a single value loses data. Emit a slice of the element type.
  const goType = isDateTimeList(field)
    ? dateTimeGoType(field)
    : field.isList
      ? `[]${field.kind === 'enum' ? 'string' : prismaTypeToGoType(field.type, true)}`
      : isDateTimeScalar(field)
        ? `${field.isRequired ? '' : '*'}${dateTimeGoType(field)}`
        : scalarType

  return [
    fieldName,
    goType,
    buildGormTags(field, isPk, isCompositePk, compositeIndexTags, enums, provider),
  ]
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
    // GORM guesses a belongs-to key as the field's name and the referenced
    // field's (`User` + `ID`); a key named otherwise (`ownerId`) is named.
    const isGuessed = fkFieldName === `${fieldName}${refsFieldName}`
    const tagParts = [
      isAmbiguous || isComposite || !isGuessed ? `foreignKey:${fkFieldName}` : null,
      isComposite || needsReferencesTag(assoc.references) ? `references:${refsFieldName}` : null,
    ].filter((p) => p !== null)
    // A relation back to the owning model must be a pointer: a struct that
    // embeds itself by value is an illegal recursive type in Go.
    const targetType =
      assoc.targetModel === model.name
        ? `*${goModelName(assoc.targetModel)}`
        : goModelName(assoc.targetModel)
    return tagParts.length > 0
      ? [fieldName, targetType, buildRelationTag(tagParts)]
      : [fieldName, targetType]
  })

  const hasManyLines = associations.hasMany.map((assoc) => {
    const tagParts = [
      `foreignKey:${assoc.foreignKeys.map(goFieldName).join(',')}`,
      ...(assoc.foreignKeys.length > 1 || needsReferencesTag(assoc.references)
        ? [`references:${assoc.referencesList.map(goFieldName).join(',')}`]
        : []),
      ...[constraintTag(assoc.onDelete, assoc.onUpdate)].filter((c) => c !== null),
    ]
    return [
      goFieldName(assoc.name),
      `[]${goModelName(assoc.targetModel)}`,
      buildRelationTag(tagParts),
    ]
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
    return [
      goFieldName(assoc.name),
      `*${goModelName(assoc.targetModel)}`,
      buildRelationTag(tagParts),
    ]
  })

  // Prisma's join table has two columns, A for the model whose name sorts
  // first and B for the other, where GORM would look for `post_id`/`tag_id`.
  const manyToManyLines = associations.manyToMany.map((assoc) => {
    const joinTable = `_${assoc.relationName}`
    const [own, related] = model.name < assoc.targetModel ? ['A', 'B'] : ['B', 'A']
    return [
      goFieldName(assoc.name),
      `[]${goModelName(assoc.targetModel)}`,
      `\`gorm:"many2many:${joinTable};joinForeignKey:${own};joinReferences:${related}"\``,
    ]
  })

  return [...belongsToLines, ...hasManyLines, ...hasOneLines, ...manyToManyLines]
}

/**
 * Lays struct fields out as gofmt does: each column is as wide as its widest
 * cell plus one space, over a run of lines that all have a cell after it. A
 * field without a tag ends the run of the type column, not of the names.
 *
 * @example
 * ```go
 * 	ID        int       `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
 * 	UserID    *string   `gorm:"column:userId" json:"userId"`
 * 	CreatedAt time.Time `gorm:"column:createdAt;autoCreateTime;not null" json:"createdAt"`
 * 	User      User
 * 	Comments  []Comment `gorm:"foreignKey:PostID"`
 * ```
 */
function alignFields(rows: readonly (readonly string[])[]) {
  const width = (i: number, column: number) => {
    const breaks = (row: readonly string[]) => row.length - 1 <= column
    const start = rows.slice(0, i).findLastIndex(breaks) + 1
    const end = rows.findIndex((row, j) => j > i && breaks(row))
    const run = rows.slice(start, end === -1 ? rows.length : end)
    return Math.max(...run.map((row) => row[column].length)) + 1
  }
  return rows.map(
    (row, i) =>
      `\t${row.map((cell, column) => (column < row.length - 1 ? cell.padEnd(width(i, column)) : cell)).join('')}`,
  )
}

export function generateModelStruct(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  indexes: readonly DMMF.Index[],
  provider?: string,
) {
  const idField = model.fields.find((f) => f.isId)
  const compositePkFieldNames = new Set(model.primaryKey?.fields)
  const isCompositePk = !idField && compositePkFieldNames.size > 0

  if (!(idField || isCompositePk)) return null

  const associations = getAssociations(model, allModels)

  const compositeTagMap = collectCompositeIndexTags(model, indexes)

  const tableName = model.dbName ?? model.name
  const scalarFields = model.fields.filter((f) => f.kind !== 'object')

  const fieldLines = scalarFields.map((field) => {
    const isPk = field.isId || compositePkFieldNames.has(field.name)
    const fieldIndexTags = compositeTagMap.get(field.name) ?? []
    return generateStructField(field, isPk, isCompositePk, fieldIndexTags, enums, provider)
  })

  const relationLines = generateRelationFields(model, associations)

  // GORM would pluralise the snake_cased struct name (Warehouse -> warehouses);
  // the table is Prisma's, so every model says which.
  const tableNameMethod = [
    '',
    `func (${goModelName(model.name)}) TableName() string {`,
    `\treturn "${tableName}"`,
    '}',
  ]

  return [
    `type ${goModelName(model.name)} struct {`,
    ...alignFields([...fieldLines, ...relationLines]),
    '}',
    ...tableNameMethod,
    ...generateBeforeCreateHook(model),
    ...generateBeforeUpdateHook(model),
  ].join('\n')
}

function hasImplicitManyToMany(models: readonly DMMF.Model[]) {
  return models.some((model) => getAssociations(model, models).manyToMany.length > 0)
}

/**
 * GORM's default naming strategy snake_cases and pluralises a join table's
 * name (`_PostToTag` becomes `_post_to_tags`) and lowercases its columns (`A`
 * becomes `a`). Prisma's implicit many-to-many tables keep their names only
 * under a strategy that leaves names as they are; every other name in the
 * file is given in a tag or by `TableName()`, so nothing else changes with it.
 */
export function generateNamingStrategy(models: readonly DMMF.Model[], packageName: string) {
  if (!hasImplicitManyToMany(models)) return []
  return [
    '',
    '// NamingStrategy keeps the names Prisma gave its many-to-many join tables',
    '// (`_AToB`, columns `A` and `B`), which GORM would otherwise snake_case,',
    '// pluralise and lowercase. Open the connection with it:',
    '//',
    `//\tgorm.Open(dialector, &gorm.Config{NamingStrategy: ${packageName}.NamingStrategy})`,
    'var NamingStrategy = schema.NamingStrategy{SingularTable: true, NoLowerCase: true}',
  ]
}

/**
 * The time types a schema's DateTime fields are held in, in the order they are written: a list
 * type brings the type of its elements with it.
 */
function dateTypes(models: readonly DMMF.Model[]) {
  const used = new Set<string>(
    models.flatMap((m) =>
      m.fields.flatMap((f) =>
        f.kind === 'scalar' && f.type === 'DateTime'
          ? [dateTimeGoType(f), dateTimeGoType({ ...f, isList: false })]
          : [],
      ),
    ),
  )
  return ['DateTime', 'Date', 'TimeOfDay', 'DateTimeList', 'DateList', 'TimeOfDayList'].filter(
    (name) => used.has(name),
  )
}

/**
 * The types a DateTime field is held in, written beside the models: each writes the value as
 * Prisma Client writes it for this provider and reads what the column holds as Prisma Client
 * reads it, so the models and Prisma Client can share the tables. A named type is the one hook
 * GORM calls both when it writes a model and when it binds the value in a query.
 *
 * - SQLite compares and sorts the text, so an instant is written as Prisma writes it,
 *   `2030-01-01T09:00:00.000+00:00`: UTC, three fraction digits.
 * - PostgreSQL is given a time.Time in UTC: the wall clock of a `timestamp` is UTC, and a
 *   `timestamptz` holds the instant whatever the session's time zone.
 * - MySQL is given the text `2030-01-01 09:00:00.000` in UTC, which go-sql-driver/mysql sends as
 *   it is; a time.Time it would convert to its `loc`. A `DATETIME` read back is in `loc` too, so
 *   its wall clock is read as UTC.
 *
 * A date column holds the UTC date (`@db.Date`) and a time column the UTC time of day on
 * 1970-01-01 (`@db.Time`, `@db.Timetz`), as Prisma Client writes and reads them.
 */
export function generateDateTypes(models: readonly DMMF.Model[], provider?: string) {
  const types = dateTypes(models)
  if (types.length === 0) return []
  const value =
    provider === 'sqlite'
      ? [
          '// Value writes the instant as Prisma Client does on SQLite: `2006-01-02T15:04:05.000+00:00`,',
          '// in UTC, the text SQLite compares and sorts.',
          'func (dateTime DateTime) Value() (driver.Value, error) {',
          '\treturn dateTime.UTC().Truncate(time.Millisecond).Format("2006-01-02T15:04:05.000-07:00"), nil',
          '}',
        ]
      : provider === 'mysql'
        ? [
            '// Value writes the instant as Prisma Client does on MySQL: `2006-01-02 15:04:05.000` in UTC,',
            '// text the driver sends as it is, where it would convert a time.Time to its loc.',
            'func (dateTime DateTime) Value() (driver.Value, error) {',
            '\treturn dateTime.UTC().Truncate(time.Millisecond).Format("2006-01-02 15:04:05.000"), nil',
            '}',
          ]
        : [
            '// Value writes the instant in UTC to the millisecond, as Prisma Client does: the wall clock of',
            '// a timestamp column is UTC, and a timestamptz column holds the instant whatever the',
            "// session's time zone.",
            'func (dateTime DateTime) Value() (driver.Value, error) {',
            '\treturn dateTime.UTC().Truncate(time.Millisecond), nil',
            '}',
          ]
  const fromDriver =
    provider === 'mysql'
      ? [
          "\t\t// The driver gives a DATETIME back in its loc; the table's wall clock is UTC.",
          '\t\treturn time.Date(value.Year(), value.Month(), value.Day(), value.Hour(), value.Minute(), value.Second(), value.Nanosecond(), time.UTC).Truncate(time.Millisecond), nil',
        ]
      : ['\t\treturn value.UTC().Truncate(time.Millisecond), nil']
  const dateTime = [
    '',
    '// DateTime is a Prisma DateTime as Prisma Client keeps it: an instant in UTC, to the',
    '// millisecond, whatever zone the time.Time is in. Bind a time.Time through it in a query of',
    '// your own, `db.Where("at > ?", DateTime{Time: at})`: the driver formats a bare time.Time',
    '// its own way.',
    'type DateTime struct{ time.Time }',
    '',
    '// GormDataType has GORM treat the column as it treats a time.Time.',
    'func (DateTime) GormDataType() string {',
    '\treturn "time"',
    '}',
    '',
    ...value,
    '',
    '// Scan reads the column as Prisma Client does (see readPrismaTime).',
    'func (dateTime *DateTime) Scan(src any) error {',
    '\tread, err := readPrismaTime(src)',
    '\tdateTime.Time = read',
    '\treturn err',
    '}',
  ]
  const date = [
    '',
    '// Date is a Prisma DateTime in a date column (@db.Date): the UTC date of the instant, read',
    '// back as midnight UTC, as Prisma Client keeps it.',
    'type Date struct{ time.Time }',
    '',
    '// GormDataType has GORM treat the column as it treats a time.Time.',
    'func (Date) GormDataType() string {',
    '\treturn "time"',
    '}',
    '',
    '// Value writes the UTC date, `2006-01-02`.',
    'func (date Date) Value() (driver.Value, error) {',
    '\treturn date.UTC().Format("2006-01-02"), nil',
    '}',
    '',
    '// Scan reads the date as midnight UTC.',
    'func (date *Date) Scan(src any) error {',
    '\tread, err := readPrismaTime(src)',
    '\tif err != nil || read.IsZero() {',
    '\t\tdate.Time = time.Time{}',
    '\t\treturn err',
    '\t}',
    '\tdate.Time = time.Date(read.Year(), read.Month(), read.Day(), 0, 0, 0, 0, time.UTC)',
    '\treturn nil',
    '}',
  ]
  const timeOfDay = [
    '',
    '// TimeOfDay is a Prisma DateTime in a time column (@db.Time, @db.Timetz): the UTC time of day',
    '// of the instant to the millisecond, read back on 1970-01-01 UTC, as Prisma Client keeps it.',
    'type TimeOfDay struct{ time.Time }',
    '',
    '// GormDataType has GORM treat the column as it treats a time.Time.',
    'func (TimeOfDay) GormDataType() string {',
    '\treturn "time"',
    '}',
    '',
    '// Value writes the UTC time, `15:04:05.000`, with no offset: a timetz column takes the',
    "// session's, as it does from Prisma Client.",
    'func (clock TimeOfDay) Value() (driver.Value, error) {',
    '\treturn clock.UTC().Truncate(time.Millisecond).Format("15:04:05.000"), nil',
    '}',
    '',
    '// Scan reads the time on 1970-01-01 UTC, and drops the offset a timetz column holds, as',
    '// Prisma Client does.',
    'func (clock *TimeOfDay) Scan(src any) error {',
    '\tswitch value := src.(type) {',
    '\tcase nil:',
    '\t\tclock.Time = time.Time{}',
    '\t\treturn nil',
    '\tcase []byte:',
    '\t\treturn clock.Scan(string(value))',
    '\tcase string:',
    '\t\tif end := strings.IndexAny(value, "+-Z"); end > 0 {',
    '\t\t\tvalue = value[:end]',
    '\t\t}',
    '\t\tread, err := time.Parse("15:04:05.999999999", value)',
    '\t\tif err != nil {',
    '\t\t\treturn fmt.Errorf("a time column held %q", value)',
    '\t\t}',
    '\t\tclock.Time = time.Date(1970, 1, 1, read.Hour(), read.Minute(), read.Second(), read.Nanosecond(), time.UTC).Truncate(time.Millisecond)',
    '\t\treturn nil',
    '\t}',
    '\tread, err := readPrismaTime(src)',
    '\tclock.Time = time.Date(1970, 1, 1, read.Hour(), read.Minute(), read.Second(), read.Nanosecond(), time.UTC)',
    '\treturn err',
    '}',
  ]
  // A DateTime[] is a PostgreSQL array; each element is written and read as the type of one is.
  const lists = [
    { name: 'DateTimeList', element: 'DateTime', example: '{"2030-01-02 03:04:05.678"}' },
    { name: 'DateList', element: 'Date', example: '{"2030-01-02"}' },
    { name: 'TimeOfDayList', element: 'TimeOfDay', example: '{"03:04:05.678"}' },
  ]
    .filter((list) => types.includes(list.name))
    .flatMap(({ name, element, example }) => [
      '',
      `// ${name} is a Prisma DateTime[] held as ${element}s: a PostgreSQL array, each element`,
      `// written and read as ${element} writes and reads one.`,
      `type ${name} []${element}`,
      '',
      `// Value writes the array as Prisma Client does, \`${example}\`.`,
      `func (list ${name}) Value() (driver.Value, error) {`,
      '\treturn arrayText(list)',
      '}',
      '',
      `// Scan reads each element of the array as ${element} does.`,
      `func (list *${name}) Scan(src any) error {`,
      `\treturn scanArray(src, (*[]${element})(list))`,
      '}',
    ])
  const arrays = types.some((name) => name.endsWith('List'))
    ? [
        '',
        '// arrayText writes a PostgreSQL array literal, each element as its type writes it; an instant',
        '// as the UTC wall clock, as Prisma Client writes it.',
        'func arrayText[T driver.Valuer](list []T) (driver.Value, error) {',
        '\titems := make([]string, len(list))',
        '\tfor i, item := range list {',
        '\t\tvalue, err := item.Value()',
        '\t\tif err != nil {',
        '\t\t\treturn nil, err',
        '\t\t}',
        '\t\tif at, ok := value.(time.Time); ok {',
        '\t\t\tvalue = at.Format("2006-01-02 15:04:05.000")',
        '\t\t}',
        '\t\titems[i] = fmt.Sprintf("%q", value)',
        '\t}',
        '\treturn "{" + strings.Join(items, ",") + "}", nil',
        '}',
        '',
        '// scanArray reads a PostgreSQL array, each element as its type reads one.',
        'func scanArray[T any, P interface {',
        '\t*T',
        '\tsql.Scanner',
        '}](src any, list *[]T) error {',
        '\tvar text string',
        '\tswitch value := src.(type) {',
        '\tcase nil:',
        '\t\t*list = nil',
        '\t\treturn nil',
        '\tcase []byte:',
        '\t\ttext = string(value)',
        '\tcase string:',
        '\t\ttext = value',
        '\tdefault:',
        '\t\treturn fmt.Errorf("a DateTime[] column held %T", src)',
        '\t}',
        '\ttext = strings.TrimSuffix(strings.TrimPrefix(text, "{"), "}")',
        '\t*list = []T{}',
        '\tif text == "" {',
        '\t\treturn nil',
        '\t}',
        '\tfor _, part := range strings.Split(text, ",") {',
        '\t\tvar item T',
        '\t\tif err := P(&item).Scan(strings.Trim(part, `"`)); err != nil {',
        '\t\t\treturn err',
        '\t\t}',
        '\t\t*list = append(*list, item)',
        '\t}',
        '\treturn nil',
        '}',
      ]
    : []
  return [
    ...(types.includes('DateTime') ? dateTime : []),
    ...(types.includes('Date') ? date : []),
    ...(types.includes('TimeOfDay') ? timeOfDay : []),
    ...lists,
    ...arrays,
    '',
    '// prismaTimeLayouts are the texts readPrismaTime reads, as Prisma Client reads them: with an',
    '// offset or `Z`, or with none, which is UTC; a date alone is midnight UTC.',
    'var prismaTimeLayouts = []string{',
    '\t"2006-01-02T15:04:05.999999999Z07:00",',
    '\t"2006-01-02 15:04:05.999999999Z07:00",',
    '\t"2006-01-02 15:04:05.999999999Z07",',
    '\t"2006-01-02T15:04:05.999999999",',
    '\t"2006-01-02 15:04:05.999999999",',
    '\t"2006-01-02",',
    '}',
    '',
    '// readPrismaTime reads a DateTime column as Prisma Client reads it: text with no zone is UTC, an',
    '// offset is kept, digits are milliseconds since 1970, and what is past the millisecond is',
    '// dropped.',
    'func readPrismaTime(src any) (time.Time, error) {',
    '\tswitch value := src.(type) {',
    '\tcase nil:',
    '\t\treturn time.Time{}, nil',
    '\tcase time.Time:',
    ...fromDriver,
    '\tcase int64:',
    '\t\treturn time.UnixMilli(value).UTC(), nil',
    '\tcase []byte:',
    '\t\treturn readPrismaTime(string(value))',
    '\tcase string:',
    '\t\tif millis, err := strconv.ParseInt(value, 10, 64); err == nil {',
    '\t\t\treturn time.UnixMilli(millis).UTC(), nil',
    '\t\t}',
    '\t\tfor _, layout := range prismaTimeLayouts {',
    '\t\t\tif read, err := time.Parse(layout, value); err == nil {',
    '\t\t\t\treturn read.UTC().Truncate(time.Millisecond), nil',
    '\t\t\t}',
    '\t\t}',
    '\t\treturn time.Time{}, fmt.Errorf("a DateTime column held %q", value)',
    '\t}',
    '\treturn time.Time{}, fmt.Errorf("a DateTime column held %T", src)',
    '}',
  ]
}

/**
 * What keeps the schema from becoming models that compile: a model whose Go name is that of a
 * time type written beside the models, where the schema needs that type.
 */
export function gormProblems(models: readonly DMMF.Model[]) {
  const types = dateTypes(models)
  return models
    .filter((model) => types.includes(goModelName(model.name)))
    .map(
      (model) =>
        `model ${model.name}: its Go name is ${goModelName(model.name)}, the type the models hold a DateTime in; rename the model and keep its table with @@map`,
    )
}

export function collectImports(models: readonly DMMF.Model[]) {
  const needsTime = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && f.type === 'DateTime'),
  )
  const types = dateTypes(models)
  const lists = types.some((name) => name.endsWith('List'))
  const fillsTimes = models.some((m) =>
    m.fields.some((f) => createdTimeExpr(f) !== null || (isDateTimeScalar(f) && f.isUpdatedAt)),
  )
  const needsDatatypes = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && f.type === 'Json'),
  )
  const generators = new Set(
    models.flatMap((m) =>
      generatedIdFields(m).flatMap((f) =>
        isFunctionDefault(f.default)
          ? [f.default.name === 'cuid' && f.default.args[0] === 2 ? 'cuid2' : f.default.name]
          : [],
      ),
    ),
  )
  // Standard library first, then the modules, each group sorted by path, as
  // gofmt keeps them.
  const standard = [
    generators.has('ulid') ? '"crypto/rand"' : null,
    lists ? '"database/sql"' : null,
    types.length > 0 ? '"database/sql/driver"' : null,
    types.length > 0 ? '"fmt"' : null,
    types.length > 0 ? '"strconv"' : null,
    types.includes('TimeOfDay') || lists ? '"strings"' : null,
    needsTime ? '"time"' : null,
  ]
  const modules = [
    generators.has('uuid') ? '"github.com/google/uuid"' : null,
    generators.has('cuid') ? '"github.com/lucsky/cuid"' : null,
    generators.has('nanoid') ? 'gonanoid "github.com/matoous/go-nanoid/v2"' : null,
    generators.has('cuid2') ? '"github.com/nrednav/cuid2"' : null,
    generators.has('ulid') ? '"github.com/oklog/ulid/v2"' : null,
    needsDatatypes ? '"gorm.io/datatypes"' : null,
    generators.size > 0 || fillsTimes ? '"gorm.io/gorm"' : null,
    hasImplicitManyToMany(models) ? '"gorm.io/gorm/schema"' : null,
  ]
  return [standard.filter((i) => i !== null), modules.filter((i) => i !== null)]
}

export function formatImports(groups: readonly (readonly string[])[]) {
  const imports = groups.filter((group) => group.length > 0)
  if (imports.length === 0) return []
  if (imports.length === 1 && imports[0].length === 1) return ['', `import ${imports[0][0]}`]
  return [
    '',
    'import (',
    // A blank line between the groups.
    ...imports
      .map((group) => group.map((imp) => `\t${imp}`).join('\n'))
      .join('\n\n')
      .split('\n'),
    ')',
  ]
}
