import type { DMMF } from '@prisma/generator-helper'

import { makePascalCase, makeSnakeCase } from '../utils/index.js'

const PRISMA_TO_PYTHON: { [k: string]: string } = {
  String: 'str',
  Int: 'int',
  BigInt: 'int',
  Float: 'float',
  Decimal: 'Decimal',
  Boolean: 'bool',
  DateTime: 'datetime',
  // Bare `dict` is `dict[Unknown, Unknown]` under mypy --strict; a JSON column is
  // an object with string keys and arbitrary values.
  Json: 'dict[str, Any]',
  Bytes: 'bytes',
}

const PRISMA_TO_SQLALCHEMY: { [k: string]: string } = {
  String: 'String',
  Int: 'Integer',
  BigInt: 'BigInteger',
  Float: 'Float',
  Decimal: 'Numeric',
  Boolean: 'Boolean',
  DateTime: 'DateTime',
  Json: 'JSON',
  Bytes: 'LargeBinary',
}

export function prismaTypeToSQLAlchemyType(type: string) {
  return PRISMA_TO_SQLALCHEMY[type] ?? 'String'
}

export function prismaTypeToPythonType(type: string) {
  return PRISMA_TO_PYTHON[type] ?? 'str'
}

// Python hard keywords cannot be attribute names (`async`/`yield` etc. are a
// syntax error). Soft keywords (match/case/type/_) are valid names and excluded.
const PYTHON_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
])

// Not keywords, but unusable as declarative attribute names: `self`/`cls`
// collide with the default __init__ signature and `metadata`/`registry` are
// reserved by DeclarativeBase.
const DECLARATIVE_RESERVED = new Set(['self', 'cls', 'metadata', 'registry'])

// A keyword or reserved column name is mapped to a `<name>_` attribute; the
// real column is then preserved via the first positional argument to
// mapped_column.
export function pythonAttrName(columnName: string) {
  return PYTHON_KEYWORDS.has(columnName) || DECLARATIVE_RESERVED.has(columnName)
    ? `${columnName}_`
    : columnName
}

// The column type Prisma Migrate gives a field with no native type, as SQLAlchemy writes it. A
// DateTime is the UTC type the module defines, to the millisecond (SQLite has no precision to
// give); SQLite's Json is Prisma's JSONB, holding the JSON text.
function plainType(type: string, provider: string) {
  switch (type) {
    case 'DateTime':
      if (provider === 'sqlite') return 'UtcDateTime'
      return provider === 'mysql' ? 'UtcDateTime(fsp=3)' : 'UtcDateTime(precision=3)'
    case 'String':
      return provider === 'mysql' ? 'String(191)' : 'Text'
    case 'Float':
      return provider === 'sqlite' ? 'REAL' : 'Double'
    case 'Decimal':
      return provider === 'sqlite' ? 'DECIMAL' : 'Numeric(precision=65, scale=30)'
    case 'Bytes':
      return provider === 'mysql' ? 'LONGBLOB' : 'LargeBinary'
    case 'Json':
      if (provider === 'sqlite') return 'Jsonb'
      return provider === 'mysql' ? 'JSON' : 'JSONB'
    default:
      return prismaTypeToSQLAlchemyType(type)
  }
}

// What SQLAlchemy maps a Python type to where the provider's plain type is another: the entries
// of the base's type_annotation_map, for the Python types the columns use.
function annotationMapEntries(models: readonly DMMF.Model[], provider: string) {
  // A column with no type of its own: SQLite's enums are its plain `str`.
  const annotated = models.flatMap((m) =>
    m.fields.filter((f) => f.kind !== 'object' && !f.isList && !needsExplicitSaType(f, provider)),
  )
  const uses = (type: string) =>
    annotated.some((f) => (f.kind === 'enum' ? 'String' : f.type) === type)
  return [
    usesUtcDateTime(models) ? `datetime: ${plainType('DateTime', provider)}` : null,
    uses('String') ? `str: ${plainType('String', provider)}` : null,
    uses('Float') && provider === 'sqlite' ? 'float: REAL' : null,
    uses('Decimal') ? `DecimalType: ${plainType('Decimal', provider)}` : null,
    uses('Bytes') && provider === 'mysql' ? 'bytes: LONGBLOB' : null,
  ].filter((entry) => entry !== null)
}

// The column type of a field, as Prisma Migrate creates it: the plain type, or the one its
// `@db.*` names, in SQLAlchemy's generic type where that writes the same DDL and the dialect's
// where only it carries a length, a precision or `unsigned`.
function resolveNativeType(field: DMMF.Field, provider: string) {
  const baseType = plainType(field.type, provider)
  if (!field.nativeType) return baseType

  const [nativeName, nativeArgs] = field.nativeType
  const args = nativeArgs ?? []
  const length = args.length > 0 ? args[0] : ''
  // A bare `@db.Timestamp` or `@db.DateTime` is the database's own precision, as Prisma Migrate
  // writes it: timestamp (6) on PostgreSQL, TIMESTAMP and DATETIME (0) on MySQL.
  const precision = args.length > 0 ? `precision=${args[0]}` : ''
  const fsp = args.length > 0 ? `fsp=${args[0]}` : ''

  switch (nativeName) {
    case 'VarChar':
      return args.length > 0 ? `String(${length})` : 'String'
    case 'Char':
      return length ? `CHAR(${length})` : 'CHAR'
    case 'Text':
      return 'Text'
    case 'TinyText':
    case 'MediumText':
    case 'LongText':
      return nativeName.toUpperCase()
    case 'Bit':
      return length ? `BIT(${length})` : 'BIT'
    case 'VarBit':
      return length ? `BIT(${length}, varying=True)` : 'BIT(varying=True)'
    case 'Xml':
      return 'Xml'
    case 'Inet':
      return 'INET'
    case 'Citext':
      return 'CITEXT'
    case 'Oid':
      return 'OID'
    case 'Integer':
    case 'Int':
      return 'Integer'
    case 'SmallInt':
      return 'SmallInteger'
    case 'MediumInt':
      return 'MEDIUMINT'
    case 'TinyInt':
      // A Boolean's TINYINT is BOOL's tinyint(1).
      return field.type === 'Boolean' ? 'Boolean' : 'TINYINT'
    case 'UnsignedInt':
      return 'INTEGER(unsigned=True)'
    case 'UnsignedSmallInt':
      return 'SMALLINT(unsigned=True)'
    case 'UnsignedMediumInt':
      return 'MEDIUMINT(unsigned=True)'
    case 'UnsignedTinyInt':
      return 'TINYINT(unsigned=True)'
    case 'UnsignedBigInt':
      return 'BIGINT(unsigned=True)'
    case 'Year':
      return 'YEAR'
    case 'BigInt':
      return 'BigInteger'
    case 'DoublePrecision':
    case 'Double':
      return 'Double'
    case 'Float':
      return 'Float'
    case 'Real':
      return 'REAL'
    case 'Decimal':
      return args.length >= 2 ? `Numeric(precision=${args[0]}, scale=${args[1]})` : 'Numeric'
    case 'Money':
      return 'MONEY'
    case 'Boolean':
      return 'Boolean'
    case 'ByteA':
      return 'LargeBinary'
    case 'Binary':
      return length ? `BINARY(${length})` : 'BINARY'
    case 'VarBinary':
      return length ? `VARBINARY(${length})` : 'VARBINARY'
    case 'TinyBlob':
    case 'MediumBlob':
    case 'LongBlob':
      return nativeName.toUpperCase()
    case 'Blob':
      return 'BLOB'
    case 'Uuid':
      return 'Uuid'
    case 'Timestamp':
      return provider === 'mysql' ? `UtcTimestamp(${fsp})` : `UtcDateTime(${precision})`
    case 'DateTime':
      return `UtcDateTime(${fsp})`
    case 'Timestamptz':
      return `UtcDateTimeTz(${precision})`
    case 'Date':
      return 'Date'
    // SQLAlchemy's Time has no precision: create_all would write TIME, the database's own
    // (time(6) on PostgreSQL, TIME(0) on MySQL), where Prisma Migrate writes the one asked for.
    case 'Time':
      if (args.length === 0) return 'Time'
      return provider === 'mysql' ? `TIME(${fsp})` : `TIME(${precision})`
    case 'Timetz':
      return args.length === 0 ? 'Time(timezone=True)' : `TIME(${precision}, timezone=True)`
    case 'Json':
      return 'JSON'
    case 'JsonB':
      return 'JSONB'
    default:
      return baseType
  }
}

// The types the module defines rather than imports: the UTC date-times, and the columns whose
// DDL no SQLAlchemy type writes.
const MODULE_TYPES = new Set(['UtcDateTime', 'UtcDateTimeTz', 'UtcTimestamp', 'Jsonb', 'Xml'])
// The types imported from the dialect: its own spelling of a column, or the one that takes the
// precision, length or `unsigned` sqlalchemy's does not.
const DIALECT_TYPES = new Set([
  'TIME',
  'JSONB',
  'BIT',
  'INET',
  'CITEXT',
  'OID',
  'MONEY',
  'TINYTEXT',
  'MEDIUMTEXT',
  'LONGTEXT',
  'MEDIUMINT',
  'TINYINT',
  'INTEGER',
  'SMALLINT',
  'BIGINT',
  'YEAR',
  'TINYBLOB',
  'MEDIUMBLOB',
  'LONGBLOB',
])

function needsExplicitSaType(field: DMMF.Field, provider: string) {
  if (field.kind === 'enum') return provider !== 'sqlite'
  // dict is not in SQLAlchemy's default type_annotation_map: a bare
  // Mapped[dict[str, Any]] raises MappedAnnotationError at import time.
  if (field.type === 'Json') return true
  // A bare Mapped[int] maps to Integer; a Prisma BigInt column must stay
  // BIGINT in the DDL.
  if (field.type === 'BigInt') return true
  // A native type that comes out as the column's plain type is left to type_annotation_map.
  if (field.nativeType) {
    const plain = resolveNativeType({ ...field, nativeType: null }, provider)
    if (resolveNativeType(field, provider) !== plain) return true
  }
  return false
}

function pythonTypeForNative(field: DMMF.Field) {
  if (!field.nativeType) {
    const raw = prismaTypeToPythonType(field.type)
    return raw === 'Decimal' ? 'DecimalType' : raw
  }
  const [nativeName] = field.nativeType
  if (nativeName === 'Uuid') return 'uuid_mod.UUID'
  if (nativeName === 'Date') return 'date'
  if (nativeName === 'Time' || nativeName === 'Timetz') return 'time_type'
  const raw = prismaTypeToPythonType(field.type)
  return raw === 'Decimal' ? 'DecimalType' : raw
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const belongsTo: {
    name: string
    targetModel: string
    foreignKey: string
    references: string
    foreignKeys: readonly string[]
    referencesList: readonly string[]
    optional: boolean
    onDelete: string
    onUpdate: string
  }[] = []
  const hasMany: {
    name: string
    targetModel: string
    foreignKey: string
    isList: boolean
    onDelete: string
  }[] = []
  const hasOne: {
    name: string
    targetModel: string
    foreignKey: string
    isList: boolean
    optional: boolean
    onDelete: string
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
        optional: !field.isRequired,
        // What Prisma Migrate writes when the schema names no action: the database has it, so
        // the model says it too.
        onDelete: field.relationOnDelete ?? (field.isRequired ? 'Restrict' : 'SetNull'),
        onUpdate: field.relationOnUpdate ?? 'Cascade',
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
    if (!(fkField && foreignKey)) continue
    const onDelete = fkField.relationOnDelete ?? (fkField.isRequired ? 'Restrict' : 'SetNull')

    if (field.isList) {
      hasMany.push({
        name: field.name,
        targetModel: field.type,
        foreignKey,
        isList: true,
        onDelete,
      })
    } else {
      hasOne.push({
        name: field.name,
        targetModel: field.type,
        foreignKey,
        isList: false,
        optional: !field.isRequired,
        onDelete,
      })
    }
  }

  return { belongsTo, hasMany, hasOne, manyToMany }
}

export function collectManyToManyTables(allModels: readonly DMMF.Model[]) {
  const candidates = allModels.flatMap((model) =>
    model.fields.flatMap((field) => {
      if (field.kind !== 'object' || !field.isList) return []
      const targetModel = allModels.find((m) => m.name === field.type)
      if (!targetModel) return []
      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )
      if (!otherSide?.isList) return []

      const [leftName, rightName] =
        model.name < field.type ? [model.name, field.type] : [field.type, model.name]
      const leftModelObj = allModels.find((m) => m.name === leftName)
      const rightModelObj = allModels.find((m) => m.name === rightName)

      // Prisma names the implicit join table `_<relationName>` (default
      // relationName is the two model names alphabetically joined by "To").
      const relationName = field.relationName ?? `${leftName}To${rightName}`
      return [
        {
          relationName,
          info: {
            relationName,
            tableName: `_${relationName}`,
            varName: makeSnakeCase(relationName),
            leftModel: leftName,
            leftTable: leftModelObj?.dbName ?? leftName,
            leftPkField: leftModelObj?.fields.find((f) => f.isId),
            rightModel: rightName,
            rightTable: rightModelObj?.dbName ?? rightName,
            rightPkField: rightModelObj?.fields.find((f) => f.isId),
          },
        },
      ]
    }),
  )

  const seen = new Set<string>()
  return candidates.flatMap(({ relationName, info }) => {
    if (seen.has(relationName)) return []
    seen.add(relationName)
    return [info]
  })
}

export function generateAssociationTable(
  info: {
    tableName: string
    varName: string
    leftModel: string
    leftTable: string
    leftPkField: DMMF.Field | undefined
    rightModel: string
    rightTable: string
    rightPkField: DMMF.Field | undefined
  },
  provider: string,
) {
  const plain = plainType('String', provider)
  const leftSaType = info.leftPkField ? resolveNativeType(info.leftPkField, provider) : plain
  const rightSaType = info.rightPkField ? resolveNativeType(info.rightPkField, provider) : plain
  const leftPkCol = info.leftPkField?.dbName ?? info.leftPkField?.name ?? 'id'
  const rightPkCol = info.rightPkField?.dbName ?? info.rightPkField?.name ?? 'id'
  const name = (columns: string, suffix: string) =>
    constraintName(info.tableName, [columns], suffix, provider)
  // The pair is the key on PostgreSQL and a unique index on MySQL and SQLite, as Prisma Migrate
  // makes it.
  const pair =
    provider === 'mysql' || provider === 'sqlite'
      ? `Index("${name('AB', 'unique')}", "A", "B", unique=True)`
      : `PrimaryKeyConstraint("A", "B", name="${name('AB', 'pkey')}")`
  return [
    `${info.varName} = Table(`,
    `    "${info.tableName}",`,
    '    Base.metadata,',
    // Prisma's join table goes with either row: both keys cascade.
    `    Column("A", ${leftSaType}, ForeignKey("${info.leftTable}.${leftPkCol}", ondelete="CASCADE", onupdate="CASCADE", name="${name('A', 'fkey')}"), nullable=False),`,
    `    Column("B", ${rightSaType}, ForeignKey("${info.rightTable}.${rightPkCol}", ondelete="CASCADE", onupdate="CASCADE", name="${name('B', 'fkey')}"), nullable=False),`,
    `    ${pair},`,
    // The index Prisma adds for reading the relation from its B side.
    `    Index("${name('B', 'index')}", "B"),`,
    ...(provider === 'mysql'
      ? ['    mysql_charset="utf8mb4",', '    mysql_collate="utf8mb4_unicode_ci",']
      : []),
    ')',
  ].join('\n')
}

function toPythonString(value: string) {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
  return `"${escaped}"`
}

function jsonToPythonLiteral(value: unknown): string {
  if (value === null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return toPythonString(value)
  if (Array.isArray(value)) return `[${value.map(jsonToPythonLiteral).join(', ')}]`
  if (typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([k, v]) => `${toPythonString(k)}: ${jsonToPythonLiteral(v)}`)
      .join(', ')}}`
  }
  return 'None'
}

const SQL_ACTION: { [k: string]: string } = {
  Cascade: 'CASCADE',
  SetNull: 'SET NULL',
  Restrict: 'RESTRICT',
  NoAction: 'NO ACTION',
  SetDefault: 'SET DEFAULT',
}

function formatDefault(field: DMMF.Field, enumDef?: DMMF.DatamodelEnum) {
  const def = field.default
  if (def === undefined || def === null) return null
  // An enum default arrives as the Prisma-level value name; the column stores
  // the @map-ped database value.
  if (field.kind === 'enum' && typeof def === 'string') {
    const value = enumDef?.values.find((v) => v.name === def)
    return toPythonString(value?.dbName ?? def)
  }
  // A scalar-list default is a JSON-compatible array; lambda avoids the
  // shared-mutable-default pitfall.
  if (Array.isArray(def)) {
    return `lambda: ${jsonToPythonLiteral(def)}`
  }
  if (typeof def === 'boolean') return def ? 'True' : 'False'
  if (typeof def === 'number') {
    return field.type === 'Decimal' ? `DecimalType("${def}")` : String(def)
  }
  if (typeof def === 'string') {
    // DMMF carries BigInt defaults as digit strings, DateTime literals as ISO
    // strings, and Json defaults as JSON text; each needs its Python shape,
    // not a bare quoted string.
    if (field.type === 'BigInt') return def
    // A @db.Date or @db.Time column holds a date or a time: its default is the part of the
    // instant, in UTC, the column keeps.
    if (field.type === 'DateTime') {
      const iso = new Date(def).toISOString()
      const nativeName = field.nativeType?.[0]
      if (nativeName === 'Date') return `date.fromisoformat("${iso.slice(0, 10)}")`
      if (nativeName === 'Time') return `time_type.fromisoformat("${iso.slice(11, 23)}")`
      if (nativeName === 'Timetz') return `time_type.fromisoformat("${iso.slice(11, 23)}+00:00")`
      return `datetime.fromisoformat(${toPythonString(def)})`
    }
    if (field.type === 'Json') {
      const parsed: unknown = JSON.parse(def)
      return typeof parsed === 'object' && parsed !== null
        ? `lambda: ${jsonToPythonLiteral(parsed)}`
        : jsonToPythonLiteral(parsed)
    }
    return toPythonString(def)
  }
  return null
}

/**
 * The name Prisma Migrate gives a key, index or constraint the schema does not name: the table,
 * the columns and a suffix, the first two cut to the database's longest identifier (63 on
 * PostgreSQL, 64 on MySQL).
 *
 * @example
 * ```sql
 * -- @@unique([s, i]) on Scalar; a foreign key on refs.comp_a, comp_b
 * CREATE UNIQUE INDEX "Scalar_s_i_key" ON "Scalar"("s", "i");
 * CONSTRAINT "refs_comp_a_comp_b_fkey" FOREIGN KEY ("comp_a", "comp_b") ...
 * ```
 */
function constraintName(
  table: string,
  columns: readonly string[],
  suffix: string,
  provider: string,
) {
  const limit = provider === 'sqlite' ? Infinity : provider === 'mysql' ? 64 : 63
  return `${[table, ...columns].join('_').slice(0, limit - suffix.length - 1)}_${suffix}`
}

// A literal default as SQL, in the form Prisma Migrate writes it: a date-time in UTC, with its
// milliseconds where it has any, and with its offset where the column keeps or ignores one
// (MySQL would shift it into the session's zone).
function sqlLiteral(
  field: DMMF.Field,
  value: unknown,
  enumDef: DMMF.DatamodelEnum | undefined,
  provider: string,
) {
  const quote = (text: string) => `'${text.replaceAll("'", "''")}'`
  if (field.kind === 'enum') {
    return quote(enumDef?.values.find((v) => v.name === value)?.dbName ?? String(value))
  }
  if (typeof value === 'boolean') {
    if (provider === 'mysql' && field.nativeType?.[0] === 'Bit') return value ? "b'1'" : "b'0'"
    return value ? 'true' : 'false'
  }
  if (typeof value === 'number' || ['Int', 'BigInt', 'Float', 'Decimal'].includes(field.type)) {
    return String(value)
  }
  if (field.type === 'DateTime' && typeof value === 'string') {
    const iso = new Date(value).toISOString()
    const ms = iso.slice(19, 23) === '.000' ? '' : iso.slice(19, 23)
    const time = `${iso.slice(11, 19)}${ms}`
    const nativeName = field.nativeType?.[0]
    if (nativeName === 'Date') return quote(iso.slice(0, 10))
    if (nativeName === 'Time') return quote(time)
    if (nativeName === 'Timetz') return quote(`${time}+00`)
    return quote(`${iso.slice(0, 10)} ${time}${provider === 'mysql' ? '' : ' +00:00'}`)
  }
  return quote(String(value))
}

// The element type a PostgreSQL list default is cast to where its items do not say it: an
// enum's, or any type's when there are no items.
const PG_ELEMENT_TYPE: { [k: string]: string } = {
  String: 'text',
  Int: 'integer',
  BigInt: 'bigint',
  Float: 'double precision',
  Decimal: 'numeric(65,30)',
  Boolean: 'boolean',
  DateTime: 'timestamp(3)',
  Json: 'jsonb',
}

/**
 * The DEFAULT Prisma Migrate writes for a literal `@default`, for the column's `server_default`:
 * what the database fills in where a row is written without the column. Prisma Client fills
 * `uuid()`, `cuid()`, `ulid()`, `nanoid()` and `@updatedAt` itself, so those have none.
 *
 * @example
 * ```sql
 * -- @default("it's"), @default(-3), @default(true), @default(SAD), @default([HAPPY])
 * "txt" text DEFAULT 'it''s'
 * "neg" integer DEFAULT -3
 * "b" boolean DEFAULT true
 * "es" "Mood" DEFAULT 'sad'
 * "el" "Mood"[] DEFAULT ARRAY['HAPPY']::"Mood"[]
 * ```
 */
function serverDefault(
  field: DMMF.Field,
  enumDef: DMMF.DatamodelEnum | undefined,
  provider: string,
) {
  const def = field.default
  if (def === undefined || def === null || isFunctionDefault(def)) return null
  if (!Array.isArray(def)) return sqlLiteral(field, def, enumDef, provider)
  const items = def.map((item) => sqlLiteral(field, item, enumDef, provider))
  const element =
    field.kind === 'enum' ? `"${enumDef?.dbName ?? field.type}"` : PG_ELEMENT_TYPE[field.type]
  const cast = field.kind === 'enum' || items.length === 0 ? `::${element}[]` : ''
  return `ARRAY[${items.join(', ')}]${cast}`
}

function isFunctionDefault(
  def: DMMF.Field['default'],
): def is { readonly name: string; readonly args: readonly (string | number)[] } {
  return def !== null && typeof def === 'object' && 'name' in def
}

function isNowDefault(field: DMMF.Field) {
  return (
    field.type === 'DateTime' && isFunctionDefault(field.default) && field.default.name === 'now'
  )
}

function usesNativeType(models: readonly DMMF.Model[], names: readonly string[]) {
  return models.some((m) => m.fields.some((f) => names.includes(f.nativeType?.[0] ?? '')))
}

// A column read through UtcDateTime, or UtcTimestamp made on it: a DateTime with no native type
// (through the base's type_annotation_map), a `@db.Timestamp` or a `@db.DateTime`.
function usesUtcDateTime(models: readonly DMMF.Model[]) {
  return models.some((m) =>
    m.fields.some(
      (f) =>
        f.type === 'DateTime' && ['', 'Timestamp', 'DateTime'].includes(f.nativeType?.[0] ?? ''),
    ),
  )
}

function isAutoincrement(field: DMMF.Field) {
  return isFunctionDefault(field.default) && field.default.name === 'autoincrement'
}

function uuidDefaultVersion(field: DMMF.Field) {
  if (!(isFunctionDefault(field.default) && field.default.name === 'uuid')) return null
  return field.default.args[0] === 7 ? 7 : 4
}

function isUlidDefault(field: DMMF.Field) {
  return isFunctionDefault(field.default) && field.default.name === 'ulid'
}

function needsForeignKeysParam(
  targetModel: string,
  assocs: readonly { readonly targetModel: string }[],
) {
  return assocs.filter((a) => a.targetModel === targetModel).length > 1
}

function findBackPopulates(
  targetModelName: string,
  sourceModelName: string,
  foreignKey: string,
  allModels: readonly DMMF.Model[],
  sourceFieldName?: string,
) {
  const targetModel = allModels.find((m) => m.name === targetModelName)
  const sourceModel = allModels.find((m) => m.name === sourceModelName)
  if (!targetModel) return makeSnakeCase(sourceModelName)

  // Prisma pairs the two sides of a relation by relationName; matching on it is
  // the disambiguator (it also handles multiple relations between the same two
  // models). Exclude the source field itself so a self-relation pairs its two
  // ends (parent↔children) instead of back-populating onto itself.
  const sourceField = sourceModel?.fields.find(
    (f) => f.kind === 'object' && f.name === sourceFieldName,
  )
  const relationName = sourceField?.relationName

  const backField = targetModel.fields.find((f) => {
    if (f.kind !== 'object') return false
    if (f.type !== sourceModelName) return false
    if (targetModelName === sourceModelName && f.name === sourceFieldName) return false
    if (relationName !== undefined) return f.relationName === relationName
    if (f.relationFromFields?.includes(foreignKey)) return true
    return sourceModel
      ? sourceModel.fields.some(
          (sf) => sf.relationName === f.relationName && sf.relationFromFields?.includes(foreignKey),
        )
      : false
  })

  return pythonAttrName(makeSnakeCase(backField ? backField.name : sourceModelName))
}

function findM2MBackPopulates(
  targetModelName: string,
  sourceModelName: string,
  sourceFieldName: string,
  relationName: string,
  allModels: readonly DMMF.Model[],
) {
  const targetModel = allModels.find((m) => m.name === targetModelName)
  // A self many-to-many holds both ends in one model: the other end is the field that is not
  // this one.
  const backField = targetModel?.fields.find(
    (f) =>
      f.kind === 'object' &&
      f.type === sourceModelName &&
      f.relationName === relationName &&
      !(targetModelName === sourceModelName && f.name === sourceFieldName),
  )
  return pythonAttrName(makeSnakeCase(backField ? backField.name : sourceModelName))
}

function generateColumn(
  field: DMMF.Field,
  isPk: boolean,
  isFk: boolean,
  associations: ReturnType<typeof getAssociations>,
  allModels: readonly DMMF.Model[],
  enumMap: ReadonlyMap<string, DMMF.DatamodelEnum>,
  provider: string,
  tableName: string,
) {
  // The attribute is the field in Python's case; the column is Prisma's, named
  // positionally whenever the two differ.
  const columnName = field.dbName ?? field.name
  const attrName = pythonAttrName(makeSnakeCase(field.name))
  const elemPythonType = field.kind === 'enum' ? 'str' : pythonTypeForNative(field)
  // A scalar list is a collection; collapsing it to its element type silently
  // drops the array. Lists are non-Optional (an empty array, not None).
  const pythonType = field.isList ? `list[${elemPythonType}]` : elemPythonType
  const typeHint = field.isList || field.isRequired ? pythonType : `Optional[${pythonType}]`

  const colArgs: string[] = []

  // Keyword column renamed to `<name>_`: pin the real column name positionally.
  if (attrName !== columnName) {
    colArgs.push(`"${columnName}"`)
  }

  // SQLite has no enums: Prisma Migrate makes the column TEXT, the plain `str` of the base.
  if (field.kind === 'enum' && provider !== 'sqlite') {
    const enumDef = enumMap.get(field.type)
    // The database stores the @map-ped values under the @@map-ped type name.
    const valuesStr = enumDef ? enumDef.values.map((v) => `"${v.dbName ?? v.name}"`).join(', ') : ''
    const enumType = `Enum(${valuesStr}, name="${enumDef?.dbName ?? field.type}")`
    colArgs.push(field.isList ? `ARRAY(${enumType})` : enumType)
  } else if (field.isList) {
    colArgs.push(`ARRAY(${resolveNativeType(field, provider)})`)
  } else if (needsExplicitSaType(field, provider)) {
    const saType = resolveNativeType(field, provider)
    // SQLAlchemy writes None into a JSON column as the JSON text `null`, which `IS NULL` does not
    // find; the None of an optional Json field is the column's NULL, as Prisma's DbNull is.
    colArgs.push(
      field.type === 'Json' && !field.isRequired ? `${saType}(none_as_null=True)` : saType,
    )
  }

  if (isFk) {
    const assoc = associations.belongsTo.find((a) => a.foreignKey === field.name)
    // A composite FK is expressed as a table-level ForeignKeyConstraint; a
    // per-column ForeignKey would pair this column with references[0] alone
    // and emit a half-join against a non-unique column.
    if (assoc?.foreignKeys.length === 1) {
      const targetModelObj = allModels.find((m) => m.name === assoc.targetModel)
      const targetTable = targetModelObj?.dbName ?? assoc.targetModel
      const targetField = targetModelObj?.fields.find((f) => f.name === assoc.references)
      const targetCol = targetField?.dbName ?? assoc.references
      const fkActions = [
        SQL_ACTION[assoc.onDelete] ? `, ondelete="${SQL_ACTION[assoc.onDelete]}"` : '',
        SQL_ACTION[assoc.onUpdate] ? `, onupdate="${SQL_ACTION[assoc.onUpdate]}"` : '',
      ].join('')
      const fkName = constraintName(tableName, [columnName], 'fkey', provider)
      colArgs.push(`ForeignKey("${targetTable}.${targetCol}"${fkActions}, name="${fkName}")`)
    }
  }

  if (isPk) colArgs.push('primary_key=True')
  if (isPk && isAutoincrement(field)) colArgs.push('autoincrement=True')
  // SQLAlchemy makes a lone integer key SERIAL or AUTO_INCREMENT unless told otherwise; Prisma
  // Migrate does only for @default(autoincrement()).
  if (field.isId && ['Int', 'BigInt'].includes(field.type) && !isAutoincrement(field)) {
    colArgs.push('autoincrement=False')
  }
  // Prisma Migrate leaves a list's column nullable; the model reads it as a list all the same.
  if (field.isList) colArgs.push('nullable=True')

  // now() and @updatedAt take the clock of the process, in UTC: the database's NOW() is the
  // session zone's wall time in a timestamp column and drops MySQL's milliseconds. The
  // server_default is Prisma Migrate's, for the DDL, where MySQL holds it to the column's
  // precision.
  const hasNowDefault = isNowDefault(field)
  const nativeName = field.nativeType?.[0]
  const utcNow =
    nativeName === 'Date'
      ? 'lambda: utc_now().date()'
      : nativeName === 'Time'
        ? 'lambda: utc_now().time()'
        : nativeName === 'Timetz'
          ? 'lambda: utc_now().timetz()'
          : 'utc_now'
  // A DateTime with no native type is Prisma's DATETIME(3).
  const fsp = field.nativeType ? field.nativeType[1][0] : '3'
  const nowSql =
    provider === 'mysql' && utcNow === 'utc_now' && fsp !== undefined && fsp !== '0'
      ? `text("CURRENT_TIMESTAMP(${fsp})")`
      : 'text("CURRENT_TIMESTAMP")'

  const uuidVersion = uuidDefaultVersion(field)
  const dbGeneratedExpr =
    isFunctionDefault(field.default) &&
    field.default.name === 'dbgenerated' &&
    typeof field.default.args[0] === 'string'
      ? field.default.args[0]
      : null
  if (dbGeneratedExpr !== null) {
    // dbgenerated() is a raw DDL expression no client library can evaluate.
    colArgs.push(`server_default=text(${toPythonString(dbGeneratedExpr)})`)
  } else if (hasNowDefault) {
    colArgs.push(`default=${utcNow}`, `server_default=${nowSql}`)
  } else if (uuidVersion !== null) {
    // uuid6.uuid7 covers Python < 3.14 (stdlib uuid gains uuid7 in 3.14).
    const isNativeUuid = field.nativeType?.[0] === 'Uuid'
    colArgs.push(
      isNativeUuid
        ? uuidVersion === 7
          ? 'default=uuid6.uuid7'
          : 'default=uuid_mod.uuid4'
        : uuidVersion === 7
          ? 'default=lambda: str(uuid6.uuid7())'
          : 'default=lambda: str(uuid_mod.uuid4())',
    )
  } else if (isUlidDefault(field)) {
    colArgs.push('default=lambda: str(ULID())')
  } else if (!isPk || isAutoincrement(field)) {
    const defaultVal = formatDefault(field, enumMap.get(field.type))
    if (defaultVal !== null && !isPk) {
      colArgs.push(`default=${defaultVal}`)
      const sql = serverDefault(field, enumMap.get(field.type), provider)
      if (sql !== null) colArgs.push(`server_default=text(${toPythonString(sql)})`)
    }
  }

  // Prisma's @updatedAt also sets the value on create; without an insert
  // default the NOT NULL column fails on the first INSERT.
  if (field.isUpdatedAt) {
    if (!hasNowDefault) colArgs.push(`default=${utcNow}`)
    colArgs.push(`onupdate=${utcNow}`)
  }

  if (colArgs.length === 0) {
    return `    ${attrName}: Mapped[${typeHint}]`
  }

  return `    ${attrName}: Mapped[${typeHint}] = mapped_column(${colArgs.join(', ')})`
}

// The options Prisma Migrate gives each table: MySQL's character set and collation, and SQLite's
// AUTOINCREMENT on an @default(autoincrement()) key.
function tableOptions(provider: string, autoincrement: boolean) {
  if (provider === 'mysql')
    return '{"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}'
  return provider === 'sqlite' && autoincrement ? '{"sqlite_autoincrement": True}' : null
}

function generateTableArgs(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  indexes: readonly DMMF.Index[],
  provider: string,
) {
  const tableName = model.dbName ?? model.name
  const columnOf = (name: string) => model.fields.find((f) => f.name === name)?.dbName ?? name

  // Prisma Migrate makes every unique a unique index, named `<table>_<columns>_key`, and every
  // index `<table>_<columns>_idx`.
  const indexConstraints = indexes
    .filter(
      (idx) =>
        idx.model === model.name &&
        (idx.type === 'unique' || idx.type === 'normal' || idx.type === 'fulltext'),
    )
    .map((idx) => {
      const columns = idx.fields.map((f) => columnOf(f.name))
      const unique = idx.type === 'unique'
      const name =
        idx.dbName ?? constraintName(tableName, columns, unique ? 'key' : 'idx', provider)
      const cols = columns.map((c) => `"${c}"`).join(', ')
      return unique ? `Index("${name}", ${cols}, unique=True)` : `Index("${name}", ${cols})`
    })

  const fkConstraints = model.fields
    .filter(
      (f) =>
        f.kind === 'object' &&
        f.relationFromFields &&
        f.relationFromFields.length > 1 &&
        f.relationToFields,
    )
    .map((f) => {
      const target = allModels.find((m) => m.name === f.type)
      const targetTable = target?.dbName ?? f.type
      const localCols = (f.relationFromFields ?? []).map(columnOf)
      const targetCols = (f.relationToFields ?? []).map((c) => {
        const fieldObj = target?.fields.find((mf) => mf.name === c)
        return `"${targetTable}.${fieldObj?.dbName ?? c}"`
      })
      const onDelete = f.relationOnDelete ?? (f.isRequired ? 'Restrict' : 'SetNull')
      const onUpdate = f.relationOnUpdate ?? 'Cascade'
      const actions = [
        SQL_ACTION[onDelete] ? `, ondelete="${SQL_ACTION[onDelete]}"` : '',
        SQL_ACTION[onUpdate] ? `, onupdate="${SQL_ACTION[onUpdate]}"` : '',
      ].join('')
      const name = constraintName(tableName, localCols, 'fkey', provider)
      return `ForeignKeyConstraint([${localCols.map((c) => `"${c}"`).join(', ')}], [${targetCols.join(', ')}]${actions}, name="${name}")`
    })

  const options = tableOptions(
    provider,
    model.fields.some((f) => f.isId && isAutoincrement(f)),
  )
  const allConstraints = [
    ...indexConstraints,
    ...fkConstraints,
    ...(options === null ? [] : [options]),
  ]
  if (allConstraints.length === 0) return []

  return ['', '    __table_args__ = (', ...allConstraints.map((c) => `        ${c},`), '    )']
}

// What the ORM does with the children of a row it deletes, from what the database does with
// them. Left to its default, the ORM sets their foreign key to NULL first: right for SetNull,
// a NOT NULL failure for Cascade, and for Restrict a delete the database would have refused.
// Cascade deletes the children it has loaded and leaves the rest to the database; every other
// action is the database's alone.
function deleteClause(onDelete: string) {
  if (onDelete === 'SetNull') return ''
  if (onDelete === 'Cascade') return 'cascade="all, delete", passive_deletes=True, '
  return 'passive_deletes="all", '
}

function generateBelongsToRelationships(
  associations: ReturnType<typeof getAssociations>,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
) {
  return associations.belongsTo.map((assoc) => {
    const snakeName = pythonAttrName(makeSnakeCase(assoc.name))
    const snakeFk = pythonAttrName(makeSnakeCase(assoc.foreignKey))
    const backPop = findBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.foreignKey,
      allModels,
      assoc.name,
    )
    const needsFkParam = needsForeignKeysParam(assoc.targetModel, associations.belongsTo)
    const fkClause = needsFkParam ? `foreign_keys=[${snakeFk}], ` : ''
    // A self-referential many-to-one needs remote_side (the PK side) so the ORM
    // can tell which end is "one"; without it mapper configuration fails.
    const pkField = model.fields.find((f) => f.isId)
    const remoteClause =
      assoc.targetModel === model.name && pkField
        ? `remote_side=[${pythonAttrName(makeSnakeCase(pkField.name))}], `
        : ''
    const mappedType = assoc.optional
      ? `Optional["${makePascalCase(assoc.targetModel)}"]`
      : `"${makePascalCase(assoc.targetModel)}"`
    return `    ${snakeName}: Mapped[${mappedType}] = relationship(${remoteClause}${fkClause}back_populates="${backPop}")`
  })
}

function generateHasManyRelationships(
  associations: ReturnType<typeof getAssociations>,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
) {
  return associations.hasMany.map((assoc) => {
    const snakeName = pythonAttrName(makeSnakeCase(assoc.name))
    const backPop = findBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.foreignKey,
      allModels,
      assoc.name,
    )
    const targetModel = allModels.find((m) => m.name === assoc.targetModel)
    const needsFkParam = targetModel
      ? needsForeignKeysParam(model.name, getAssociations(targetModel, allModels).belongsTo)
      : false
    const targetFkSnake = pythonAttrName(makeSnakeCase(assoc.foreignKey))
    const fkClause = needsFkParam
      ? `foreign_keys="${makePascalCase(assoc.targetModel)}.${targetFkSnake}", `
      : ''
    return `    ${snakeName}: Mapped[list["${makePascalCase(assoc.targetModel)}"]] = relationship(${fkClause}${deleteClause(assoc.onDelete)}back_populates="${backPop}")`
  })
}

function generateHasOneRelationships(
  associations: ReturnType<typeof getAssociations>,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
) {
  return associations.hasOne.map((assoc) => {
    const snakeName = pythonAttrName(makeSnakeCase(assoc.name))
    const backPop = findBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.foreignKey,
      allModels,
      assoc.name,
    )
    const targetModel = allModels.find((m) => m.name === assoc.targetModel)
    const needsFkParam = targetModel
      ? needsForeignKeysParam(model.name, getAssociations(targetModel, allModels).belongsTo)
      : false
    const targetFkSnake = pythonAttrName(makeSnakeCase(assoc.foreignKey))
    const fkClause = needsFkParam
      ? `foreign_keys="${makePascalCase(assoc.targetModel)}.${targetFkSnake}", `
      : ''
    const mappedType = assoc.optional
      ? `Optional["${makePascalCase(assoc.targetModel)}"]`
      : `"${makePascalCase(assoc.targetModel)}"`
    return `    ${snakeName}: Mapped[${mappedType}] = relationship(${fkClause}${deleteClause(assoc.onDelete)}back_populates="${backPop}")`
  })
}

function generateManyToManyRelationships(
  associations: ReturnType<typeof getAssociations>,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  m2mTables: readonly {
    relationName: string
    tableName: string
    varName: string
    leftModel: string
    leftTable: string
    leftPkField: DMMF.Field | undefined
    rightModel: string
    rightTable: string
    rightPkField: DMMF.Field | undefined
  }[],
) {
  return associations.manyToMany.map((assoc) => {
    const snakeName = pythonAttrName(makeSnakeCase(assoc.name))
    const backPop = findM2MBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.name,
      assoc.relationName,
      allModels,
    )

    const table = m2mTables.find((t) => t.relationName === assoc.relationName)
    const secondaryVar = table?.varName ?? makeSnakeCase(assoc.relationName)

    // Both columns of a self join table reference the same table, so the relationship is told
    // which one holds this row. Prisma orders the two fields by name: the one that sorts first
    // lists the B of the rows whose A is this row, the other the A of the rows whose B is.
    const pkField = model.fields.find((f) => f.isId)
    const other = model.fields.find(
      (f) => f.kind === 'object' && f.relationName === assoc.relationName && f.name !== assoc.name,
    )
    const [own, far] = other && other.name < assoc.name ? ['B', 'A'] : ['A', 'B']
    const pk = `${makePascalCase(model.name)}.${pythonAttrName(makeSnakeCase(pkField?.name ?? 'id'))}`
    const joinClause =
      assoc.targetModel === model.name && other
        ? `primaryjoin=lambda: ${pk} == ${secondaryVar}.c.${own}, secondaryjoin=lambda: ${pk} == ${secondaryVar}.c.${far}, `
        : ''

    return `    ${snakeName}: Mapped[list["${makePascalCase(assoc.targetModel)}"]] = relationship(secondary=${secondaryVar}, ${joinClause}back_populates="${backPop}")`
  })
}

export function generateModelBody(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  indexes: readonly DMMF.Index[],
  m2mTables: readonly {
    relationName: string
    tableName: string
    varName: string
    leftModel: string
    leftTable: string
    leftPkField: DMMF.Field | undefined
    rightModel: string
    rightTable: string
    rightPkField: DMMF.Field | undefined
  }[],
  provider: string,
) {
  const idField = model.fields.find((f) => f.isId)
  const compositePkFieldNames = new Set(model.primaryKey?.fields)
  const isCompositePk = !idField && compositePkFieldNames.size > 0

  if (!(idField || isCompositePk)) return null

  const associations = getAssociations(model, allModels)
  const belongsToFkFields = new Set(associations.belongsTo.map((a) => a.foreignKey))

  const enumMap = new Map<string, DMMF.DatamodelEnum>((enums ?? []).map((e) => [e.name, e]))

  const tableName = model.dbName ?? model.name
  const scalarFields = model.fields.filter((f) => f.kind !== 'object')

  const columnLines = scalarFields.map((field) => {
    const isPk = field.isId || compositePkFieldNames.has(field.name)
    const isFk = belongsToFkFields.has(field.name)
    return generateColumn(field, isPk, isFk, associations, allModels, enumMap, provider, tableName)
  })

  const tableArgsLines = generateTableArgs(model, allModels, indexes, provider)

  const relationLines = [
    ...generateBelongsToRelationships(associations, model, allModels),
    ...generateHasManyRelationships(associations, model, allModels),
    ...generateHasOneRelationships(associations, model, allModels),
    ...generateManyToManyRelationships(associations, model, allModels, m2mTables),
  ]

  const hasRelations = relationLines.length > 0

  return [
    `class ${makePascalCase(model.name)}(Base):`,
    `    __tablename__ = "${tableName}"`,
    '',
    ...columnLines,
    ...tableArgsLines,
    ...(hasRelations ? [''] : []),
    ...relationLines,
  ].join('\n')
}

export function collectGlobalImports(
  models: readonly DMMF.Model[],
  _enums: readonly DMMF.DatamodelEnum[] | undefined,
  indexes: readonly DMMF.Index[],
  m2mTables: readonly {
    tableName: string
    varName: string
    leftModel: string
    leftTable: string
    leftPkField: DMMF.Field | undefined
    rightModel: string
    rightTable: string
    rightPkField: DMMF.Field | undefined
  }[],
  provider: string,
) {
  const saImports = new Set<string>()
  const needsUtcDateTime = usesUtcDateTime(models)
  const needsUtcTimestamp = provider === 'mysql' && usesNativeType(models, ['Timestamp'])
  const needsUtcType =
    needsUtcDateTime || (provider !== 'mysql' && usesNativeType(models, ['Timestamptz']))
  const needsUtcNow = models.some((m) => m.fields.some((f) => isNowDefault(f) || f.isUpdatedAt))
  // A DateTime is a `datetime` unless it holds a date or a time; `utc_now` returns one.
  const needsDatetime =
    needsUtcNow ||
    models.some((m) =>
      m.fields.some(
        (f) =>
          f.type === 'DateTime' && !['Date', 'Time', 'Timetz'].includes(f.nativeType?.[0] ?? ''),
      ),
    )
  // The UTC types take and return an Optional.
  const needsOptional =
    needsUtcType || models.some((m) => m.fields.some((f) => f.kind !== 'object' && !f.isRequired))
  const hasRelationship = models.some((m) => m.fields.some((f) => f.kind === 'object'))
  const needsFunc = needsUtcTimestamp
  const needsJsonb =
    provider === 'sqlite' && models.some((m) => m.fields.some((f) => f.type === 'Json'))
  const needsXml = usesNativeType(models, ['Xml'])
  // The types create_all declares as Prisma does through a compiler of their own: SQLite's
  // UtcDateTime and Jsonb, and PostgreSQL's Xml.
  const needsCompiles = (needsUtcDateTime && provider === 'sqlite') || needsJsonb || needsXml
  // A server_default is SQL text: a now(), a literal default off the key, a dbgenerated().
  const needsText =
    needsUtcTimestamp ||
    models.some((m) =>
      m.fields.some(
        (f) =>
          f.default !== undefined &&
          f.default !== null &&
          !(f.isId || m.primaryKey?.fields.includes(f.name)) &&
          (!isFunctionDefault(f.default) || ['now', 'dbgenerated'].includes(f.default.name)),
      ),
    )
  const needsAny = needsCompiles || models.some((m) => m.fields.some((f) => f.type === 'Json'))
  const needsArray = models.some((m) => m.fields.some((f) => f.kind !== 'object' && f.isList))
  const needsDecimal = models.some((m) => m.fields.some((f) => f.type === 'Decimal'))
  const needsUuid = models.some((m) =>
    m.fields.some((f) => {
      if (uuidDefaultVersion(f) === 4) return true
      if (!f.nativeType) return false
      const [n] = f.nativeType
      return n === 'Uuid'
    }),
  )
  const needsUuid7 = models.some((m) => m.fields.some((f) => uuidDefaultVersion(f) === 7))
  const needsUlid = models.some((m) => m.fields.some((f) => isUlidDefault(f)))
  const needsDate = usesNativeType(models, ['Date'])
  const needsTime = usesNativeType(models, ['Time', 'Timetz'])

  for (const model of models) {
    for (const field of model.fields) {
      if (field.kind === 'object') continue
      if (field.kind === 'enum') {
        if (provider !== 'sqlite') saImports.add('Enum')
        continue
      }
      // A scalar list wraps its element SA type in ARRAY(...), so that element
      // type needs importing too (e.g. ARRAY(String) needs String).
      if (field.isList || needsExplicitSaType(field, provider)) {
        saImports.add(resolveNativeType(field, provider).replace(/\(.*\)$/u, ''))
      }
    }

    const associations = getAssociations(model, models)
    if (associations.belongsTo.length > 0) saImports.add('ForeignKey')

    if (model.fields.some((f) => f.kind === 'object' && (f.relationFromFields?.length ?? 0) > 1)) {
      saImports.add('ForeignKeyConstraint')
    }

    if (
      indexes.some(
        (idx) =>
          idx.model === model.name &&
          (idx.type === 'unique' || idx.type === 'normal' || idx.type === 'fulltext'),
      )
    ) {
      saImports.add('Index')
    }
  }

  if (m2mTables.length > 0) {
    saImports.add('Column')
    saImports.add('ForeignKey')
    saImports.add('Index')
    saImports.add('Table')
    if (provider !== 'mysql' && provider !== 'sqlite') saImports.add('PrimaryKeyConstraint')
    for (const info of m2mTables) {
      const plain = plainType('String', provider)
      const leftType = info.leftPkField ? resolveNativeType(info.leftPkField, provider) : plain
      const rightType = info.rightPkField ? resolveNativeType(info.rightPkField, provider) : plain
      saImports.add(leftType.replace(/\(.*\)$/u, ''))
      saImports.add(rightType.replace(/\(.*\)$/u, ''))
    }
  }

  if (needsUtcType) {
    saImports.add('Dialect')
    saImports.add('TypeDecorator')
  }
  if (needsUtcDateTime && provider === 'sqlite') saImports.add('String')
  if (needsUtcTimestamp) {
    saImports.add('BindParameter')
    saImports.add('DateTime')
    saImports.add('ColumnElement')
  }
  if (needsText) saImports.add('text')
  if (needsFunc) saImports.add('func')
  if (needsArray) saImports.add('ARRAY')
  if (needsJsonb) saImports.add('JSON')
  if (needsXml) saImports.add('Text')
  // The base's key names, on PostgreSQL: MySQL's is PRIMARY and SQLite's has none.
  if (provider !== 'mysql' && provider !== 'sqlite') saImports.add('MetaData')
  for (const entry of annotationMapEntries(models, provider)) {
    saImports.add(entry.slice(entry.indexOf(': ') + 2).replace(/\(.*\)$/u, ''))
  }

  const lines: string[] = []

  const sortedSa = [...saImports]
    .filter((name) => !MODULE_TYPES.has(name) && !DIALECT_TYPES.has(name))
    .toSorted()
  if (sortedSa.length > 0) {
    lines.push(`from sqlalchemy import ${sortedSa.join(', ')}`)
  }
  // The dialect's own types, where they carry the precision: the columns' and what the UTC types
  // are made on.
  const dialectTypes = [...saImports].filter((name) => DIALECT_TYPES.has(name))
  if (provider === 'mysql') {
    if (needsUtcDateTime) dialectTypes.push('DATETIME')
    if (needsUtcTimestamp) dialectTypes.push('TIMESTAMP')
  } else if (provider !== 'sqlite' && needsUtcType) {
    dialectTypes.push('TIMESTAMP')
  }
  if (dialectTypes.length > 0) {
    const dialect = provider === 'mysql' ? 'mysql' : 'postgresql'
    lines.push(`from sqlalchemy.dialects.${dialect} import ${dialectTypes.toSorted().join(', ')}`)
  }
  if (needsCompiles) lines.push('from sqlalchemy.ext.compiler import compiles')

  const ormImports = ['DeclarativeBase', 'Mapped', 'mapped_column']
  if (hasRelationship) ormImports.push('relationship')
  lines.push(`from sqlalchemy.orm import ${ormImports.toSorted().join(', ')}`)

  const typingImports = [needsAny ? 'Any' : null, needsOptional ? 'Optional' : null].filter(
    (i) => i !== null,
  )
  if (typingImports.length > 0) {
    lines.push(`from typing import ${typingImports.join(', ')}`)
  }

  if (needsDecimal) lines.push('from decimal import Decimal as DecimalType')
  const dtParts: string[] = []
  if (needsDatetime) dtParts.push('datetime')
  if (needsDate) dtParts.push('date')
  if (needsTime) dtParts.push('time as time_type')
  if (needsUtcType || needsUtcNow) dtParts.push('timezone')
  if (dtParts.length > 0) lines.push(`from datetime import ${dtParts.join(', ')}`)
  if (needsUuid) lines.push('import uuid as uuid_mod')
  if (needsUuid7) lines.push('import uuid6')
  if (needsUlid) lines.push('from ulid import ULID')

  return lines
}

/**
 * The declarative base, after the types a DateTime is read through: every instant is UTC, aware
 * in Python, as Prisma Client writes and reads it. SQLite keeps it as Prisma's text
 * (`2030-01-02T03:04:05.678+00:00`) in a column declared DATETIME, as Prisma's is, a timestamp
 * without time zone holds UTC whatever the session's zone, and `utc_now` is the process's clock
 * for `now()` and `@updatedAt`. The base names keys as Prisma Migrate does and maps each Python
 * type to the column Prisma Migrate gives it where SQLAlchemy's own is another.
 */
export function generateBase(models: readonly DMMF.Model[], provider: string) {
  const needsUtcDateTime = usesUtcDateTime(models)
  const needsUtcTimestamp = provider === 'mysql' && usesNativeType(models, ['Timestamp'])
  // UtcTimestamp puts TIMESTAMP where this has DATETIME: both are a DateTime to mypy.
  const impl =
    provider !== 'mysql'
      ? 'impl = TIMESTAMP'
      : needsUtcTimestamp
        ? 'impl: type[DateTime] = DATETIME'
        : 'impl = DATETIME'
  const utcDateTime = !needsUtcDateTime
    ? []
    : provider === 'sqlite'
      ? [
          'class UtcDateTime(TypeDecorator[datetime]):',
          '    """UTC text with milliseconds, `2030-01-02T03:04:05.678+00:00`; a naive value is UTC."""',
          '',
          '    impl = String',
          '    cache_ok = True',
          '',
          '    def process_bind_param(self, value: Optional[datetime], dialect: Dialect) -> Optional[str]:',
          '        if value is None:',
          '            return None',
          '        aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)',
          '        return aware.astimezone(timezone.utc).isoformat(timespec="milliseconds")',
          '',
          '    def process_result_value(self, value: Optional[str], dialect: Dialect) -> Optional[datetime]:',
          '        if value is None:',
          '            return None',
          '        read = datetime.fromisoformat(value)',
          '        return read.replace(tzinfo=timezone.utc) if read.tzinfo is None else read.astimezone(timezone.utc)',
          '',
          '',
          '@compiles(UtcDateTime)',
          'def utc_date_time_ddl(type_: UtcDateTime, compiler: Any, **kw: Any) -> str:',
          '    """The column Prisma Migrate declares: DATETIME, which keeps the text as it is."""',
          '    return "DATETIME"',
          '',
          '',
        ]
      : [
          'class UtcDateTime(TypeDecorator[datetime]):',
          '    """A timestamp without time zone that holds UTC: an aware value is stored in UTC."""',
          '',
          `    ${impl}`,
          '    cache_ok = True',
          '',
          '    def process_bind_param(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:',
          '        if value is None or value.tzinfo is None:',
          '            return value',
          '        return value.astimezone(timezone.utc).replace(tzinfo=None)',
          '',
          '    def process_result_value(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:',
          '        return None if value is None else value.replace(tzinfo=timezone.utc)',
          '',
          '',
        ]
  const utcDateTimeTz =
    provider !== 'mysql' && usesNativeType(models, ['Timestamptz'])
      ? [
          'class UtcDateTimeTz(TypeDecorator[datetime]):',
          '    """A timestamptz: a naive value is UTC, not the session\'s zone, and reads are UTC."""',
          '',
          '    impl = TIMESTAMP',
          '    cache_ok = True',
          '',
          '    def __init__(self, precision: Optional[int] = None) -> None:',
          '        super().__init__(timezone=True, precision=precision)',
          '',
          '    def process_bind_param(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:',
          '        return value if value is None or value.tzinfo else value.replace(tzinfo=timezone.utc)',
          '',
          '    def process_result_value(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:',
          '        return None if value is None else value.astimezone(timezone.utc)',
          '',
          '',
        ]
      : []
  // MySQL converts a TIMESTAMP from the session's time_zone to UTC and back; CONVERT_TZ undoes
  // that on both sides, so the column holds the instant under any session zone.
  const utcTimestamp = needsUtcTimestamp
    ? [
        'class UtcTimestamp(UtcDateTime):',
        '    """A TIMESTAMP, which the server shifts by the session\'s time_zone: shifted back here."""',
        '',
        '    impl = TIMESTAMP',
        '    cache_ok = True',
        '',
        '    def bind_expression(self, value: BindParameter[datetime]) -> ColumnElement[datetime]:',
        '        return func.convert_tz(value, "+00:00", text("@@session.time_zone"), type_=self)',
        '',
        '    def column_expression(self, column: ColumnElement[datetime]) -> ColumnElement[datetime]:',
        '        return func.convert_tz(column, text("@@session.time_zone"), "+00:00", type_=self)',
        '',
        '',
      ]
    : []
  const jsonb =
    provider === 'sqlite' && models.some((m) => m.fields.some((f) => f.type === 'Json'))
      ? [
          'class Jsonb(JSON):',
          '    """SQLite\'s Json column, which Prisma Migrate declares JSONB and fills with JSON text."""',
          '',
          '',
          '@compiles(Jsonb)',
          'def jsonb_ddl(type_: Jsonb, compiler: Any, **kw: Any) -> str:',
          '    return "JSONB"',
          '',
          '',
        ]
      : []
  const xml = usesNativeType(models, ['Xml'])
    ? [
        'class Xml(Text):',
        '    """PostgreSQL\'s xml, read and written as its text."""',
        '',
        '',
        '@compiles(Xml)',
        'def xml_ddl(type_: Xml, compiler: Any, **kw: Any) -> str:',
        '    return "XML"',
        '',
        '',
      ]
    : []
  const utcNow = models.some((m) => m.fields.some((f) => isNowDefault(f) || f.isUpdatedAt))
    ? ['def utc_now() -> datetime:', '    return datetime.now(timezone.utc)', '', '']
    : []
  const annotations = annotationMapEntries(models, provider)
  const body = [
    // Prisma Migrate's name for a key, `<table>_pkey`.
    ...(provider === 'mysql' || provider === 'sqlite'
      ? []
      : ['    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})']),
    ...(annotations.length > 0 ? [`    type_annotation_map = {${annotations.join(', ')}}`] : []),
  ]
  return [
    ...utcDateTime,
    ...utcDateTimeTz,
    ...utcTimestamp,
    ...jsonb,
    ...xml,
    ...utcNow,
    'class Base(DeclarativeBase):',
    ...(body.length > 0 ? body : ['    pass']),
  ]
}
