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

export function buildGormTags(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
  compositeIndexTags: readonly string[],
  enums?: readonly DMMF.DatamodelEnum[],
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
  const defaultVal =
    dbGeneratedExpr ??
    ((!isPk || isCompositePk) && !isNowDefault && !field.isUpdatedAt
      ? (enumMappedDefault ?? formatGoDefault(field.default, field.type, field.kind))
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
    isNowDefault ? 'autoCreateTime' : null,
    defaultVal !== null ? `default:${defaultVal}` : null,
    field.isUpdatedAt ? 'autoUpdateTime' : null,
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
const GENERATED_METHOD_NAMES = new Set(['TableName', 'BeforeCreate'])

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
  const goType = field.isList
    ? `[]${field.kind === 'enum' ? 'string' : prismaTypeToGoType(field.type, true)}`
    : scalarType

  return [fieldName, goType, buildGormTags(field, isPk, isCompositePk, compositeIndexTags, enums)]
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
    return generateStructField(field, isPk, isCompositePk, fieldIndexTags, enums)
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

export function collectImports(models: readonly DMMF.Model[]) {
  const needsTime = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && f.type === 'DateTime'),
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
  const standard = [generators.has('ulid') ? '"crypto/rand"' : null, needsTime ? '"time"' : null]
  const modules = [
    generators.has('uuid') ? '"github.com/google/uuid"' : null,
    generators.has('cuid') ? '"github.com/lucsky/cuid"' : null,
    generators.has('nanoid') ? 'gonanoid "github.com/matoous/go-nanoid/v2"' : null,
    generators.has('cuid2') ? '"github.com/nrednav/cuid2"' : null,
    generators.has('ulid') ? '"github.com/oklog/ulid/v2"' : null,
    needsDatatypes ? '"gorm.io/datatypes"' : null,
    generators.size > 0 ? '"gorm.io/gorm"' : null,
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
