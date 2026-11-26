import type { DMMF } from '@prisma/generator-helper'

import { stripAnnotations } from '../annotation/index.js'
import { isSameList } from '../list/index.js'
import { constraintName, indexPrefix } from '../naming/case.js'
import { allocate } from '../naming/index.js'
import {
  implicitJoinTables,
  isAutoincrement,
  isFunctionDefault,
  primaryKeyFields,
  relationEnds,
} from '../prisma/model.js'
import { INDEX_METHODS, operatorClassName } from '../prisma/postgres.js'

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

const GORM_NATIVE_FIXED: { [k: string]: string } = {
  Text: 'text',
  MediumText: 'text',
  LongText: 'text',
  TinyText: 'text',
  SmallInt: 'smallint',
  TinyInt: 'smallint',
  MediumInt: 'mediumint',
  DoublePrecision: 'double precision',
  Double: 'double precision',
  Real: 'double precision',
  Uuid: 'char(36)',
  Date: 'date',
  JsonB: 'jsonb',
  Xml: 'xml',
}

// A time's precision and zone are kept: `timestamp` would turn a timestamptz column into
// one without a zone, and a (0) into the dialect's default.
const GORM_NATIVE_TEMPORAL = new Set(['Timestamp', 'Timestamptz', 'DateTime', 'Time', 'Timetz'])

// The column Prisma Migrate makes for a native type on MySQL, PostgreSQL or CockroachDB where the table above
// gives another, its arguments after it (`char(2)`, `bit(3)`). A Go int holds every unsigned
// integer column but a bigint unsigned past int64, which Prisma's BigInt does not hold either.
const POSTGRES_COMPATIBLE_NATIVE_TYPES = {
  Char: 'char',
  Uuid: 'uuid',
  Inet: 'inet',
  Bit: 'bit',
  VarBit: 'varbit',
  Oid: 'oid',
}

const PROVIDER_NATIVE_TYPES: {
  readonly [provider: string]: { readonly [name: string]: string } | undefined
} = {
  mysql: {
    Char: 'char',
    TinyText: 'tinytext',
    MediumText: 'mediumtext',
    LongText: 'longtext',
    TinyInt: 'tinyint',
    UnsignedTinyInt: 'tinyint unsigned',
    UnsignedSmallInt: 'smallint unsigned',
    UnsignedMediumInt: 'mediumint unsigned',
    UnsignedInt: 'int unsigned',
    UnsignedBigInt: 'bigint unsigned',
    Year: 'year',
    Binary: 'binary',
    VarBinary: 'varbinary',
    TinyBlob: 'tinyblob',
    Blob: 'blob',
    MediumBlob: 'mediumblob',
  },
  postgresql: {
    ...POSTGRES_COMPATIBLE_NATIVE_TYPES,
    VarChar: 'varchar',
    Real: 'real',
  },
  cockroachdb: POSTGRES_COMPATIBLE_NATIVE_TYPES,
}

/** The column of a native type that PROVIDER_NATIVE_TYPES names, or undefined where it names none. */
function providerNativeType(field: DMMF.Field, provider: string | undefined) {
  if (!field.nativeType) return undefined
  const [nativeName, nativeArgs] = field.nativeType
  // A MySQL Boolean is given no type, whatever its native type: GORM makes a bool BOOLEAN, which
  // is what Prisma Migrate makes of @db.TinyInt (a @db.Bit(1) is BIT(1) there).
  if (provider === 'mysql' && field.type === 'Boolean') return null
  const type = PROVIDER_NATIVE_TYPES[provider ?? '']?.[nativeName]
  if (type === undefined) return undefined
  const args = nativeArgs ?? []
  return args.length > 0 ? `${type}(${args.join(',')})` : type
}

function resolveNativeType(field: DMMF.Field, provider: string | undefined) {
  if (!field.nativeType) return null
  const providerType = providerNativeType(field, provider)
  if (providerType !== undefined) return providerType

  const [nativeName, nativeArgs] = field.nativeType
  const args = nativeArgs ?? []

  if (nativeName === 'VarChar' || nativeName === 'Char') {
    return args.length > 0 ? `varchar(${args[0]})` : null
  }
  // A PostgreSQL money column is held in Money, which names it to AutoMigrate as well.
  if (isMoney(field, provider)) return 'money'
  if (nativeName === 'Decimal' || nativeName === 'Money') {
    return args.length >= 2 ? `decimal(${args[0]},${args[1]})` : 'decimal'
  }
  if (GORM_NATIVE_TEMPORAL.has(nativeName)) {
    const name = nativeName.toLowerCase()
    return args.length > 0 ? `${name}(${args[0]})` : name
  }
  return GORM_NATIVE_FIXED[nativeName] ?? null
}

/**
 * A relation through the foreign key `fkField` holds, which is on either end of it. A referential
 * action the schema leaves out is Prisma's: `Restrict` on delete for a required relation (`NoAction`
 * on SQL Server, which has no RESTRICT) and `SetNull` for an optional one, `Cascade` on update.
 */
function foreignKeyAssociation(
  name: string,
  targetModel: string,
  fkField: DMMF.Field,
  provider: string | undefined,
) {
  const requiredOnDelete = provider === 'sqlserver' ? 'NoAction' : 'Restrict'
  const foreignKeys = fkField.relationFromFields ?? []
  return {
    name,
    targetModel,
    foreignKey: foreignKeys[0] ?? '',
    references: fkField.relationToFields?.[0] ?? 'id',
    foreignKeys,
    referencesList: fkField.relationToFields ?? ['id'],
    // The relation field that holds the foreign key, whose @relation(map: ...) names it.
    fkFieldName: fkField.name,
    onDelete: fkField.relationOnDelete ?? (fkField.isRequired ? requiredOnDelete : 'SetNull'),
    onUpdate: fkField.relationOnUpdate ?? 'Cascade',
  }
}

type ForeignKeyAssociation = ReturnType<typeof foreignKeyAssociation>

function getAssociations(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  provider: string | undefined,
) {
  const belongsTo: ForeignKeyAssociation[] = []
  const hasMany: (ForeignKeyAssociation & { isList: boolean })[] = []
  const hasOne: (ForeignKeyAssociation & { isList: boolean })[] = []
  const manyToMany: {
    name: string
    targetModel: string
    relationName: string
    isSideA: boolean
  }[] = []

  for (const end of relationEnds(model, allModels)) {
    const { field } = end
    if (end.kind === 'belongsTo') {
      belongsTo.push(foreignKeyAssociation(field.name, field.type, field, provider))
      continue
    }
    if (end.kind === 'manyToMany') {
      manyToMany.push({
        name: field.name,
        targetModel: field.type,
        relationName: field.relationName ?? `${model.name}To${field.type}`,
        isSideA: end.isSideA,
      })
      continue
    }
    const association = {
      ...foreignKeyAssociation(field.name, field.type, end.inverse, provider),
      isList: end.kind === 'hasMany',
    }
    if (end.kind === 'hasMany') hasMany.push(association)
    else hasOne.push(association)
  }

  return { belongsTo, hasMany, hasOne, manyToMany }
}

function formatGoDefault(def: DMMF.Field['default'], type: string, kind: DMMF.FieldKind) {
  if (def === undefined || def === null) return null
  if (typeof def === 'boolean') return def ? 'true' : 'false'
  if (typeof def === 'number') return String(def)
  if (typeof def !== 'string') return null
  // BigInt and Decimal literals reach the DMMF as strings; GORM parses an
  // integer or float column's default with strconv, which a quote fails.
  if (type === 'BigInt' || type === 'Decimal') return def
  // The value lives inside the struct tag (escapeTagValue). Quoted, so
  // `default:USER` is not read as the identifier USER. A string column's
  // default is a value to GORM: it trims the quotes and writes the rest into
  // the row, so a `'` inside is not doubled. Every other default, and a string
  // with parentheses, is an SQL expression GORM puts into DDL as it is, where
  // the SQL quote doubles.
  const isValue =
    (type === 'String' || kind === 'enum') && !(def.includes('(') && def.includes(')'))
  return `'${escapeTagValue(isValue ? def : def.replaceAll("'", "''"))}'`
}

// A value inside the struct tag: `"` and `\` are written as the two-character sequences \" and
// \\ (reflect.StructTag unquotes them), a `;` as \\; (GORM's tag parser rejoins what it
// escapes), and a line break or tab as \n, \r, \t, which keeps the tag on one line.
function escapeTagValue(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll(';', '\\\\;')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
}

/** Whether a field is one DateTime, held by one of the time types written beside the models. */
function isDateTimeScalar(field: DMMF.Field) {
  return field.kind === 'scalar' && field.type === 'DateTime' && !field.isList
}

/** Whether a field is a DateTime[] (PostgreSQL), held by one of the list types beside the models. */
function isDateTimeList(field: DMMF.Field) {
  return field.kind === 'scalar' && field.type === 'DateTime' && field.isList
}

function dateTimeElement(nativeName: string | undefined): 'Date' | 'TimeOfDay' | 'DateTime' {
  if (nativeName === 'Date') return 'Date'
  return nativeName === 'Time' || nativeName === 'Timetz' ? 'TimeOfDay' : 'DateTime'
}

/**
 * The type written beside the models that holds a DateTime field: a date or a time of day where
 * the native type keeps only that much of it, an instant otherwise; a list of them for a
 * DateTime[].
 */
function dateTimeGoType(field: DMMF.Field) {
  const element = dateTimeElement(field.nativeType?.[0])
  return field.isList ? (`${element}List` as const) : element
}

// An enum default arrives as the Prisma-level value name; the column stores
// the @map-ped database value.
function enumMappedDefault(field: DMMF.Field, enums: readonly DMMF.DatamodelEnum[] | undefined) {
  if (!(field.kind === 'enum' && typeof field.default === 'string')) return null
  const value = enums
    ?.find((e) => e.name === field.type)
    ?.values.find((v) => v.name === field.default)
  return formatGoDefault(value?.dbName ?? field.default, field.type, field.kind)
}

// dbgenerated() is a raw DDL expression, valid on any column including the PK. It is kept as the
// schema has it, escaped for the tag (escapeTagValue), so one that spans lines stays readable.
function dbGeneratedDefault(field: DMMF.Field) {
  const expression =
    isFunctionDefault(field.default) && field.default.name === 'dbgenerated'
      ? field.default.args[0]
      : undefined
  return typeof expression === 'string' ? escapeTagValue(expression) : null
}

// A DateTime literal is written as the model writes the value (BeforeCreate fills it, so this
// is what the table's DDL and a create that skips hooks see): an ISO string on SQLite, where
// the text is compared, and the UTC value elsewhere.
function dateTimeDefault(field: DMMF.Field, provider: string | undefined) {
  if (!(isDateTimeScalar(field) && typeof field.default === 'string')) return null
  const iso = new Date(field.default).toISOString()
  const goType = dateTimeGoType(field)
  if (goType === 'Date') return `'${iso.slice(0, 10)}'`
  if (goType === 'TimeOfDay') return `'${iso.slice(11, 23)}'`
  return provider === 'sqlite'
    ? `'${iso.replace('Z', '+00:00')}'`
    : `'${iso.slice(0, 10)} ${iso.slice(11, 23)}'`
}

// Prisma's PostgreSQL connector, which CockroachDB's shares, and GORM's postgres driver.
function isPostgresFamily(provider: string | undefined) {
  return provider === 'postgresql' || provider === 'cockroachdb'
}

/** A PostgreSQL `Decimal @db.Money` that is not a list: held in the Money type beside the models. */
function isMoney(field: DMMF.Field, provider: string | undefined) {
  return (
    provider === 'postgresql' &&
    field.type === 'Decimal' &&
    field.nativeType?.[0] === 'Money' &&
    !field.isList
  )
}

/** A PostgreSQL `Json @db.Json` that is not a list: held in the PlainJSON type beside the models. */
function isPlainJson(field: DMMF.Field, provider: string | undefined) {
  return (
    provider === 'postgresql' &&
    field.type === 'Json' &&
    field.nativeType?.[0] === 'Json' &&
    !field.isList
  )
}

function usesMoney(models: readonly DMMF.Model[], provider: string | undefined) {
  return models.some((m) => m.fields.some((f) => isMoney(f, provider)))
}

function usesPlainJson(models: readonly DMMF.Model[], provider: string | undefined) {
  return models.some((m) => m.fields.some((f) => isPlainJson(f, provider)))
}

function gormDefault(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  provider: string | undefined,
) {
  const isNowDefault =
    field.type === 'DateTime' && isFunctionDefault(field.default) && field.default.name === 'now'
  // Prisma Migrate writes now() as DEFAULT CURRENT_TIMESTAMP; the hook fills the value all the same.
  const nowDefault = isNowDefault && isPostgresFamily(provider) ? 'CURRENT_TIMESTAMP' : null
  const value =
    dbGeneratedDefault(field) ??
    dateTimeDefault(field, provider) ??
    nowDefault ??
    (keepsLiteralDefault(field, isPk, isCompositePk) && !isNowDefault && field.isUpdatedAt !== true
      ? (enumMappedDefault(field, enums) ?? formatGoDefault(field.default, field.type, field.kind))
      : null)
  return value !== null && isMoney(field, provider) ? moneyDefault(value) : value
}

// A single key's literal default is left out, except an integer key's: that key says
// autoIncrement:false (isImplicitAutoIncrement), and GORM puts the default: tag's literal in place
// of a zero one, as the column's DEFAULT would.
function keepsLiteralDefault(field: DMMF.Field, isPk: boolean, isCompositePk: boolean) {
  if (!isPk || isCompositePk) return true
  return ['Int', 'BigInt'].includes(field.type) && !isFunctionDefault(field.default)
}

// GORM parses a number default into a float64 and inserts it bare where the field is zero, past
// Money's numeric cast; in parentheses it is not parsed, and the column is left to its DEFAULT.
function moneyDefault(value: string) {
  return /^-?[\d.]+$/u.test(value) ? `(${value})` : value
}

// GORM makes an integer key auto-increment unless its tag says autoIncrement either way: a key
// with no autoincrement() would take a sequence default on PostgreSQL (a bigint one where the
// native type is @db.SmallInt) and AUTO_INCREMENT on MySQL, where Prisma makes a plain integer
// column. With autoIncrement:false GORM writes the field in an INSERT even when it is zero, as
// such a key's value comes from the caller (or the row it belongs to).
// A key the database fills with no `default:` tag (autoincrement(), CockroachDB's sequence()) stays
// one GORM leaves out of the INSERT when zero and reads back. A dbgenerated() key carries its
// `default:` tag, which does the same; were GORM to make it auto-increment as well, AutoMigrate
// would write a serial type beside the DEFAULT, which PostgreSQL refuses ("multiple default values").
// A bare dbgenerated(), whose expression the schema does not say, has no `default:` tag, so it is
// left to GORM as autoincrement() is.
const DATABASE_FILLED_DEFAULTS = new Set(['autoincrement', 'sequence'])

function isImplicitAutoIncrement(field: DMMF.Field, gormPicksKey: boolean) {
  const isInteger =
    field.kind === 'scalar' && !field.isList && ['Int', 'BigInt'].includes(field.type)
  const isDatabaseFilled =
    isFunctionDefault(field.default) &&
    (DATABASE_FILLED_DEFAULTS.has(field.default.name) ||
      (field.default.name === 'dbgenerated' && dbGeneratedDefault(field) === null))
  return gormPicksKey && isInteger && !isDatabaseFilled
}

function primaryKeyTags(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
  provider: string | undefined,
  gormPicksKey: boolean | undefined,
) {
  // Prisma allows autoincrement() on a @unique field that is not the key (a serial column on
  // PostgreSQL, AUTO_INCREMENT on MySQL). GORM gives such a column its default only when the tag
  // says autoIncrement, and leaves the field out of an INSERT while it is zero; without it GORM
  // makes a plain column and writes 0. On SQL Server and MySQL the column is written on create only
  // (where GORM leaves it out while it is zero): SQL Server refuses to update an IDENTITY, which
  // GORM's driver leaves out of an UPDATE only for the key it picks, and on MySQL, which has no
  // RETURNING, the field stays 0 after a create, which a Save would otherwise write over the
  // database's value. Elsewhere it is read back on create and can be updated, as with Prisma.
  if (!isPk) {
    if (!isAutoincrement(field)) return []
    return provider === 'sqlserver' || provider === 'mysql'
      ? ['autoIncrement', '<-:create']
      : ['autoIncrement']
  }
  const defaultName = isFunctionDefault(field.default) ? field.default.name : undefined
  // A native type wins (columnTypeTag); on MySQL such a key is a String like any other,
  // VARCHAR(191) (isMysqlDefaultString), and on PostgreSQL text, as Prisma Migrate makes it.
  const fixedType =
    provider !== 'mysql' &&
    !isPostgresFamily(provider) &&
    resolveNativeType(field, provider) === null
  return [
    'primaryKey',
    ...(isAutoincrement(field) ? ['autoIncrement'] : []),
    // Unless the caller says which key field GORM picks, a single-field key is the one.
    ...(isImplicitAutoIncrement(field, gormPicksKey ?? !isCompositePk)
      ? ['autoIncrement:false']
      : []),
    ...(fixedType && defaultName === 'uuid' ? ['type:char(36)'] : []),
    ...(fixedType && defaultName === 'ulid' ? ['type:char(26)'] : []),
  ]
}

// Prisma Migrate makes a String with no native type VARCHAR(191) on MySQL, a uuid() or ulid()
// key included; GORM would make it longtext, which MySQL cannot index without a key length (a
// @unique String fails AutoMigrate).
function isMysqlDefaultString(field: DMMF.Field, provider: string | undefined) {
  if (provider !== 'mysql' || field.type !== 'String' || field.kind !== 'scalar') return false
  return !field.isList && !field.nativeType
}

// The column Prisma Migrate makes on PostgreSQL where GORM's postgres driver would make another:
// GORM gives a float64 `decimal` and a time `timestamptz`.
const POSTGRES_DEFAULT_TYPES: { readonly [type: string]: string } = {
  Float: 'double precision',
  Decimal: 'decimal(65,30)',
  DateTime: 'timestamp(3)',
}

// The column Prisma Migrate makes of a type with no native type, by provider: on MySQL GORM makes
// a float64 Decimal a `double`.
const DEFAULT_TYPES: {
  readonly [provider: string]: { readonly [type: string]: string } | undefined
} = {
  postgresql: POSTGRES_DEFAULT_TYPES,
  cockroachdb: POSTGRES_DEFAULT_TYPES,
  mysql: { Decimal: 'decimal(65,30)' },
}

// The element type of the array column Prisma Migrate makes for a scalar list on PostgreSQL.
const SCALAR_LIST_ELEMENTS: { readonly [type: string]: string } = {
  String: 'text',
  Int: 'integer',
  BigInt: 'bigint',
  Float: 'double precision',
  Decimal: 'decimal(65,30)',
  Boolean: 'boolean',
}

/**
 * Whether a field is a scalar list held in ScalarList: a PostgreSQL array column, which Prisma makes
 * for every scalar list (Prisma has lists on no other SQL database). A DateTime[] has its own list
 * types, and a Json[] or Bytes[] keeps the json serializer.
 */
function isScalarList(field: DMMF.Field, provider: string | undefined) {
  return (
    isPostgresFamily(provider) &&
    field.isList &&
    // PostgreSQL prints money with its currency symbol and separators, which no float reads.
    field.nativeType?.[0] !== 'Money' &&
    (field.kind === 'enum' ||
      (field.kind === 'scalar' && SCALAR_LIST_ELEMENTS[field.type] !== undefined))
  )
}

// A native type's name as PostgreSQL (and CockroachDB) write it, where it is not the lower-cased
// Prisma name.
const LIST_NATIVE_NAMES: { readonly [name: string]: string } = {
  DoublePrecision: 'double precision',
  // CockroachDB's single-byte "char", quoted as the struct tag holds it.
  CatalogSingleChar: '\\"char\\"',
}

/**
 * The array column Prisma makes for a scalar list: of the native type the schema names, as Prisma
 * writes it (`@db.Uuid` is `uuid[]`, `@db.Char(2)` `char(2)[]`), or else of the element's default
 * type. CockroachDB reads `integer` as INT8, so an Int list there is `int4[]`, as Prisma makes it.
 * An enum list is read and written as text, as an enum is.
 */
function scalarListColumnType(field: DMMF.Field, provider: string | undefined) {
  if (field.nativeType) {
    const [name, args] = field.nativeType
    const params = (args ?? []).length > 0 ? `(${(args ?? []).join(',')})` : ''
    return `${LIST_NATIVE_NAMES[name] ?? name.toLowerCase()}${params}[]`
  }
  if (field.kind === 'enum') return 'text[]'
  if (provider === 'cockroachdb' && field.type === 'Int') return 'int4[]'
  return `${SCALAR_LIST_ELEMENTS[field.type] ?? 'text'}[]`
}

function usesScalarList(models: readonly DMMF.Model[], provider: string | undefined) {
  return models.some((m) => m.fields.some((f) => isScalarList(f, provider)))
}

// GORM's PostgreSQL and SQL Server drivers make an autoIncrement column serial or IDENTITY only
// from their own integer types; a `type:` they do not know is written as given, without a default.
// An autoincrement column with a native integer type (@db.SmallInt or @db.TinyInt, which write
// `type:smallint`) is therefore given its serial or IDENTITY form: SMALLSERIAL on PostgreSQL,
// `smallint IDENTITY(1,1)` on SQL Server (where Prisma Migrate makes a @db.TinyInt TINYINT, as
// GORM_NATIVE_FIXED does not). MySQL's driver adds AUTO_INCREMENT only to its own integer types as
// well, so there any native type (`smallint`, `mediumint`, `int unsigned`, ...) carries it.
function serialType(field: DMMF.Field, nativeType: string, provider: string | undefined) {
  if (!isAutoincrement(field)) return undefined
  if (provider === 'mysql') return `${nativeType} AUTO_INCREMENT`
  if (nativeType !== 'smallint') return undefined
  if (provider === 'postgresql') return 'smallserial'
  return provider === 'sqlserver' ? 'smallint IDENTITY(1,1)' : undefined
}

function columnTypeTag(field: DMMF.Field, provider?: string) {
  if (isScalarList(field, provider)) return `type:${scalarListColumnType(field, provider)}`
  const nativeType = resolveNativeType(field, provider)
  // A DateTime[] is a PostgreSQL array, `timestamp(3)[]` unless the native type says otherwise,
  // which the list type writes and reads as Prisma Client does.
  if (isDateTimeList(field)) return `type:${nativeType ?? 'timestamp(3)'}[]`
  if (isMysqlDefaultString(field, provider)) return 'type:varchar(191)'
  if (nativeType !== null) return `type:${serialType(field, nativeType, provider) ?? nativeType}`
  const defaultType =
    field.kind === 'scalar' && !field.isList
      ? DEFAULT_TYPES[provider ?? '']?.[field.type]
      : undefined
  return defaultType === undefined ? null : `type:${defaultType}`
}

// A Go int is 64 bits, which GORM makes a bigint (bigserial with autoIncrement); Prisma's Int is
// 32 bits, `integer` (`serial`) on PostgreSQL and INT on MySQL, as is an Int @db.Int on MySQL or
// SQL Server or @db.Integer on PostgreSQL. CockroachDB reads `integer` as INT8 whatever the size, so it is left
// as it was. A MySQL @db.Float is a FLOAT, which GORM makes of a float64 32 bits wide (it reads
// `type:float` as its own float type, a double for a float64).
const INT32_NATIVE_NAMES: { readonly [provider: string]: string | undefined } = {
  mysql: 'Int',
  postgresql: 'Integer',
  sqlserver: 'Int',
}

function sizeTag(field: DMMF.Field, provider: string | undefined) {
  if (field.kind !== 'scalar' || field.isList) return null
  const nativeName = field.nativeType?.[0]
  const isInt32 =
    field.type === 'Int' &&
    provider !== 'cockroachdb' &&
    (nativeName === undefined || nativeName === INT32_NATIVE_NAMES[provider ?? ''])
  const isMysqlFloat = provider === 'mysql' && field.type === 'Float' && nativeName === 'Float'
  return isInt32 || isMysqlFloat ? 'size:32' : null
}

// GORM fills a field named CreatedAt or UpdatedAt on its own, a time with the application's
// clock bound as a time.Time the driver formats and a number with the Unix seconds; the hooks
// fill what the schema asks for, and a number is the caller's.
function trackedTimeTags(field: DMMF.Field, fieldName: string) {
  const isTracked = isDateTimeScalar(field) || ['Int', 'BigInt'].includes(field.type)
  if (!isTracked) return []
  return [
    ...(fieldName === 'CreatedAt' ? ['autoCreateTime:false'] : []),
    ...(fieldName === 'UpdatedAt' ? ['autoUpdateTime:false'] : []),
  ]
}

// SQLite does not make a key column NOT NULL (an INTEGER PRIMARY KEY puts a new rowid in place of a
// NULL; any other key column takes it), so every key column is marked, as Prisma Migrate marks it,
// apart from an autoincrementing one, which GORM makes the rowid itself. PostgreSQL and MySQL make
// every key column NOT NULL.
function keyNeedsNotNull(field: DMMF.Field, provider: string | undefined) {
  return provider === 'sqlite' && !isAutoincrement(field)
}

export function buildGormTags(
  field: DMMF.Field,
  isPk: boolean,
  isCompositePk: boolean,
  compositeIndexTags: readonly string[],
  enums?: readonly DMMF.DatamodelEnum[],
  provider?: string,
  fieldName = goFieldName(field.name),
  gormPicksKey?: boolean,
) {
  const columnName = field.dbName ?? field.name
  const defaultVal = gormDefault(field, isPk, isCompositePk, enums, provider)
  // GORM joins a setting that ends in `\` with the next one, so such a default (a dbgenerated()
  // expression) is the last setting; GORM reads the settings in any order.
  const defaultSetting = defaultParts(defaultVal)

  const parts = [
    `column:${escapeTagValue(columnName)}`,
    ...primaryKeyTags(field, isPk, isCompositePk, provider, gormPicksKey),
    // A model's own unique fields come named in compositeIndexTags.
    field.isUnique && !compositeIndexTags.some((tag) => tag.startsWith('uniqueIndex:'))
      ? 'uniqueIndex'
      : null,
    ...compositeIndexTags,
    columnTypeTag(field, provider),
    sizeTag(field, provider),
    // A list ScalarList and the DateTime list types do not hold (a Json[] or a Bytes[]) is kept
    // with the built-in json serializer.
    field.isList &&
    field.kind !== 'object' &&
    !isDateTimeList(field) &&
    !isScalarList(field, provider)
      ? 'serializer:json'
      : null,
    ...defaultSetting.before,
    ...trackedTimeTags(field, fieldName),
    // A scalar list is a nullable array column in the table Prisma makes.
    field.isRequired && !field.isList && (!isPk || keyNeedsNotNull(field, provider))
      ? 'not null'
      : null,
    ...defaultSetting.last,
  ].filter((p) => p !== null)

  return goTagLiteral(
    `gorm:"${parts.join(';')}" json:"${escapeTagValue(jsonTagName(columnName, fieldName))}"`,
  )
}

// The default setting, in its place among the others or, where it ends in `\`, after them all.
function defaultParts(defaultVal: string | null) {
  if (defaultVal === null) return { before: [], last: [] }
  const part = `default:${defaultVal}`
  return defaultVal.endsWith('\\') ? { before: [], last: [part] } : { before: [part], last: [] }
}

// The json name of a column: a lone `-` means "leave the field out" to encoding/json, so it is
// written `-,`, and a name encoding/json cannot take as a key (isValidTag: letters, digits and
// !#$%&()*+-./:;<=>?@[]^_{|}~ and a space; a `,` would start the options) is left for the field's
// own, which is the key encoding/json gives it anyway.
function jsonTagName(columnName: string, fieldName: string) {
  if (columnName === '-') return '-,'
  return /^[\p{L}\p{Nd}!#$%&()*+\-./:;<=>?@[\]^_{|}~ ]+$/u.test(columnName) ? columnName : fieldName
}

// A struct tag as Go source: a raw string, unless the tag holds a backtick (a MySQL identifier in
// a dbgenerated() default, or a mapped name), which would end it; such a tag is written as an
// interpreted string literal, which Go reads as the same tag.
function goTagLiteral(tag: string) {
  return tag.includes('`')
    ? `"${tag.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
    : `\`${tag}\``
}

// What keeps GORM from writing an index under a name, or undefined: in the tag, GORM reads past a
// `,` as settings and splits at a `;`, and a `\` at the end joins the setting with the next one;
// in CREATE INDEX, the name goes through the dialector's QuoteTo (quoteFlaw).
function nameFlaw(name: string, provider: string | undefined) {
  const mark = name.match(/[,;.]/u)?.[0]
  if (mark !== undefined) return `a "${mark}"`
  if (name.endsWith('\\')) return 'a \\ at its end'
  return quoteFlaw(name, provider)
}

// What keeps the dialector's QuoteTo from writing a name as one identifier, or undefined: it
// splits a name at a `.` into schema and name, takes its quote (a backtick on MySQL and SQLite, a
// `"` elsewhere) at the start as a quote of its own, and makes two of it in a row one; SQL
// Server's does not escape a `"` at all. Table, column and index names all go through it.
function quoteFlaw(name: string, provider: string | undefined) {
  if (name.includes('.')) return 'a "."'
  // SQL Server's QuoteTo writes a `"` inside a name as it is, which ends the quoted name.
  if (provider === 'sqlserver' && name.includes('"')) return 'a double quote'
  const quote = provider === 'mysql' || provider === 'sqlite' ? '`' : '"'
  if (name.startsWith(quote)) return 'a quote at its start'
  return name.includes(quote + quote) ? 'two quotes in a row' : undefined
}

// A name the schema gives an index, unless GORM cannot write it (nameFlaw); such a name is
// reported by gormProblems.
function readableTagName(name: string | null | undefined, provider: string | undefined) {
  return name !== undefined && name !== null && nameFlaw(name, provider) === undefined
    ? name
    : undefined
}

// The name a unique or plain index takes in the tag: the one the schema gives it (`map:`, or an
// index's `name:`), or Prisma's own where it gives none (`Post_authorId_idx`, `User_email_key`), so
// AutoMigrate and the migration agree. A given name GORM cannot write (readableTagName) is
// reported by gormProblems before any tag is written.
function indexTagName(
  model: DMMF.Model,
  idx: Pick<DMMF.Index, 'type' | 'dbName' | 'name' | 'fields'>,
  provider: string | undefined,
) {
  const columnOf = new Map(model.fields.map((mf) => [mf.name, mf.dbName ?? mf.name]))
  const columns = idx.fields.map((f) => columnOf.get(f.name) ?? f.name)
  const unique = idx.type === 'unique'
  return (
    readableTagName(idx.dbName, provider) ??
    (unique ? undefined : readableTagName(idx.name, provider)) ??
    constraintName(model.dbName ?? model.name, columns, unique ? 'key' : 'idx', provider ?? '')
  )
}

// A partial index's condition (the SQL Prisma Migrate writes after WHERE) as the value of GORM's
// `where:` index setting, escaped for the struct tag, or null where GORM cannot read it back: GORM
// splits the gorm tag at every `;` before it reads an index, with no escape. It splits the index's
// settings at a `,` unless a `\` comes before it (and drops that `\`), and turns a `\"` into `"`;
// both are escaped here. The condition always ends in `)`, so no `\` comes before the `;` that
// follows it in the tag.
function indexWhereSetting(sql: string) {
  if (sql.includes(';')) return null
  return escapeTagValue(sql.replaceAll('\\"', '\\\\"').replaceAll(',', '\\,'))
}

// GORM's `sort:desc` index setting for a field the index keeps descending (`sort: Desc`), which the
// migrator writes after the column in CREATE INDEX; GORM reads `sort:` per field, so each field of
// one named index carries its own. `sort: Asc` is the default and stays plain.
function sortSetting(idx: Pick<DMMF.Index, 'fields'> | undefined, field: string) {
  return idx?.fields.find((f) => f.name === field)?.sortOrder === 'desc' ? ',sort:desc' : ''
}

// GORM's `length:` index setting for a field MySQL indexes by a prefix (`note(length: 100)`), which
// the migrator writes after the column as Prisma Migrate does, `note`(100); a TEXT or BLOB column
// cannot be indexed without one. The other databases take no prefix.
function lengthSetting(
  model: DMMF.Model,
  idx: Pick<DMMF.Index, 'fields'> | undefined,
  field: string,
  provider: string | undefined,
) {
  const indexField = idx?.fields.find((f) => f.name === field)
  const prefix =
    provider === 'mysql' && indexField !== undefined ? indexPrefix(model, indexField) : undefined
  return prefix === undefined ? '' : `,length:${prefix}`
}

// GORM's `priority:` index setting for a field of a composite index: GORM orders an index's columns
// by priority (10 where none is given) and otherwise by struct field order, so each field carries
// its 1-based position in the schema's field list, `@@index([c, b])` giving `(c, b)` as Prisma
// does. A single-column index needs none.
function prioritySetting(fields: readonly string[], field: string) {
  return fields.length > 1 ? `,priority:${fields.indexOf(field) + 1}` : ''
}

// GORM's `type:` index setting for the method an index uses on PostgreSQL and CockroachDB
// (`type: Gin`), which the migrator writes as `USING gin` in CREATE INDEX. GORM keeps the first
// type it reads among an index's fields, so each field carries it. BTree is the default and stays
// plain.
function indexTypeSetting(idx: Pick<DMMF.Index, 'algorithm'>, provider: string | undefined) {
  const method =
    isPostgresFamily(provider) && idx.algorithm !== undefined
      ? INDEX_METHODS[idx.algorithm]
      : undefined
  return method === undefined ? '' : `,type:${method}`
}

// GORM's `expression:` index setting for a field the index reads with an operator class
// (`ops: JsonbPathOps`, `ops: raw("gin_trgm_ops")`) on PostgreSQL and CockroachDB: the migrator
// writes an expression in place of the quoted column in CREATE INDEX, and the sort after it, so
// `"data" jsonb_path_ops` gives the column as Prisma Migrate writes it. It is escaped as a
// condition is (indexWhereSetting), and is null where GORM cannot read it back.
function operatorClassSetting(
  field: DMMF.Field | undefined,
  indexField: DMMF.IndexField,
  provider: string | undefined,
) {
  const { operatorClass } = indexField
  if (!isPostgresFamily(provider) || operatorClass === undefined || operatorClass === '') return ''
  const column = (field?.dbName ?? indexField.name).replaceAll('"', '""')
  const expression = indexWhereSetting(
    `"${column}" ${operatorClassName(operatorClass, field?.nativeType?.[0])}`,
  )
  return expression === null ? null : `,expression:${expression}`
}

/**
 * Whether an index is left out of the tags, with a note in its place: a partial index whose
 * condition, or an index whose operator class, GORM cannot read back (indexWhereSetting,
 * operatorClassSetting). A unique index that holds every row is always written.
 */
function leavesOutIndex(
  model: DMMF.Model,
  idx: DMMF.Index,
  provider: string | undefined,
  indexWhere: IndexWhere,
) {
  const where = indexWhere(model, idx)
  if (where !== undefined && indexWhereSetting(where) === null) return true
  if (idx.type === 'unique' && where === undefined) return false
  const fieldByName = new Map(model.fields.map((mf) => [mf.name, mf]))
  return idx.fields.some((f) => operatorClassSetting(fieldByName.get(f.name), f, provider) === null)
}

/** The condition of a partial index, as `partialIndexWhere` gives it. */
type IndexWhere = (
  model: DMMF.Model,
  index: Pick<DMMF.Index, 'type' | 'dbName' | 'fields'>,
) => string | undefined

function collectCompositeIndexTags(
  model: DMMF.Model,
  indexes: readonly DMMF.Index[],
  provider: string | undefined,
  indexWhere: IndexWhere,
) {
  // An index Prisma left unnamed is named as Prisma Migrate names it
  // (`Post_authorId_idx`, `User_email_key`), so AutoMigrate and the migration
  // agree; index names are global per schema in PostgreSQL either way.
  const tableName = model.dbName ?? model.name
  const fieldByName = new Map(model.fields.map((mf) => [mf.name, mf]))

  const columnsOf = (fields: readonly string[]) =>
    fields.map((f) => fieldByName.get(f)?.dbName ?? f)
  const ownIndexes = indexes.filter((idx) => idx.model === model.name)
  // A partial unique index (one with a `where`) holds only some rows unique: DMMF leaves it out of
  // isUnique and uniqueFields, so it keys nothing, and it is written below with its condition.
  const uniques = ownIndexes.filter((idx) => idx.type === 'unique')
  const partialUniques = uniques.filter((idx) => indexWhere(model, idx) !== undefined)
  const plainUniques = uniques.filter((idx) => indexWhere(model, idx) === undefined)
  // A @unique(map: "...") or @@unique(map: "...") keeps the name the schema gives it; one GORM
  // cannot write (readableTagName) is reported by gormProblems.
  const mappedUniques = new Map(
    plainUniques.map((idx) => [
      idx.fields.map((f) => f.name).join(','),
      readableTagName(idx.dbName, provider),
    ]),
  )
  // DMMF leaves isUnique off a field whose @unique has a partial unique index beside it on the same
  // field, so a field is also unique by an index that holds every row.
  const uniqueByIndex = new Set(
    plainUniques.filter((idx) => idx.fields.length === 1).map((idx) => idx.fields[0]?.name),
  )
  const plainUniqueOf = new Map(
    plainUniques.map((idx) => [idx.fields.map((f) => f.name).join(','), idx]),
  )
  const singleUniqueTags = model.fields
    .filter((f) => f.isUnique || uniqueByIndex.has(f.name))
    .map((f): [string, string] => {
      const named = mappedUniques.get(f.name)
      return [
        f.name,
        `uniqueIndex:${escapeTagValue(named ?? constraintName(tableName, [f.dbName ?? f.name], 'key', provider ?? ''))}${lengthSetting(model, plainUniqueOf.get(f.name), f.name, provider)}${sortSetting(plainUniqueOf.get(f.name), f.name)}`,
      ]
    })

  const uniqueTags = model.uniqueFields
    .filter((fields) => fields.length > 1)
    .flatMap((fields) => {
      const idxName =
        mappedUniques.get(fields.join(',')) ??
        constraintName(tableName, columnsOf(fields), 'key', provider ?? '')
      const idx = plainUniqueOf.get(fields.join(','))
      return fields.map((f): [string, string] => [
        f,
        `uniqueIndex:${escapeTagValue(idxName)}${prioritySetting(fields, f)}${lengthSetting(model, idx, f, provider)}${sortSetting(idx, f)}`,
      ])
    })

  // A partial index's tag carries its condition in `where:`; one GORM cannot read back
  // (indexWhereSetting) is left out, so AutoMigrate makes no index that holds every row, and a
  // comment on its first field says so. Its method goes in `type:` (indexTypeSetting) and an
  // operator class in `expression:` (operatorClassSetting); an index whose operator class GORM
  // cannot read back is left out the same way, with a comment naming the operator class, so
  // AutoMigrate makes no index without it.
  const notes: [string, string][] = []
  const tagsOf = (idx: DMMF.Index, setting: 'index' | 'uniqueIndex', name: string) => {
    const where = indexWhere(model, idx)
    const condition = where === undefined ? '' : indexWhereSetting(where)
    if (condition === null) {
      notes.push([
        idx.fields[0]?.name ?? '',
        `The partial ${setting === 'uniqueIndex' ? 'unique ' : ''}index ${JSON.stringify(idx.dbName ?? name)} is left out: its condition holds a ";", at which GORM splits the tag.`,
      ])
      return []
    }
    const expressions = idx.fields.map((f) =>
      operatorClassSetting(fieldByName.get(f.name), f, provider),
    )
    const unreadable = idx.fields.find((_, i) => expressions[i] === null)
    if (unreadable !== undefined) {
      notes.push([
        idx.fields[0]?.name ?? '',
        // The column and the operator class are quoted, so a line break in either stays in the comment.
        `The index ${JSON.stringify(idx.dbName ?? name)} is left out: the expression of its column ${JSON.stringify(unreadable.name)} with the operator class ${JSON.stringify(unreadable.operatorClass)} holds a ";", at which GORM splits the tag.`,
      ])
      return []
    }
    const whereSetting = condition === '' ? '' : `,where:${condition}`
    const typeSetting = indexTypeSetting(idx, provider)
    const fieldNames = idx.fields.map((f) => f.name)
    return fieldNames.map((f, i): [string, string] => [
      f,
      `${setting}:${escapeTagValue(name)}${typeSetting}${expressions[i] ?? ''}${prioritySetting(fieldNames, f)}${lengthSetting(model, idx, f, provider)}${sortSetting(idx, f)}${whereSetting}`,
    ])
  }

  const partialUniqueTags = partialUniques.flatMap((idx) =>
    tagsOf(idx, 'uniqueIndex', indexTagName(model, idx, provider)),
  )

  const indexTags = ownIndexes
    .filter((idx) => idx.type === 'normal' || idx.type === 'fulltext')
    .flatMap((idx) => tagsOf(idx, 'index', indexTagName(model, idx, provider)))

  return {
    tags: groupByField([...singleUniqueTags, ...uniqueTags, ...partialUniqueTags, ...indexTags]),
    notes: groupByField(notes),
  }
}

function groupByField(entries: readonly (readonly [string, string])[]) {
  return entries.reduce<Map<string, string[]>>((map, [fieldName, value]) => {
    map.set(fieldName, [...(map.get(fieldName) ?? []), value])
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

/**
 * The Go name of each field of a model. Two fields can become one name (`createdAt` beside the
 * `created_at` an OAuth provider returns, both `CreatedAt`): the first declared keeps it and the
 * other is numbered (`CreatedAt1`), its `column:` tag still naming its own column. Scalars are
 * named before relations, so a relation never moves a column's field.
 */
function goFieldNames(model: DMMF.Model) {
  return allocate(
    [
      ...model.fields.filter((f) => f.kind !== 'object'),
      ...model.fields.filter((f) => f.kind === 'object'),
    ].map((f) => ({ key: f.name, candidate: goFieldName(f.name) })),
    [],
    (name) => name,
  )
}

// The Go name of a field of the named model.
function goFieldNameIn(models: readonly DMMF.Model[], modelName: string, fieldName: string) {
  const model = models.find((m) => m.name === modelName)
  return (model ? goFieldNames(model).get(fieldName) : undefined) ?? goFieldName(fieldName)
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
  if (
    field.isUpdatedAt === true ||
    (isFunctionDefault(field.default) && field.default.name === 'now')
  ) {
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
function generateBeforeCreateHook(model: DMMF.Model, names: ReadonlyMap<string, string>) {
  const assignments = model.fields.flatMap((field) => {
    const fieldName = names.get(field.name) ?? goFieldName(field.name)
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
function generateBeforeUpdateHook(model: DMMF.Model, names: ReadonlyMap<string, string>) {
  const stamped = model.fields.filter(
    (field) => isDateTimeScalar(field) && field.isUpdatedAt === true,
  )
  if (stamped.length === 0) return []
  return [
    '',
    `func (*${goModelName(model.name)}) BeforeUpdate(tx *gorm.DB) error {`,
    '\tnow := tx.NowFunc().UTC().Truncate(time.Millisecond)',
    ...stamped.flatMap((field) => {
      const fieldName = names.get(field.name) ?? goFieldName(field.name)
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

// GORM skips a zero value in a column with a default and lets the default
// in: `false` under `@default(true)` would be stored as true. A pointer
// tells the two apart, as GORM's documentation advises: nil takes the
// default, a pointer to the zero value is stored as it is.
function hasNonZeroDefault(field: DMMF.Field, isPk: boolean) {
  const def = field.default
  return (
    field.kind === 'scalar' &&
    !isPk &&
    ['Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'String'].includes(field.type) &&
    (def === true ||
      (typeof def === 'number' && def !== 0) ||
      (typeof def === 'string' && (field.type === 'String' ? def !== '' : Number(def) !== 0)))
  )
}

function structFieldGoType(field: DMMF.Field, isPk: boolean, provider: string | undefined) {
  if (isDateTimeList(field)) return dateTimeGoType(field)
  // A scalar list (e.g. `tags String[]`) is a collection, not a scalar; collapse
  // it to a single value loses data. Emit a slice of the element type, a ScalarList where the
  // column is a PostgreSQL array.
  if (field.isList) {
    const element = field.kind === 'enum' ? 'string' : prismaTypeToGoType(field.type, true)
    return isScalarList(field, provider) ? `ScalarList[${element}]` : `[]${element}`
  }
  if (isDateTimeScalar(field)) return `${field.isRequired ? '' : '*'}${dateTimeGoType(field)}`
  if (field.kind === 'enum') return field.isRequired ? 'string' : '*string'
  if (isPlainJson(field, provider)) return 'PlainJSON'
  if (isMoney(field, provider)) {
    return field.isRequired && !hasNonZeroDefault(field, isPk) ? 'Money' : '*Money'
  }
  return prismaTypeToGoType(field.type, field.isRequired && !hasNonZeroDefault(field, isPk))
}

function generateStructField(
  field: DMMF.Field,
  fieldName: string,
  isPk: boolean,
  isCompositePk: boolean,
  compositeIndexTags: readonly string[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  provider: string | undefined,
  gormPicksKey: boolean,
) {
  return [
    fieldName,
    structFieldGoType(field, isPk, provider),
    buildGormTags(
      field,
      isPk,
      isCompositePk,
      compositeIndexTags,
      enums,
      provider,
      fieldName,
      gormPicksKey,
    ),
  ]
}

// The key field GORM makes auto-increment when its tag does not say (schema.Parse, gorm v1.31.2):
// the one it finds by the name id, then ID (a column name first, then a Go field name), when that
// is a key field, and otherwise the sole key field. Of a composite key with no such field GORM
// makes none auto-increment. (A struct with no key at all, a view's, GORM keys by its ID field;
// no key tag is written there, so none is picked here.)
function gormPickedKey(
  scalarFields: readonly DMMF.Field[],
  keyNames: ReadonlySet<string>,
  names: ReadonlyMap<string, string>,
) {
  const lookUp = (name: string) =>
    scalarFields.find((f) => (f.dbName ?? f.name) === name) ??
    scalarFields.find((f) => (names.get(f.name) ?? goFieldName(f.name)) === name)
  const byName = lookUp('id') ?? lookUp('ID')
  if (byName !== undefined && keyNames.has(byName.name)) return byName.name
  return keyNames.size === 1 ? [...keyNames][0] : undefined
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

// GORM takes the text before the first comma of `constraint:` as the constraint's name when it is
// letters, digits, `_` and `-`; any other name is left to GORM (`fk_<table>_<field>`).
function constraintTag(name: string, onDelete: string, onUpdate: string) {
  const actions = [
    SQL_ACTION[onUpdate] === undefined ? null : `OnUpdate:${SQL_ACTION[onUpdate]}`,
    SQL_ACTION[onDelete] === undefined ? null : `OnDelete:${SQL_ACTION[onDelete]}`,
  ].filter((c) => c !== null)
  if (actions.length === 0) return null
  return `constraint:${[...(/^[\w-]+$/u.test(name) ? [name] : []), ...actions].join(',')}`
}

/**
 * The name Prisma Migrate gives the foreign key `holder` holds in the named fields:
 * `<table>_<columns>_fkey`.
 */
function foreignKeyName(
  allModels: readonly DMMF.Model[],
  holder: string,
  fieldNames: readonly string[],
  provider: string | undefined,
) {
  const model = allModels.find((m) => m.name === holder)
  const columnOf = new Map(model?.fields.map((f) => [f.name, f.dbName ?? f.name]))
  const columns = fieldNames.map((name) => columnOf.get(name) ?? name)
  return constraintName(model?.dbName ?? holder, columns, 'fkey', provider ?? '')
}

function buildRelationTag(parts: string[]) {
  return goTagLiteral(`gorm:"${parts.join(';')}"`)
}

/**
 * The prose of a `///` comment as Go `//` lines, a blank line as a bare `//`.
 *
 * @param text - the prose, as `stripAnnotations` returns it
 * @returns the comment lines, none when there is no prose
 */
function goCommentLines(text: string | undefined) {
  return text === undefined
    ? []
    : text.split('\n').map((line) => `//${line.trimEnd() === '' ? '' : ` ${line.trimEnd()}`}`)
}

function generateRelationFields(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  associations: ReturnType<typeof getAssociations>,
  provider: string | undefined,
  foreignKeyNames: ReadonlyMap<string, string>,
  views: ReadonlySet<string>,
) {
  // The database holds no foreign key to or from a view. GORM has no way for a model to opt out
  // of AutoMigrate, only a field (`-:migration`): on the relation, it keeps AutoMigrate of a table
  // from creating the view it points at as a table first (GORM 1.31, `Migrator.ReorderModels`
  // adds the model a foreign key references) and from adding the constraint.
  const viewEnd = (targetModel: string) => views.has(model.name) || views.has(targetModel)
  const noMigration = (targetModel: string) => (viewEnd(targetModel) ? ['-:migration'] : [])
  // A relation and the keys it names are written as the struct that holds each field names it.
  const of = (modelName: string) => (name: string) => goFieldNameIn(allModels, modelName, name)
  const own = of(model.name)
  const withDoc = (name: string, row: readonly string[]) => [
    ...goCommentLines(
      stripAnnotations(model.fields.find((f) => f.name === name)?.documentation),
    ).map((line) => [line]),
    row,
  ]
  const belongsToCount = associations.belongsTo.reduce(
    (counts, a) => counts.set(a.targetModel, (counts.get(a.targetModel) ?? 0) + 1),
    new Map<string, number>(),
  )
  const belongsToLines = associations.belongsTo.flatMap((assoc) => {
    const fieldName = own(assoc.name)
    const fkFieldName = assoc.foreignKeys.map(own).join(',')
    const refsFieldName = assoc.referencesList.map(of(assoc.targetModel)).join(',')
    const isComposite = assoc.foreignKeys.length > 1
    const isAmbiguous =
      fieldName !== goModelName(assoc.targetModel) ||
      (belongsToCount.get(assoc.targetModel) ?? 0) > 1
    // GORM guesses a belongs-to key as the field's name and the referenced
    // field's (`User` + `ID`); a key named otherwise (`ownerId`) is named.
    const isGuessed = fkFieldName === `${fieldName}${refsFieldName}`
    const tagParts = [
      isAmbiguous || isComposite || !isGuessed ? `foreignKey:${fkFieldName}` : null,
      isComposite || needsReferencesTag(assoc.references) ? `references:${refsFieldName}` : null,
      // GORM guesses a struct field's relation as has-one first, and takes it when the referenced
      // model has a field the key resolves to: a column named alike (`BackgroundJob.JobID`), a
      // relation field (`User.CreatedBy`), or a key whose column is the snake-cased key name
      // (`User.ID` in `user_id`). `belongsTo` skips the guess (GORM 1.31, `schema.parseRelation`).
      'belongsTo',
      ...noMigration(assoc.targetModel),
    ].filter((p) => p !== null)
    // A belongs-to is a pointer, as GORM writes a self-reference (`Manager *User`): by value,
    // two models that point at each other (or one at itself) embed each other, an illegal
    // recursive type in Go, and a relation that is not loaded or not set would read as a row of
    // zero values.
    const targetType = `*${goModelName(assoc.targetModel)}`
    return withDoc(assoc.name, [fieldName, targetType, buildRelationTag(tagParts)])
  })

  const hasManyLines = associations.hasMany.flatMap((assoc) => {
    const tagParts = [
      `foreignKey:${assoc.foreignKeys.map(of(assoc.targetModel)).join(',')}`,
      ...(assoc.foreignKeys.length > 1 || needsReferencesTag(assoc.references)
        ? [`references:${assoc.referencesList.map(own).join(',')}`]
        : []),
      ...(viewEnd(assoc.targetModel)
        ? noMigration(assoc.targetModel)
        : [
            constraintTag(
              foreignKeyNames.get(`${assoc.targetModel}.${assoc.fkFieldName}`) ??
                foreignKeyName(allModels, assoc.targetModel, assoc.foreignKeys, provider),
              assoc.onDelete,
              assoc.onUpdate,
            ),
          ].filter((c) => c !== null)),
    ]
    return withDoc(assoc.name, [
      own(assoc.name),
      `[]${goModelName(assoc.targetModel)}`,
      buildRelationTag(tagParts),
    ])
  })

  const hasOneLines = associations.hasOne.flatMap((assoc) => {
    const tagParts = [
      `foreignKey:${assoc.foreignKeys.map(of(assoc.targetModel)).join(',')}`,
      ...(assoc.foreignKeys.length > 1 || needsReferencesTag(assoc.references)
        ? [`references:${assoc.referencesList.map(own).join(',')}`]
        : []),
      ...(viewEnd(assoc.targetModel)
        ? noMigration(assoc.targetModel)
        : [
            constraintTag(
              foreignKeyNames.get(`${assoc.targetModel}.${assoc.fkFieldName}`) ??
                foreignKeyName(allModels, assoc.targetModel, assoc.foreignKeys, provider),
              assoc.onDelete,
              assoc.onUpdate,
            ),
          ].filter((c) => c !== null)),
    ]
    // A has-one is a pointer for the same reason, and Prisma requires the 1:1 back side to be
    // optional anyway. A has-one onto its own model is a slice instead: GORM guesses a struct
    // field that points at its own schema as belongs-to first, finds the key on that same
    // schema and stops there, so `*User` would load the row this one points at (no tag forces
    // has-one). A slice is guessed as has-many on the key, and the key's unique index keeps it
    // to at most one row.
    const isSelf = assoc.targetModel === model.name
    const row = [
      own(assoc.name),
      `${isSelf ? '[]' : '*'}${goModelName(assoc.targetModel)}`,
      buildRelationTag(tagParts),
    ]
    const lines = withDoc(assoc.name, row)
    if (!isSelf) return lines
    const self = goModelName(model.name)
    const note = `// A 1:1 onto ${self} itself: GORM would read *${self} as belongs-to on the same key, so this is a slice of at most one.`
    return [...lines.slice(0, -1), [note], row]
  })

  // Prisma's join table has two columns, A for the model whose name sorts
  // first and B for the other, where GORM would look for `post_id`/`tag_id`.
  // In a self-relation the field whose name sorts first holds its own key in A.
  const manyToManyLines = associations.manyToMany.flatMap((assoc) => {
    const joinTable = `_${assoc.relationName}`
    const [ownColumn, related] = assoc.isSideA ? ['A', 'B'] : ['B', 'A']
    return withDoc(assoc.name, [
      own(assoc.name),
      `[]${goModelName(assoc.targetModel)}`,
      goTagLiteral(
        `gorm:"many2many:${escapeTagValue(joinTable)};joinForeignKey:${ownColumn};joinReferences:${related}"`,
      ),
    ])
  })

  return [...belongsToLines, ...hasManyLines, ...hasOneLines, ...manyToManyLines]
}

/**
 * Lays struct fields out as gofmt does: each column is as wide as its widest
 * cell plus one space, over a run of lines that all have a cell after it. A
 * field without a tag ends the run of the type column, not of the names, and a
 * comment line (a row of one cell) ends every run.
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
  const columns = Math.max(0, ...rows.map((row) => row.length - 1))
  // A column is aligned in runs: a row that ends at or before the column closes the run, and the
  // rows of a run are padded to its widest cell. Each run is measured once, walking the rows.
  const widths = Array.from({ length: columns }, (_, column) => {
    const runOf = new Map<number, number>()
    const widest = new Map<number, number>()
    for (let i = 0, run = 0; i < rows.length; i += 1) {
      const row = rows[i] ?? []
      if (row.length - 1 <= column) {
        run += 1
      } else {
        runOf.set(i, run)
        widest.set(run, Math.max(widest.get(run) ?? 0, row[column]?.length ?? 0))
      }
    }
    return (i: number) => (widest.get(runOf.get(i) ?? -1) ?? 0) + 1
  })
  return rows.map(
    (row, i) =>
      `\t${row.map((cell, column) => (column < row.length - 1 ? cell.padEnd(widths[column]?.(i) ?? 0) : cell)).join('')}`,
  )
}

/**
 * What a struct of a Prisma `view` says of itself. Prisma Migrate never creates a view (its SQL
 * is written by hand), and `AutoMigrate` has no notion of one: given the struct, it finds no
 * table of that name and creates one. Nothing in GORM lets a model refuse, so the struct says it.
 */
function viewCommentLines(structName: string) {
  return [
    `// ${structName} is a database view: read it, do not write to it, and do not pass it to`,
    '// AutoMigrate, which would create a table of that name.',
  ]
}

/**
 * The scalar fields in the order the struct declares them. GORM gives a primary key no priority
 * and orders a composite one's columns by struct field order, so the key's fields are declared in
 * the key's order (`@@id([b, a])` gives `PRIMARY KEY (b, a)`, as Prisma does), together where the
 * first of them is; every other field keeps its place.
 */
function keyOrdered(fields: readonly DMMF.Field[], keyFields: readonly string[]) {
  const keys = new Set(keyFields)
  const byName = new Map(fields.map((f) => [f.name, f]))
  const first = fields.findIndex((f) => keys.has(f.name))
  if (first === -1) return fields
  const keyed = keyFields.flatMap((name) => byName.get(name) ?? [])
  // A key already in field order leaves every field where it is, apart or not.
  const inFieldOrder = fields.filter((f) => keys.has(f.name))
  if (keyed.every((f, i) => f === inFieldOrder[i])) return fields
  return fields.flatMap((f, i) => {
    if (i === first) return keyed
    return keys.has(f.name) ? [] : [f]
  })
}

export function generateModelStruct(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  indexes: readonly DMMF.Index[],
  provider?: string,
  foreignKeyNames: ReadonlyMap<string, string> = new Map(),
  views: ReadonlySet<string> = new Set(),
  indexWhere: IndexWhere = () => undefined,
) {
  // A model with no @id or @@id is keyed by its first unique fields, as a composite key is: GORM
  // needs a primary key to load an association, and the other models name this one.
  const idField = model.fields.find((f) => f.isId)
  const compositePkFieldNames = new Set(idField ? [] : primaryKeyFields(model))
  const isCompositePk = !idField && compositePkFieldNames.size > 0

  const associations = getAssociations(model, allModels, provider)

  const indexTags = collectCompositeIndexTags(model, indexes, provider, indexWhere)

  const tableName = model.dbName ?? model.name
  const scalarFields = keyOrdered(
    model.fields.filter((f) => f.kind !== 'object'),
    isCompositePk ? primaryKeyFields(model) : [],
  )

  const names = goFieldNames(model)
  const pickedKey = gormPickedKey(
    scalarFields,
    new Set(idField ? [idField.name] : compositePkFieldNames),
    names,
  )
  const fieldLines = scalarFields.flatMap((field) => {
    const isPk = field.isId || compositePkFieldNames.has(field.name)
    const fieldIndexTags = indexTags.tags.get(field.name) ?? []
    const rows = [
      ...goCommentLines(stripAnnotations(field.documentation)),
      ...(indexTags.notes.get(field.name) ?? []).map((note) => `// ${note}`),
    ].map((line) => [line])
    rows.push(
      generateStructField(
        field,
        names.get(field.name) ?? goFieldName(field.name),
        isPk,
        isCompositePk,
        fieldIndexTags,
        enums,
        provider,
        field.name === pickedKey,
      ),
    )
    return rows
  })

  const relationLines = generateRelationFields(
    model,
    allModels,
    associations,
    provider,
    foreignKeyNames,
    views,
  )

  // GORM would pluralise the snake_cased struct name (Warehouse -> warehouses);
  // the table is Prisma's, so every model says which. A JSON string is a Go string literal, so a
  // `"` or `\` in the name is escaped.
  const tableNameMethod = [
    '',
    `func (${goModelName(model.name)}) TableName() string {`,
    `\treturn ${JSON.stringify(tableName)}`,
    '}',
  ]

  const doc = goCommentLines(stripAnnotations(model.documentation))
  return [
    ...doc,
    ...(views.has(model.name)
      ? [...(doc.length > 0 ? ['//'] : []), ...viewCommentLines(goModelName(model.name))]
      : []),
    `type ${goModelName(model.name)} struct {`,
    ...alignFields([...fieldLines, ...relationLines]),
    '}',
    ...tableNameMethod,
    ...generateBeforeCreateHook(model, names),
    ...generateBeforeUpdateHook(model, names),
  ].join('\n')
}

function hasImplicitManyToMany(models: readonly DMMF.Model[]) {
  return implicitJoinTables(models).length > 0
}

/**
 * GORM's default naming strategy snake_cases and pluralises a join table's
 * name (`_PostToTag` becomes `_post_to_tags`) and lowercases its columns (`A`
 * becomes `a`). Prisma's implicit many-to-many tables keep their names only
 * under a strategy that leaves names as they are; every other name in the
 * file is given in a tag or by `TableName()`, so nothing else changes with it.
 */
export function generateNamingStrategy(models: readonly DMMF.Model[]) {
  if (!hasImplicitManyToMany(models)) return []
  return ['', 'var NamingStrategy = schema.NamingStrategy{SingularTable: true, NoLowerCase: true}']
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
// The text a DateTime is sent to the database as: Prisma Client's on SQLite, the UTC wall clock on
// MySQL, and the time.Time itself elsewhere.
function dateTimeValueFormat(provider: string | undefined) {
  if (provider === 'sqlite') return '.Format("2006-01-02T15:04:05.000-07:00")'
  if (provider === 'mysql') return '.Format("2006-01-02 15:04:05.000")'
  return ''
}

export function generateDateTypes(models: readonly DMMF.Model[], provider?: string) {
  const types = dateTypes(models)
  if (types.length === 0) return []
  const typeSet = new Set(types)
  const value = [
    'func (dateTime DateTime) Value() (driver.Value, error) {',
    `\treturn dateTime.UTC().Truncate(time.Millisecond)${dateTimeValueFormat(provider)}, nil`,
    '}',
  ]
  const fromDriver =
    provider === 'mysql'
      ? [
          '\t\treturn time.Date(value.Year(), value.Month(), value.Day(), value.Hour(), value.Minute(), value.Second(), value.Nanosecond(), time.UTC).Truncate(time.Millisecond), nil',
        ]
      : ['\t\treturn value.UTC().Truncate(time.Millisecond), nil']
  const dateTime = [
    '',
    'type DateTime struct{ time.Time }',
    '',
    'func (DateTime) GormDataType() string {',
    '\treturn "time"',
    '}',
    '',
    ...value,
    '',
    'func (dateTime *DateTime) Scan(src any) error {',
    '\tread, err := readPrismaTime(src)',
    '\tdateTime.Time = read',
    '\treturn err',
    '}',
  ]
  const date = [
    '',
    'type Date struct{ time.Time }',
    '',
    'func (Date) GormDataType() string {',
    '\treturn "time"',
    '}',
    '',
    'func (date Date) Value() (driver.Value, error) {',
    '\treturn date.UTC().Format("2006-01-02"), nil',
    '}',
    '',
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
    'type TimeOfDay struct{ time.Time }',
    '',
    'func (TimeOfDay) GormDataType() string {',
    '\treturn "time"',
    '}',
    '',
    'func (clock TimeOfDay) Value() (driver.Value, error) {',
    '\treturn clock.UTC().Truncate(time.Millisecond).Format("15:04:05.000"), nil',
    '}',
    '',
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
    { name: 'DateTimeList', element: 'DateTime' },
    { name: 'DateList', element: 'Date' },
    { name: 'TimeOfDayList', element: 'TimeOfDay' },
  ]
    .filter((list) => typeSet.has(list.name))
    .flatMap(({ name, element }) => [
      '',
      `type ${name} []${element}`,
      '',
      `func (list ${name}) Value() (driver.Value, error) {`,
      '\treturn arrayText(list)',
      '}',
      '',
      `func (list *${name}) Scan(src any) error {`,
      `\treturn scanArray(src, (*[]${element})(list))`,
      '}',
    ])
  const arrays = types.some((name) => name.endsWith('List'))
    ? [
        '',
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
    'var prismaTimeLayouts = []string{',
    '\t"2006-01-02T15:04:05.999999999Z07:00",',
    '\t"2006-01-02 15:04:05.999999999Z07:00",',
    '\t"2006-01-02 15:04:05.999999999Z07",',
    '\t"2006-01-02T15:04:05.999999999",',
    '\t"2006-01-02 15:04:05.999999999",',
    '\t"2006-01-02",',
    '}',
    '',
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
 * What keeps the schema from becoming models that compile and read as it says: a model whose Go
 * name is that of a type or function written beside the models, where the schema needs it; a
 * table or column whose name GORM cannot write (a `;` or a `\` at its end in a column's tag, or a
 * quoteFlaw in either); an index whose name
 * GORM cannot write (nameFlaw), whether the schema gives it or Prisma's naming makes it; and two
 * fields under one json name (jsonTagName), a relation's Go name among them, of which encoding/json
 * keeps at most one; and a MySQL key on a column prefix that the table cannot take on its whole
 * columns (keyPrefixProblems).
 */
export function gormProblems(
  models: readonly DMMF.Model[],
  provider?: string,
  indexes: readonly DMMF.Index[] = [],
  indexWhere: IndexWhere = () => undefined,
  views: ReadonlySet<string> = new Set(),
) {
  const held = new Map<string, string>([
    ...dateTypes(models).map((name): [string, string] => [
      name,
      'the type the models hold a DateTime in',
    ]),
    ...(usesScalarList(models, provider) ? ['ScalarList'] : []).map((name): [string, string] => [
      name,
      'what the models hold a scalar list in',
    ]),
    ...(usesMoney(models, provider) ? ['Money'] : []).map((name): [string, string] => [
      name,
      'what the models hold a @db.Money in',
    ]),
    ...(usesPlainJson(models, provider) ? ['PlainJSON'] : []).map((name): [string, string] => [
      name,
      'what the models hold a @db.Json in',
    ]),
  ])
  const indexesOf = indexes.reduce<Map<string, DMMF.Index[]>>((map, idx) => {
    map.set(idx.model, [...(map.get(idx.model) ?? []), idx])
    return map
  }, new Map())
  return models.flatMap((model) => {
    const name = goModelName(model.name)
    const holds = held.get(name)
    // GORM reads a field's indexes by splitting its whole tag at every `;`, with no escape, and
    // rejoins a tag setting that ends in `\` with the next one, so neither a column name holding a
    // `;` nor one ending in `\` can be written into the tag; nor can one QuoteTo would write as
    // another identifier (quoteFlaw).
    const columns = model.fields.flatMap((field) => {
      const column = field.dbName ?? field.name
      if (field.kind === 'object') return []
      if (column.includes(';')) {
        return [
          `model ${model.name}: the column of ${field.name} holds a ";", at which GORM splits the tag; change its @map`,
        ]
      }
      if (column.endsWith('\\')) {
        return [
          `model ${model.name}: the column of ${field.name} ends in \\, which GORM's tag cannot hold; change its @map`,
        ]
      }
      const flaw = quoteFlaw(column, provider)
      return flaw === undefined
        ? []
        : [
            `model ${model.name}: the column of ${field.name} is named ${JSON.stringify(column)}, which GORM cannot write (${flaw}); change its @map`,
          ]
    })
    // PostgreSQL prints each money of an array in its locale's form, which neither ScalarList nor
    // the json serializer reads.
    const moneyLists = model.fields.flatMap((field) =>
      provider === 'postgresql' && field.isList && field.nativeType?.[0] === 'Money'
        ? [
            `model ${model.name}: ${field.name} is a list of money, which GORM cannot read from the money[] PostgreSQL prints; make it a list of @db.Decimal`,
          ]
        : [],
    )
    // The table's name goes through the same QuoteTo in every statement GORM writes.
    const tableFlaw = quoteFlaw(model.dbName ?? model.name, provider)
    // So does the join table of an implicit many-to-many relation, `_` and the relation's name,
    // written into the tag (escapeTagValue) of either field; a `\` at its end would still join
    // the setting with the next one. Reported once, on side A.
    const joinTables = getAssociations(model, models, provider).manyToMany.flatMap((assoc) => {
      if (!assoc.isSideA) return []
      const joinTable = `_${assoc.relationName}`
      const flaw = joinTable.endsWith('\\') ? 'a \\ at its end' : quoteFlaw(joinTable, provider)
      return flaw === undefined
        ? []
        : [
            `model ${model.name}: the join table of ${assoc.name} is named ${JSON.stringify(joinTable)}, which GORM cannot write (${flaw}); change the name of its @relation`,
          ]
    })
    // An index whose name GORM cannot write (nameFlaw), whether the schema gives it or Prisma's
    // naming makes it from a column or a @@map, is reported. One left out of the tags with a note
    // never reaches them.
    const indexNames = (indexesOf.get(model.name) ?? [])
      .filter((idx) => idx.type !== 'id' && !leavesOutIndex(model, idx, provider, indexWhere))
      .flatMap((idx) => {
        const fields = idx.fields.map((f) => f.name).join(', ')
        // A name the schema gives is the index's name in the database, so one GORM cannot write
        // would leave AutoMigrate making the index under another name.
        const given = idx.dbName ?? (idx.type === 'unique' ? undefined : idx.name)
        const givenFlaw =
          given === undefined || given === null ? undefined : nameFlaw(given, provider)
        if (givenFlaw !== undefined) {
          return [
            `model ${model.name}: the index on ${fields} is named ${JSON.stringify(given)}, which GORM cannot write (${givenFlaw}); change it`,
          ]
        }
        const indexName = indexTagName(model, idx, provider)
        const flaw = nameFlaw(indexName, provider)
        return flaw === undefined
          ? []
          : [
              `model ${model.name}: the index on ${fields} is named ${JSON.stringify(indexName)}, which GORM cannot write (${flaw}); change the @map of its column or table, or give it a name with map:`,
            ]
      })
    // A json name is the column's, or the field's Go name where encoding/json cannot take the
    // column's (jsonTagName); a relation has no json tag, so its key is its Go name. Two fields can
    // come to one key, and encoding/json then drops them without a word.
    const goNames = goFieldNames(model)
    const jsonNames = model.fields.map((field) => {
      const goName = goNames.get(field.name) ?? goFieldName(field.name)
      return {
        field: field.name,
        json: field.kind === 'object' ? goName : jsonTagName(field.dbName ?? field.name, goName),
      }
    })
    const jsonClashes = jsonNames.flatMap(({ field, json }, i) => {
      const earlier = jsonNames.slice(0, i).find((other) => other.json === json)
      return earlier === undefined
        ? []
        : [
            `model ${model.name}: ${earlier.field} and ${field} are both written json:${JSON.stringify(json)}, and encoding/json drops one or both; change the @map of one`,
          ]
    })
    return [
      ...(holds === undefined
        ? []
        : [
            `model ${model.name}: its Go name is ${name}, ${holds}; rename the model and keep its table with @@map`,
          ]),
      ...(tableFlaw === undefined
        ? []
        : [
            `model ${model.name}: its table is named ${JSON.stringify(model.dbName ?? model.name)}, which GORM cannot write (${tableFlaw}); change its @@map`,
          ]),
      ...columns,
      ...moneyLists,
      ...joinTables,
      ...indexNames,
      ...jsonClashes,
      // GORM never migrates a view, so no table is keyed from it.
      ...(views.has(model.name)
        ? []
        : keyPrefixProblems(model, provider, indexesOf.get(model.name) ?? [])),
    ]
  })
}

// What a Prisma type with no native type is on MySQL, in bytes: String is varchar(191), Float
// DOUBLE, DateTime DATETIME(3), Decimal DECIMAL(65,30).
const MYSQL_TYPE_BYTES: { readonly [type: string]: number } = {
  String: 191 * 4,
  Int: 4,
  BigInt: 8,
  Boolean: 1,
  Float: 8,
  Decimal: 30,
  DateTime: 7,
}

// The fractional seconds of a time type take a byte for each two digits.
function fractionBytes(args: readonly string[]) {
  return Math.ceil(Number(args[0] ?? 0) / 2)
}

const MYSQL_NATIVE_BYTES: { readonly [native: string]: (args: readonly string[]) => number } = {
  VarChar: (args) => Number(args[0] ?? 1) * 4,
  Char: (args) => Number(args[0] ?? 1) * 4,
  VarBinary: (args) => Number(args[0] ?? 1),
  Binary: (args) => Number(args[0] ?? 1),
  // A bare `@db.Decimal` is MySQL's DECIMAL, which is DECIMAL(10,0).
  Decimal: (args) => decimalBytes(Number(args[0] ?? 10), Number(args[1] ?? 0)),
  TinyInt: () => 1,
  UnsignedTinyInt: () => 1,
  SmallInt: () => 2,
  UnsignedSmallInt: () => 2,
  MediumInt: () => 3,
  UnsignedMediumInt: () => 3,
  Int: () => 4,
  UnsignedInt: () => 4,
  BigInt: () => 8,
  UnsignedBigInt: () => 8,
  Year: () => 1,
  Bit: (args) => Math.ceil(Number(args[0] ?? 1) / 8),
  Float: () => 4,
  Double: () => 8,
  Date: () => 3,
  Time: (args) => 3 + fractionBytes(args),
  DateTime: (args) => 5 + fractionBytes(args),
  Timestamp: (args) => 4 + fractionBytes(args),
}

// A MySQL key on a prefix of a column (`@id(length: N)`, `@@id([a(length: N)])`, or the length of
// the unique that keys a model without an @id), which GORM's primaryKey cannot write: it has no
// setting for a prefix, so AutoMigrate keys the whole column. That is a looser key than Prisma's
// but one MySQL takes, unless a column is TEXT or BLOB, which MySQL keys only on a prefix (error
// 1170), or the whole columns take more than the 3072 bytes InnoDB keys (error 1071).
function keyPrefixProblems(
  model: DMMF.Model,
  provider: string | undefined,
  modelIndexes: readonly DMMF.Index[],
) {
  if (provider !== 'mysql') return []
  const keyFields = primaryKeyFields(model)
  const keyIndex = modelIndexes.find(
    (idx) =>
      (idx.type === 'id' || idx.type === 'unique') &&
      isSameList(
        idx.fields.map((field) => field.name),
        keyFields,
      ),
  )
  const fields = keyIndex?.fields ?? []
  const prefixed = fields.flatMap((field) => {
    const prefix = indexPrefix(model, field)
    return prefix === undefined ? [] : [{ name: field.name, prefix }]
  })
  if (prefixed.length === 0) return []
  const byName = new Map(model.fields.map((field) => [field.name, field]))
  const unsized = prefixed.filter((field) => mysqlKeyBytes(byName.get(field.name)) === Infinity)
  const bytes = fields.reduce((sum, field) => sum + mysqlKeyBytes(byName.get(field.name)), 0)
  const key = prefixed.map((field) => `${field.name}(length: ${field.prefix})`).join(', ')
  if (unsized.length > 0) {
    const columns = unsized.map((field) => `${field.name}(length: ${field.prefix})`).join(', ')
    return [
      `model ${model.name}: its key is on a prefix of a TEXT or BLOB column (${columns}), which GORM's primaryKey cannot write, and MySQL keys such a column only on a prefix; key it on a VarChar or VarBinary the key can hold whole, or use another generator`,
    ]
  }
  return bytes > 3072
    ? [
        `model ${model.name}: its key is on a column prefix (${key}), which GORM's primaryKey cannot write, and its whole columns take ${bytes} bytes, more than the 3072 bytes MySQL keys; key it on shorter columns, or use another generator`,
      ]
    : []
}

// The bytes a whole column takes in a MySQL key, a character 4 in utf8mb4: a TEXT, a BLOB and a
// Bytes with no native type (`longblob`) have no end.
function mysqlKeyBytes(field: DMMF.Field | undefined) {
  if (field === undefined) return 0
  const [native, args] = field.nativeType ?? [undefined, []]
  if (native !== undefined) return MYSQL_NATIVE_BYTES[native]?.(args) ?? Infinity
  // An enum is a Go string with no type of its own, which AutoMigrate keys as varchar(191).
  return MYSQL_TYPE_BYTES[field.kind === 'enum' ? 'String' : field.type] ?? Infinity
}

// The bytes of MySQL's DECIMAL(precision, scale): 4 for each 9 digits of either side of the point,
// and fewer for the digits left over.
function decimalBytes(precision: number, scale: number) {
  const leftover = [0, 1, 1, 2, 2, 3, 3, 4, 4]
  const side = (digits: number) => Math.floor(digits / 9) * 4 + (leftover[digits % 9] ?? 0)
  return side(precision - scale) + side(scale)
}

function standardImports(
  types: readonly string[],
  generators: ReadonlySet<string>,
  needsTime: boolean,
  held: { readonly scalarList: boolean; readonly money: boolean; readonly plainJson: boolean },
) {
  const lists = types.some((name) => name.endsWith('List'))
  const uses = typeImportUses(types, lists, held)
  return [
    held.money ? '"context"' : null,
    generators.has('ulid') ? '"crypto/rand"' : null,
    lists ? '"database/sql"' : null,
    uses.valuers ? '"database/sql/driver"' : null,
    held.plainJson ? '"encoding/json"' : null,
    uses.valuers ? '"fmt"' : null,
    held.money ? '"regexp"' : null,
    uses.parses ? '"strconv"' : null,
    uses.splits ? '"strings"' : null,
    needsTime ? '"time"' : null,
  ]
}

// What the types written beside the models use of the standard library: each is a Valuer and a
// Scanner that reports with fmt; the date types, ScalarList and Money parse numbers, and split
// text where they read a time of day, a list or an amount.
function typeImportUses(
  types: readonly string[],
  lists: boolean,
  held: { readonly scalarList: boolean; readonly money: boolean; readonly plainJson: boolean },
) {
  const parses = types.length > 0 || held.scalarList || held.money
  return {
    valuers: parses || held.plainJson,
    parses,
    splits: types.includes('TimeOfDay') || lists || held.scalarList || held.money,
  }
}

export function collectImports(models: readonly DMMF.Model[], provider?: string) {
  const needsTime = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && f.type === 'DateTime'),
  )
  const types = dateTypes(models)
  const fillsTimes = models.some((m) =>
    m.fields.some(
      (f) => createdTimeExpr(f) !== null || (isDateTimeScalar(f) && f.isUpdatedAt === true),
    ),
  )
  const needsDatatypes = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && f.type === 'Json' && !isPlainJson(f, provider)),
  )
  const money = usesMoney(models, provider)
  const plainJson = usesPlainJson(models, provider)
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
  const standard = standardImports(types, generators, needsTime, {
    scalarList: usesScalarList(models, provider),
    money,
    plainJson,
  })
  const modules = [
    generators.has('uuid') ? '"github.com/google/uuid"' : null,
    generators.has('cuid') ? '"github.com/lucsky/cuid"' : null,
    generators.has('nanoid') ? 'gonanoid "github.com/matoous/go-nanoid/v2"' : null,
    generators.has('cuid2') ? '"github.com/nrednav/cuid2"' : null,
    generators.has('ulid') ? '"github.com/oklog/ulid/v2"' : null,
    needsDatatypes ? '"gorm.io/datatypes"' : null,
    generators.size > 0 || fillsTimes || money || plainJson ? '"gorm.io/gorm"' : null,
    money ? '"gorm.io/gorm/clause"' : null,
    hasImplicitManyToMany(models) || money || plainJson ? '"gorm.io/gorm/schema"' : null,
  ]
  return [standard.filter((i) => i !== null), modules.filter((i) => i !== null)]
}

export function formatImports(groups: readonly (readonly string[])[]) {
  const imports = groups.filter((group) => group.length > 0)
  if (imports.length === 0) return []
  const [only] = imports
  if (imports.length === 1 && only?.length === 1) return ['', `import ${only[0] ?? ''}`]
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

const MONEY_TYPE = [
  '',
  '// Money holds a PostgreSQL money column (@db.Money), which Prisma Migrate makes and the server',
  '// prints in its locale\'s form. It reads the C and en_US form ("-$1,234.50") or a plain number,',
  '// and refuses any other text rather than read a wrong amount; it writes the plain number.',
  'type Money float64',
  '',
  'var (',
  '\tmoneyText   = regexp.MustCompile("^(-?)\\\\$(\\\\d{1,3}(?:,\\\\d{3})*)\\\\.(\\\\d{2})$")',
  '\tmoneyNumber = regexp.MustCompile("^-?\\\\d+(?:\\\\.\\\\d+)?$")',
  ')',
  '',
  '// The largest amount a float64 holds to the cent: money counts cents in an int64, past 2^53.',
  'const maxExactMoney = float64(1<<53) / 100',
  '',
  'func (m Money) Value() (driver.Value, error) {',
  "\treturn strconv.FormatFloat(float64(m), 'f', -1, 64), nil",
  '}',
  '',
  'func (m *Money) Scan(src any) error {',
  '\tvar text string',
  '\tswitch value := src.(type) {',
  '\tcase nil:',
  '\t\t*m = 0',
  '\t\treturn nil',
  '\tcase string:',
  '\t\ttext = value',
  '\tcase []byte:',
  '\t\ttext = string(value)',
  '\tcase float64:',
  '\t\t*m = Money(value)',
  '\t\treturn nil',
  '\tcase int64:',
  '\t\t*m = Money(value)',
  '\t\treturn nil',
  '\tdefault:',
  '\t\treturn fmt.Errorf("a money column held %T", src)',
  '\t}',
  '\tif parts := moneyText.FindStringSubmatch(text); parts != nil {',
  '\t\ttext = parts[1] + strings.ReplaceAll(parts[2], ",", "") + "." + parts[3]',
  '\t} else if !moneyNumber.MatchString(text) {',
  '\t\treturn fmt.Errorf("a money column held %q, which is not in the C or en_US form", text)',
  '\t}',
  '\tamount, err := strconv.ParseFloat(text, 64)',
  '\tif err != nil {',
  '\t\treturn err',
  '\t}',
  '\tif amount > maxExactMoney || amount < -maxExactMoney {',
  '\t\treturn fmt.Errorf("a money column held %q, more than a float64 holds to the cent", text)',
  '\t}',
  '\t*m = Money(amount)',
  '\treturn nil',
  '}',
  '',
  '// GormValue writes the amount through numeric, which PostgreSQL turns into money without reading',
  '// it in the locale\'s form, where a locale whose decimal mark is "," would read "1234.5" as 12345.',
  'func (m Money) GormValue(_ context.Context, db *gorm.DB) clause.Expr {',
  '\tif float64(m) > maxExactMoney || float64(m) < -maxExactMoney {',
  '\t\t_ = db.AddError(fmt.Errorf("%v is more money than a float64 holds to the cent", float64(m)))',
  '\t}',
  '\treturn clause.Expr{SQL: "CAST(CAST(? AS numeric) AS money)", Vars: []any{strconv.FormatFloat(float64(m), \'f\', -1, 64)}}',
  '}',
  '',
  'func (Money) GormDataType() string {',
  '\treturn "money"',
  '}',
  '',
  'func (Money) GormDBDataType(db *gorm.DB, _ *schema.Field) string {',
  '\tif db.Dialector.Name() == "postgres" {',
  '\t\treturn "money"',
  '\t}',
  '\treturn ""',
  '}',
]

const PLAIN_JSON_TYPE = [
  '',
  '// PlainJSON holds a PostgreSQL json column (@db.Json), which keeps the text as it was written:',
  '// datatypes.JSON names jsonb to AutoMigrate whatever the tag says.',
  'type PlainJSON json.RawMessage',
  '',
  'func (j PlainJSON) Value() (driver.Value, error) {',
  '\tif len(j) == 0 {',
  '\t\treturn nil, nil',
  '\t}',
  '\treturn string(j), nil',
  '}',
  '',
  'func (j *PlainJSON) Scan(src any) error {',
  '\tswitch value := src.(type) {',
  '\tcase nil:',
  '\t\t*j = nil',
  '\tcase []byte:',
  '\t\t*j = append(PlainJSON(nil), value...)',
  '\tcase string:',
  '\t\t*j = PlainJSON(value)',
  '\tdefault:',
  '\t\treturn fmt.Errorf("a json column held %T", src)',
  '\t}',
  '\treturn nil',
  '}',
  '',
  'func (j PlainJSON) MarshalJSON() ([]byte, error) {',
  '\tif len(j) == 0 {',
  '\t\treturn []byte("null"), nil',
  '\t}',
  '\treturn j, nil',
  '}',
  '',
  'func (j *PlainJSON) UnmarshalJSON(data []byte) error {',
  '\t*j = append((*j)[0:0], data...)',
  '\treturn nil',
  '}',
  '',
  'func (PlainJSON) GormDataType() string {',
  '\treturn "json"',
  '}',
  '',
  'func (PlainJSON) GormDBDataType(db *gorm.DB, _ *schema.Field) string {',
  '\tif db.Dialector.Name() == "postgres" {',
  '\t\treturn "json"',
  '\t}',
  '\treturn ""',
  '}',
]

/**
 * The types a PostgreSQL `@db.Money` and `@db.Json` are held in, where the schema has one: GORM's
 * float64 cannot read the money text PostgreSQL prints, and datatypes.JSON makes AutoMigrate's
 * column jsonb.
 */
export function generateNativeTypes(models: readonly DMMF.Model[], provider?: string) {
  return [
    ...(usesMoney(models, provider) ? MONEY_TYPE : []),
    ...(usesPlainJson(models, provider) ? PLAIN_JSON_TYPE : []),
  ]
}

/**
 * The type a scalar list is held in on PostgreSQL, where Prisma makes it an array column: written
 * as the array's text form (`{"a","b"}`), which the server casts to the column's type, and read
 * from it, as pgx returns an array it has no Go type for. A nil list is written as `{}` and a NULL
 * column read as an empty list, as Prisma Client reads it.
 */
export function generateScalarListType(models: readonly DMMF.Model[], provider?: string) {
  if (!usesScalarList(models, provider)) return []
  return [
    '',
    'type ScalarList[T string | int | int64 | float64 | bool] []T',
    '',
    'func (list ScalarList[T]) Value() (driver.Value, error) {',
    '\titems := make([]string, len(list))',
    '\tfor i, item := range list {',
    '\t\tswitch value := any(item).(type) {',
    '\t\tcase string:',
    '\t\t\titems[i] = `"` + strings.NewReplacer(`\\`, `\\\\`, `"`, `\\"`).Replace(value) + `"`',
    '\t\tcase int:',
    '\t\t\titems[i] = strconv.FormatInt(int64(value), 10)',
    '\t\tcase int64:',
    '\t\t\titems[i] = strconv.FormatInt(value, 10)',
    '\t\tcase float64:',
    '\t\t\titems[i] = strings.NewReplacer("+Inf", "Infinity", "-Inf", "-Infinity").Replace(strconv.FormatFloat(value, \'g\', -1, 64))',
    '\t\tcase bool:',
    '\t\t\titems[i] = strconv.FormatBool(value)',
    '\t\t}',
    '\t}',
    '\treturn "{" + strings.Join(items, ",") + "}", nil',
    '}',
    '',
    'func (list *ScalarList[T]) Scan(src any) error {',
    '\tvar text string',
    '\tswitch value := src.(type) {',
    '\tcase nil:',
    '\t\t*list = ScalarList[T]{}',
    '\t\treturn nil',
    '\tcase []byte:',
    '\t\ttext = string(value)',
    '\tcase string:',
    '\t\ttext = value',
    '\tdefault:',
    '\t\treturn fmt.Errorf("an array column held %T", src)',
    '\t}',
    '\titems, err := arrayItems(text)',
    '\tif err != nil {',
    '\t\treturn err',
    '\t}',
    '\tread := make(ScalarList[T], len(items))',
    '\tfor i, item := range items {',
    '\t\tvar value any',
    '\t\tvar parseErr error',
    '\t\tswitch any(read[i]).(type) {',
    '\t\tcase string:',
    '\t\t\tvalue = item',
    '\t\tcase int:',
    '\t\t\tvalue, parseErr = strconv.Atoi(item)',
    '\t\tcase int64:',
    '\t\t\tvalue, parseErr = strconv.ParseInt(item, 10, 64)',
    '\t\tcase float64:',
    '\t\t\tvalue, parseErr = strconv.ParseFloat(item, 64)',
    '\t\tcase bool:',
    '\t\t\tswitch item {',
    '\t\t\tcase "t", "true":',
    '\t\t\t\tvalue = true',
    '\t\t\tcase "f", "false":',
    '\t\t\t\tvalue = false',
    '\t\t\tdefault:',
    '\t\t\t\tparseErr = fmt.Errorf("%q is not a boolean", item)',
    '\t\t\t}',
    '\t\t}',
    '\t\tif parseErr != nil {',
    '\t\t\treturn fmt.Errorf("an array column held %q: %w", text, parseErr)',
    '\t\t}',
    '\t\tread[i] = value.(T)',
    '\t}',
    '\t*list = read',
    '\treturn nil',
    '}',
    '',
    '// arrayItems splits the text form of a one-dimensional PostgreSQL array into its elements,',
    '// unquoted. A NULL element (an unquoted NULL) is an error: a Prisma list holds none, and the',
    '// string "NULL" is written quoted.',
    'func arrayItems(text string) ([]string, error) {',
    '\t// An array whose lower bound is not 1 is printed with its bounds first: [0:1]={x,a}.',
    '\tif strings.HasPrefix(text, "[") {',
    '\t\tif eq := strings.Index(text, "="); eq >= 0 {',
    '\t\t\ttext = text[eq+1:]',
    '\t\t}',
    '\t}',
    "\tif len(text) < 2 || text[0] != '{' || text[len(text)-1] != '}' {",
    '\t\treturn nil, fmt.Errorf("an array column held %q", text)',
    '\t}',
    '\tbody := text[1 : len(text)-1]',
    '\titems := []string{}',
    '\tif body == "" {',
    '\t\treturn items, nil',
    '\t}',
    '\tvar item strings.Builder',
    '\tquoted, escaped, wasQuoted := false, false, false',
    '\tend := func() error {',
    '\t\tif !wasQuoted && item.String() == "NULL" {',
    '\t\t\treturn fmt.Errorf("an array column held a NULL element: %q", text)',
    '\t\t}',
    '\t\titems = append(items, item.String())',
    '\t\titem.Reset()',
    '\t\twasQuoted = false',
    '\t\treturn nil',
    '\t}',
    '\t// Every delimiter is ASCII, so the text is walked byte by byte and any other byte kept as it is.',
    '\tfor i := 0; i < len(body); i++ {',
    '\t\tr := body[i]',
    '\t\tswitch {',
    '\t\tcase escaped:',
    '\t\t\titem.WriteByte(r)',
    '\t\t\tescaped = false',
    "\t\tcase r == '\\\\':",
    '\t\t\tescaped = true',
    "\t\tcase r == '\"':",
    '\t\t\tquoted = !quoted',
    '\t\t\twasQuoted = true',
    "\t\tcase r == ',' && !quoted:",
    '\t\t\tif err := end(); err != nil {',
    '\t\t\t\treturn nil, err',
    '\t\t\t}',
    '\t\tdefault:',
    '\t\t\titem.WriteByte(r)',
    '\t\t}',
    '\t}',
    '\tif err := end(); err != nil {',
    '\t\treturn nil, err',
    '\t}',
    '\treturn items, nil',
    '}',
  ]
}
