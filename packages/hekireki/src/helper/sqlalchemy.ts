import type { DMMF } from '@prisma/generator-helper'

import { stripAnnotations } from '../annotation/index.js'
import {
  jsonToPythonLiteral,
  PYTHON_KEYWORDS,
  pythonDocstringLines,
  toPythonString,
} from '../literal/python.js'
import { constraintName, makePascalCase, makeSnakeCase } from '../naming/case.js'
import { allocate } from '../naming/index.js'
import {
  backRelation,
  cuidDefaultVersion,
  fieldColumn,
  isAutoincrement,
  isFunctionDefault,
  isNowDefault,
  isUlidDefault,
  nanoidDefault,
  primaryKeyFields,
  referentialActions,
  relationEnds,
  uuidDefaultVersion,
} from '../prisma/model.js'
import { INDEX_METHODS, operatorClassName, sqlString } from '../prisma/postgres.js'

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

// Not keywords, but unusable as declarative attribute names: `self`/`cls`
// collide with the default __init__ signature and `metadata`/`registry` are
// reserved by DeclarativeBase.
const DECLARATIVE_RESERVED = new Set(['self', 'cls', 'metadata', 'registry'])

// The names of the module a class body reads while it runs: the builtins its annotations name,
// `text` of a server_default, the defaults' clocks and the ORM's own calls. An attribute of the
// same name, assigned earlier in the body, would be read in their place.
const MODULE_NAMES = new Set([
  'bool',
  'bytes',
  'compiles',
  'date',
  'datetime',
  'dict',
  'float',
  'func',
  'int',
  'list',
  'literal_column',
  'mapped_column',
  'relationship',
  'str',
  'text',
  'time_type',
  'timezone',
  'utc_now',
  'uuid6',
  'uuid_mod',
])

// The classes and types the module imports or defines, which a model class of the same name would
// replace for every model after it.
const MODULE_CLASSES = new Set([
  'Any',
  'Base',
  'BigInteger',
  'BindParameter',
  'Boolean',
  'Column',
  'ColumnElement',
  'Date',
  'DateTime',
  'DecimalType',
  'DeclarativeBase',
  'Dialect',
  'Double',
  'Enum',
  'Float',
  'ForeignKey',
  'ForeignKeyConstraint',
  'Index',
  'Integer',
  'Jsonb',
  'LargeBinary',
  'Mapped',
  'MetaData',
  'Numeric',
  'Optional',
  'PrimaryKeyConstraint',
  'SmallInteger',
  'String',
  'Table',
  'Text',
  'Time',
  'TypeDecorator',
  'UtcDateTime',
  'UtcDateTimeTz',
  'UtcTimestamp',
  'Uuid',
  'Xml',
])

// A keyword, a reserved name or a name of the module is mapped to a `<name>_` attribute; the
// real column is then preserved via the first positional argument to mapped_column.
export function pythonAttrName(columnName: string) {
  return PYTHON_KEYWORDS.has(columnName) ||
    DECLARATIVE_RESERVED.has(columnName) ||
    MODULE_NAMES.has(columnName)
    ? `${columnName}_`
    : columnName
}

/**
 * The attribute a field of `model` is mapped to: its name in snake_case, made safe by
 * `pythonAttrName`. Where two fields come to one name (`createdAt` and `created_at`), the one
 * already written in snake_case keeps it and the other is numbered, its column named apart.
 */
function attributeName(model: DMMF.Model | undefined, fieldName: string) {
  const candidates = (model?.fields ?? []).map((f) => ({
    key: f.name,
    candidate: pythonAttrName(makeSnakeCase(f.name)),
  }))
  const names = allocate(
    [
      ...candidates.filter((c) => c.candidate === c.key),
      ...candidates.filter((c) => c.candidate !== c.key),
    ],
    [],
    (name) => name,
  )
  return names.get(fieldName) ?? pythonAttrName(makeSnakeCase(fieldName))
}

// The Python class of a model: its name in PascalCase, with a trailing underscore where the module
// already has the name (`Base`, `Index`), its table kept by `__tablename__`.
function className(modelName: string) {
  const name = makePascalCase(modelName)
  return MODULE_CLASSES.has(name) ? `${name}_` : name
}

/**
 * An index of DMMF, with the condition of a partial one (the `partialIndexes` preview feature) as
 * the SQL Prisma Migrate writes after its WHERE: DMMF drops it.
 */
export type SqlIndex = DMMF.Index & { readonly where?: string }

// The keyword a partial index's condition is given to Index() by, per dialect; MySQL has no
// partial index.
function whereKeyword(provider: string) {
  if (provider === 'sqlite') return 'sqlite_where'
  if (provider === 'sqlserver') return 'mssql_where'
  return provider === 'mysql' ? null : 'postgresql_where'
}

// A partial index's condition as the argument of Index(). literal_column() renders the SQL as it
// is, where text() would take a `:name` in it for a bind parameter, which DDL cannot render.
function whereArg(index: SqlIndex, provider: string) {
  const keyword = whereKeyword(provider)
  if (index.where === undefined || keyword === null) return null
  return `${keyword}=literal_column(${toPythonString(index.where)})`
}

// A column name as the dialect quotes it, the quote a name holds doubled.
function sqlQuoted(name: string, provider: string) {
  if (provider === 'mysql') return `\`${name.replaceAll('`', '``')}\``
  if (provider === 'sqlserver') return `[${name.replaceAll(']', ']]')}]`
  return `"${name.replaceAll('"', '""')}"`
}

// Whether the provider is PostgreSQL or CockroachDB, whose dialect in SQLAlchemy is PostgreSQL's.
function isPostgres(provider: string) {
  return provider === 'postgresql' || provider === 'cockroachdb'
}

// The operator class of an index's column (`ops:`) as PostgreSQL names it; null where none is
// given or the dialect has none.
function columnOperatorClass(model: DMMF.Model, field: DMMF.IndexField, provider: string) {
  if (!isPostgres(provider) || field.operatorClass === undefined || field.operatorClass === '') {
    return null
  }
  const nativeType = model.fields.find((mf) => mf.name === field.name)?.nativeType?.[0]
  return operatorClassName(field.operatorClass, nativeType)
}

// A column of an index as the argument of Index(): its name, or, sorted descending, the quoted
// column with its operator class and order, which a name alone cannot carry (postgresql_ops would
// put the class after DESC). The index keeps its table from `__table_args__` all the same.
function indexColumnArg(model: DMMF.Model, field: DMMF.IndexField, provider: string) {
  const column = fieldColumn(model, field.name)
  if (field.sortOrder !== 'desc') return toPythonString(column)
  const operatorClass = columnOperatorClass(model, field, provider)
  const sql = `${sqlQuoted(column, provider)}${operatorClass === null ? '' : ` ${operatorClass}`}`
  return `literal_column(${toPythonString(sql)}).desc()`
}

// The method (`type:`) and the operator classes of the ascending columns of an index on
// PostgreSQL, as the keywords of Index(): postgresql_ops is keyed by the column's key, which is
// its name in the database. A B-tree is the default and is left unsaid.
function postgresIndexArgs(model: DMMF.Model, index: SqlIndex, provider: string) {
  if (!isPostgres(provider)) return []
  const method = index.algorithm === undefined ? undefined : INDEX_METHODS[index.algorithm]
  const ops = index.fields
    .filter((f) => f.sortOrder !== 'desc')
    .flatMap((f) => {
      const operatorClass = columnOperatorClass(model, f, provider)
      if (operatorClass === null) return []
      return [`${toPythonString(fieldColumn(model, f.name))}: ${toPythonString(operatorClass)}`]
    })
  return [
    ...(method === undefined ? [] : [`postgresql_using=${toPythonString(method)}`]),
    ...(ops.length === 0 ? [] : [`postgresql_ops={${ops.join(', ')}}`]),
  ]
}

// Whether the indexes of a model read literal_column(): for a partial index's condition or a
// descending column.
function readsLiteralColumn(model: DMMF.Model, indexes: readonly SqlIndex[], provider: string) {
  return modelIndexes(model, indexes).some(
    (idx) => whereArg(idx, provider) !== null || idx.fields.some((f) => f.sortOrder === 'desc'),
  )
}

// The indexes and uniques of a model whose fields are all on it: one that lists an `@ignore`d
// field, which has no column, is left out.
function modelIndexes(model: DMMF.Model, indexes: readonly SqlIndex[]) {
  const fieldNames = new Set(model.fields.map((mf) => mf.name))
  return indexes.filter(
    (idx) =>
      idx.model === model.name &&
      (idx.type === 'unique' || idx.type === 'normal' || idx.type === 'fulltext') &&
      idx.fields.every((f) => fieldNames.has(f.name)),
  )
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
    // SQLAlchemy's Float is a single-precision FLOAT on MySQL, where Prisma makes a DOUBLE.
    uses('Float') && (provider === 'sqlite' || provider === 'mysql')
      ? `float: ${plainType('Float', provider)}`
      : null,
    uses('Decimal') ? `DecimalType: ${plainType('Decimal', provider)}` : null,
    uses('Bytes') && provider === 'mysql' ? 'bytes: LONGBLOB' : null,
  ].filter((entry) => entry !== null)
}

// Native types whose column type takes nothing from the arguments.
const NATIVE_FIXED: { [k: string]: string } = {
  Text: 'Text',
  TinyText: 'TINYTEXT',
  MediumText: 'MEDIUMTEXT',
  LongText: 'LONGTEXT',
  Xml: 'Xml',
  Inet: 'INET',
  Citext: 'CITEXT',
  Oid: 'OID',
  Integer: 'Integer',
  Int: 'Integer',
  SmallInt: 'SmallInteger',
  MediumInt: 'MEDIUMINT',
  UnsignedInt: 'INTEGER(unsigned=True)',
  UnsignedSmallInt: 'SMALLINT(unsigned=True)',
  UnsignedMediumInt: 'MEDIUMINT(unsigned=True)',
  UnsignedTinyInt: 'TINYINT(unsigned=True)',
  UnsignedBigInt: 'BIGINT(unsigned=True)',
  Year: 'YEAR',
  BigInt: 'BigInteger',
  DoublePrecision: 'Double',
  Double: 'Double',
  Float: 'Float',
  Real: 'REAL',
  Money: 'MONEY',
  Boolean: 'Boolean',
  ByteA: 'LargeBinary',
  TinyBlob: 'TINYBLOB',
  MediumBlob: 'MEDIUMBLOB',
  LongBlob: 'LONGBLOB',
  Blob: 'BLOB',
  Uuid: 'Uuid',
  Date: 'Date',
  Json: 'JSON',
  JsonB: 'JSONB',
}

// Native types written `TYPE(length)`, or bare without a length.
const NATIVE_SIZED: { [k: string]: string } = {
  Char: 'CHAR',
  Bit: 'BIT',
  Binary: 'BINARY',
  VarBinary: 'VARBINARY',
}

// A bare `@db.Timestamp` or `@db.DateTime` is the database's own precision, as Prisma Migrate
// writes it: timestamp (6) on PostgreSQL, TIMESTAMP and DATETIME (0) on MySQL.
function temporalNativeType(nativeName: string, args: readonly string[], provider: string) {
  const precision = args.length > 0 ? `precision=${args[0]}` : ''
  const fsp = args.length > 0 ? `fsp=${args[0]}` : ''
  switch (nativeName) {
    case 'Timestamp':
      return provider === 'mysql' ? `UtcTimestamp(${fsp})` : `UtcDateTime(${precision})`
    case 'DateTime':
      return `UtcDateTime(${fsp})`
    case 'Timestamptz':
      return `UtcDateTimeTz(${precision})`
    // SQLAlchemy's Time has no precision: create_all would write TIME, the database's own
    // (time(6) on PostgreSQL, TIME(0) on MySQL), where Prisma Migrate writes the one asked for.
    case 'Time':
      if (args.length === 0) return 'Time'
      return provider === 'mysql' ? `TIME(${fsp})` : `TIME(${precision})`
    case 'Timetz':
      return args.length === 0 ? 'Time(timezone=True)' : `TIME(${precision}, timezone=True)`
    default:
      return null
  }
}

// The column type of a field, as Prisma Migrate creates it: the plain type, or the one its
// `@db.*` names, in SQLAlchemy's generic type where that writes the same DDL and the dialect's
// where only it carries a length, a precision or `unsigned`.
function resolveNativeType(field: DMMF.Field, provider: string) {
  const baseType = plainType(field.type, provider)
  if (!field.nativeType) return baseType

  const [nativeName, nativeArgs] = field.nativeType
  const args = nativeArgs ?? []
  const length = args[0] ?? ''

  switch (nativeName) {
    case 'VarChar':
      return args.length > 0 ? `String(${length})` : 'String'
    case 'VarBit':
      return length === '' ? 'BIT(varying=True)' : `BIT(${length}, varying=True)`
    case 'TinyInt':
      // A Boolean's TINYINT is BOOL's tinyint(1).
      return field.type === 'Boolean' ? 'Boolean' : 'TINYINT'
    case 'Decimal':
      return args.length >= 2 ? `Numeric(precision=${args[0]}, scale=${args[1]})` : 'Numeric'
    default:
      return sizedOrFixedNativeType(nativeName, args, provider) ?? baseType
  }
}

function sizedOrFixedNativeType(nativeName: string, args: readonly string[], provider: string) {
  const sized = NATIVE_SIZED[nativeName]
  const length = args[0] ?? ''
  if (sized !== undefined) return length === '' ? sized : `${sized}(${length})`
  return temporalNativeType(nativeName, args, provider) ?? NATIVE_FIXED[nativeName] ?? null
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
    inverse: DMMF.Field
    foreignKey: string
    foreignKeys: readonly string[]
    isList: boolean
    onDelete: string
  }[] = []
  const hasOne: {
    name: string
    targetModel: string
    inverse: DMMF.Field
    foreignKey: string
    foreignKeys: readonly string[]
    isList: boolean
    optional: boolean
    onDelete: string
  }[] = []
  const manyToMany: { name: string; targetModel: string; relationName: string }[] = []

  for (const end of relationEnds(model, allModels)) {
    const { field } = end
    if (end.kind === 'belongsTo') {
      const foreignKeys = field.relationFromFields ?? []
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKey: foreignKeys[0] ?? '',
        references: field.relationToFields?.[0] ?? 'id',
        foreignKeys,
        referencesList: field.relationToFields ?? ['id'],
        optional: !field.isRequired,
        // What Prisma Migrate writes when the schema names no action: the database has it, so
        // the model says it too.
        ...referentialActions(field),
      })
      continue
    }
    if (end.kind === 'manyToMany') {
      manyToMany.push({
        name: field.name,
        targetModel: field.type,
        relationName: field.relationName ?? `${model.name}To${field.type}`,
      })
      continue
    }
    const fkField = end.inverse
    const foreignKeys = fkField.relationFromFields ?? []
    const foreignKey = foreignKeys[0] ?? ''
    const { onDelete } = referentialActions(fkField)
    if (end.kind === 'hasMany') {
      hasMany.push({
        name: field.name,
        targetModel: field.type,
        inverse: fkField,
        foreignKey,
        foreignKeys,
        isList: true,
        onDelete,
      })
    } else {
      hasOne.push({
        name: field.name,
        targetModel: field.type,
        inverse: fkField,
        foreignKey,
        foreignKeys,
        isList: false,
        optional: !field.isRequired,
        onDelete,
      })
    }
  }

  return { belongsTo, hasMany, hasOne, manyToMany }
}

export function collectManyToManyTables(allModels: readonly DMMF.Model[]) {
  const modelByName = new Map(allModels.map((m) => [m.name, m]))
  const candidates = allModels.flatMap((model) =>
    model.fields.flatMap((field) => {
      if (field.kind !== 'object' || !field.isList) return []
      if (!modelByName.has(field.type)) return []
      const otherSide = backRelation(field, model, allModels)
      if (otherSide?.isList !== true) return []

      const [leftName, rightName] =
        model.name < field.type ? [model.name, field.type] : [field.type, model.name]
      const leftModelObj = modelByName.get(leftName)
      const rightModelObj = modelByName.get(rightName)

      // Prisma names the implicit join table `_<relationName>` (default
      // relationName is the two model names alphabetically joined by "To").
      const relationName = field.relationName ?? `${leftName}To${rightName}`
      return [
        {
          relationName,
          info: {
            relationName,
            tableName: `_${relationName}`,
            varName: associationVarName(relationName),
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

// The module-level names an id default or a DateTime reads at insert time: a join
// table under one of them (`@relation("Nanoid")`) would replace the module.
const MODULE_LEVEL_NAMES = new Set([
  'uuid',
  'uuid6',
  'cuid',
  'cuid2',
  'nanoid',
  'datetime',
  'date',
  'timezone',
  'text',
  'literal_column',
  'func',
])

function associationVarName(relationName: string) {
  const name = makeSnakeCase(relationName)
  return MODULE_LEVEL_NAMES.has(name) ? `${name}_table` : name
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

const SQL_ACTION: { [k: string]: string } = {
  Cascade: 'CASCADE',
  SetNull: 'SET NULL',
  Restrict: 'RESTRICT',
  NoAction: 'NO ACTION',
  SetDefault: 'SET DEFAULT',
}

// A @db.Date or @db.Time column holds a date or a time: its default is the part of the
// instant, in UTC, the column keeps.
function dateTimeDefault(field: DMMF.Field, def: string) {
  const iso = new Date(def).toISOString()
  const nativeName = field.nativeType?.[0]
  if (nativeName === 'Date') return `date.fromisoformat("${iso.slice(0, 10)}")`
  if (nativeName === 'Time') return `time_type.fromisoformat("${iso.slice(11, 23)}")`
  if (nativeName === 'Timetz') return `time_type.fromisoformat("${iso.slice(11, 23)}+00:00")`
  return `datetime.fromisoformat(${toPythonString(def)})`
}

// DMMF carries BigInt defaults as digit strings, DateTime literals as ISO
// strings, and Json defaults as JSON text; each needs its Python shape,
// not a bare quoted string.
function stringDefault(field: DMMF.Field, def: string) {
  if (field.type === 'BigInt') return def
  if (field.type === 'DateTime') return dateTimeDefault(field, def)
  if (field.type === 'Json') {
    const parsed: unknown = JSON.parse(def)
    return typeof parsed === 'object' && parsed !== null
      ? `lambda: ${jsonToPythonLiteral(parsed)}`
      : jsonToPythonLiteral(parsed)
  }
  return toPythonString(def)
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
  if (typeof def === 'string') return stringDefault(field, def)
  return null
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
  if (field.kind === 'enum') {
    return sqlString(enumDef?.values.find((v) => v.name === value)?.dbName ?? String(value))
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  // SQLAlchemy puts a MySQL default with a sign or a point in parentheses, which makes it an
  // expression; quoted, MySQL reads it as the number all the same.
  if (typeof value === 'number' || ['Int', 'BigInt', 'Float', 'Decimal'].includes(field.type)) {
    return provider === 'mysql' ? sqlString(String(value)) : String(value)
  }
  if (field.type === 'DateTime' && typeof value === 'string') {
    return dateTimeSqlLiteral(field, value, provider)
  }
  return sqlString(String(value))
}

function dateTimeSqlLiteral(field: DMMF.Field, value: string, provider: string) {
  const iso = new Date(value).toISOString()
  const ms = iso.slice(19, 23) === '.000' ? '' : iso.slice(19, 23)
  const time = `${iso.slice(11, 19)}${ms}`
  const nativeName = field.nativeType?.[0]
  if (nativeName === 'Date') return sqlString(iso.slice(0, 10))
  if (nativeName === 'Time') return sqlString(time)
  if (nativeName === 'Timetz') return sqlString(`${time}+00`)
  return sqlString(`${iso.slice(0, 10)} ${time}${provider === 'mysql' ? '' : ' +00:00'}`)
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

function usesNativeType(models: readonly DMMF.Model[], names: readonly string[]) {
  const nameSet = new Set(names)
  return models.some((m) => m.fields.some((f) => nameSet.has(f.nativeType?.[0] ?? '')))
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

// Whether more than one foreign key links the two models, in either direction: SQLAlchemy then
// cannot tell which one a relationship joins on, and each names its own with `foreign_keys=`.
// A self-relation's keys are counted once.
function needsForeignKeysParam(
  modelName: string,
  targetModelName: string,
  allModels: readonly DMMF.Model[],
) {
  const keysTo = (from: string, to: string) =>
    (allModels.find((m) => m.name === from)?.fields ?? []).filter(
      (f) => f.kind === 'object' && f.type === to && (f.relationFromFields ?? []).length > 0,
    ).length
  const back = modelName === targetModelName ? 0 : keysTo(targetModelName, modelName)
  return keysTo(modelName, targetModelName) + back > 1
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
  // The relations of the source model whose foreign key holds `foreignKey`.
  const keyRelations = new Set(
    (sourceModel?.fields ?? [])
      .filter((sf) => sf.relationFromFields?.includes(foreignKey) === true)
      .map((sf) => sf.relationName),
  )

  const backField = targetModel.fields.find((f) => {
    if (f.kind !== 'object') return false
    if (f.type !== sourceModelName) return false
    if (targetModelName === sourceModelName && f.name === sourceFieldName) return false
    if (relationName !== undefined) return f.relationName === relationName
    if (f.relationFromFields?.includes(foreignKey) === true) return true
    return keyRelations.has(f.relationName)
  })

  return backField
    ? attributeName(targetModel, backField.name)
    : pythonAttrName(makeSnakeCase(sourceModelName))
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
  return backField
    ? attributeName(targetModel, backField.name)
    : pythonAttrName(makeSnakeCase(sourceModelName))
}

/**
 * The `overlaps=` of a relationship that writes the foreign key `relation` holds (the many-to-one
 * itself or the collection on the other side): every other relationship that writes one of the
 * same columns. A composite key that shares a column with another relation
 * (`[projectId, environment]` beside `projectId`) has two relationships copying the column, which
 * SQLAlchemy warns of unless each names the others. The pair of a back_populates is left out, as
 * SQLAlchemy leaves it.
 *
 * @example
 * ```python
 * environment_ref: Mapped[Optional["ProjectEnvironment"]] = relationship(overlaps="database_configs,project", back_populates="database_configs")
 * ```
 */
function overlapsClause(
  holdingModelName: string,
  relation: DMMF.Field,
  allModels: readonly DMMF.Model[],
) {
  const holding = allModels.find((m) => m.name === holdingModelName)
  const keys = new Set(relation.relationFromFields)
  const names = (holding?.fields ?? []).flatMap((f) =>
    f.kind === 'object' &&
    f.name !== relation.name &&
    (f.relationFromFields ?? []).some((key) => keys.has(key))
      ? [
          attributeName(holding, f.name),
          findBackPopulates(
            f.type,
            holdingModelName,
            f.relationFromFields?.[0] ?? '',
            allModels,
            f.name,
          ),
        ]
      : [],
  )
  const sorted = [...new Set(names)].toSorted()
  return sorted.length > 0 ? `overlaps="${sorted.join(',')}", ` : ''
}

// The column's type, where the base's type_annotation_map does not give it.
function columnTypeArgs(
  field: DMMF.Field,
  enumMap: ReadonlyMap<string, DMMF.DatamodelEnum>,
  provider: string,
) {
  // SQLite has no enums: Prisma Migrate makes the column TEXT, the plain `str` of the base.
  if (field.kind === 'enum' && provider !== 'sqlite') {
    const enumDef = enumMap.get(field.type)
    // The database stores the @map-ped values under the @@map-ped type name.
    const valuesStr = enumDef ? enumDef.values.map((v) => `"${v.dbName ?? v.name}"`).join(', ') : ''
    const enumType = `Enum(${valuesStr}, name="${enumDef?.dbName ?? field.type}")`
    return [field.isList ? `ARRAY(${enumType})` : enumType]
  }
  if (field.isList) return [`ARRAY(${resolveNativeType(field, provider)})`]
  if (!needsExplicitSaType(field, provider)) return []
  const saType = resolveNativeType(field, provider)
  // SQLAlchemy writes None into a JSON column as the JSON text `null`, which `IS NULL` does not
  // find; the None of an optional Json field is the column's NULL, as Prisma's DbNull is.
  return [field.type === 'Json' && !field.isRequired ? `${saType}(none_as_null=True)` : saType]
}

function foreignKeyArgs(
  field: DMMF.Field,
  associations: ReturnType<typeof getAssociations>,
  allModels: readonly DMMF.Model[],
  tableName: string,
  columnName: string,
  provider: string,
) {
  const assoc = associations.belongsTo.find((a) => a.foreignKey === field.name)
  // A composite FK is expressed as a table-level ForeignKeyConstraint; a
  // per-column ForeignKey would pair this column with references[0] alone
  // and emit a half-join against a non-unique column.
  if (assoc?.foreignKeys.length !== 1) return []
  const targetModelObj = allModels.find((m) => m.name === assoc.targetModel)
  const targetTable = targetModelObj?.dbName ?? assoc.targetModel
  const targetField = targetModelObj?.fields.find((f) => f.name === assoc.references)
  const targetCol = targetField?.dbName ?? assoc.references
  const fkActions = referentialActionArgs(assoc.onDelete, assoc.onUpdate)
  const fkName = constraintName(tableName, [columnName], 'fkey', provider)
  return [`ForeignKey("${targetTable}.${targetCol}"${fkActions}, name="${fkName}")`]
}

function referentialActionArgs(onDelete: string, onUpdate: string) {
  const deleteAction = SQL_ACTION[onDelete]
  const updateAction = SQL_ACTION[onUpdate]
  return [
    deleteAction === undefined ? '' : `, ondelete="${deleteAction}"`,
    updateAction === undefined ? '' : `, onupdate="${updateAction}"`,
  ].join('')
}

function keyArgs(field: DMMF.Field, isPk: boolean, provider: string) {
  return [
    ...(isPk ? ['primary_key=True'] : []),
    ...(isPk && isAutoincrement(field) ? ['autoincrement=True'] : []),
    // SQLAlchemy makes a lone integer key SERIAL or AUTO_INCREMENT unless told otherwise; Prisma
    // Migrate does only for @default(autoincrement()). SQLite's is AUTOINCREMENT either way.
    ...(provider !== 'sqlite' &&
    field.isId &&
    ['Int', 'BigInt'].includes(field.type) &&
    !isAutoincrement(field)
      ? ['autoincrement=False']
      : []),
  ]
}

// The process's clock in UTC, as the part of it the column keeps.
function utcNowExpr(field: DMMF.Field) {
  const nativeName = field.nativeType?.[0]
  if (nativeName === 'Date') return 'lambda: utc_now().date()'
  if (nativeName === 'Time') return 'lambda: utc_now().time()'
  if (nativeName === 'Timetz') return 'lambda: utc_now().timetz()'
  return 'utc_now'
}

function nowServerDefault(field: DMMF.Field, provider: string, utcNow: string) {
  // A DateTime with no native type is Prisma's DATETIME(3).
  const fsp = field.nativeType ? field.nativeType[1][0] : '3'
  return provider === 'mysql' && utcNow === 'utc_now' && fsp !== undefined && fsp !== '0'
    ? `text("CURRENT_TIMESTAMP(${fsp})")`
    : 'text("CURRENT_TIMESTAMP")'
}

// uuid6.uuid7 covers Python < 3.14 (stdlib uuid gains uuid7 in 3.14).
function uuidDefaultArg(field: DMMF.Field, uuidVersion: number) {
  const isNativeUuid = field.nativeType?.[0] === 'Uuid'
  if (isNativeUuid) return uuidVersion === 7 ? 'default=uuid6.uuid7' : 'default=uuid_mod.uuid4'
  return uuidVersion === 7
    ? 'default=lambda: str(uuid6.uuid7())'
    : 'default=lambda: str(uuid_mod.uuid4())'
}

// cuid() is the cuid package's (version 1), cuid(2) cuid2's and nanoid() nanoid's, the ids Prisma
// Client makes. The lambda reads the module when it is called, so an attribute of the same name
// earlier in the class body cannot stand in for it.
function idDefaultArg(field: DMMF.Field) {
  const cuidVersion = cuidDefaultVersion(field)
  if (cuidVersion !== null) {
    return cuidVersion === 2 ? 'default=lambda: cuid2.create_id()' : 'default=lambda: cuid.cuid()'
  }
  const nanoid = nanoidDefault(field)
  if (nanoid === null) return null
  // generate() takes the alphabet first: the length goes by name.
  return nanoid.length === null
    ? 'default=lambda: nanoid.generate()'
    : `default=lambda: nanoid.generate(size=${nanoid.length})`
}

// A key with a literal default gets it like any column: Prisma creates the column with that
// DEFAULT, and SQLAlchemy needs the value in the instance to hold its identity.
function literalDefaultArgs(
  field: DMMF.Field,
  enumMap: ReadonlyMap<string, DMMF.DatamodelEnum>,
  provider: string,
) {
  const defaultVal = formatDefault(field, enumMap.get(field.type))
  if (defaultVal === null) return []
  const sql = serverDefault(field, enumMap.get(field.type), provider)
  return [
    `default=${defaultVal}`,
    ...(sql === null ? [] : [`server_default=text(${toPythonString(sql)})`]),
  ]
}

// now() and @updatedAt take the clock of the process, in UTC: the database's NOW() is the
// session zone's wall time in a timestamp column and drops MySQL's milliseconds. The
// server_default is Prisma Migrate's, for the DDL, where MySQL holds it to the column's
// precision.
function defaultArgs(
  field: DMMF.Field,
  enumMap: ReadonlyMap<string, DMMF.DatamodelEnum>,
  provider: string,
) {
  const dbGeneratedExpr =
    isFunctionDefault(field.default) &&
    field.default.name === 'dbgenerated' &&
    typeof field.default.args[0] === 'string'
      ? field.default.args[0]
      : null
  // dbgenerated() is a raw DDL expression no client library can evaluate.
  if (dbGeneratedExpr !== null) return [`server_default=text(${toPythonString(dbGeneratedExpr)})`]
  if (isNowDefault(field)) {
    const utcNow = utcNowExpr(field)
    return [`default=${utcNow}`, `server_default=${nowServerDefault(field, provider, utcNow)}`]
  }
  const uuidVersion = uuidDefaultVersion(field)
  if (uuidVersion !== null) return [uuidDefaultArg(field, uuidVersion)]
  if (isUlidDefault(field)) return ['default=lambda: str(ULID())']
  const idArg = idDefaultArg(field)
  if (idArg !== null) return [idArg]
  return literalDefaultArgs(field, enumMap, provider)
}

// Prisma's @updatedAt also sets the value on create; without an insert
// default the NOT NULL column fails on the first INSERT.
function updatedAtArgs(field: DMMF.Field) {
  if (field.isUpdatedAt !== true) return []
  const utcNow = utcNowExpr(field)
  return [...(isNowDefault(field) ? [] : [`default=${utcNow}`]), `onupdate=${utcNow}`]
}

function generateColumn(
  field: DMMF.Field,
  isPk: boolean,
  isFk: boolean,
  associations: ReturnType<typeof getAssociations>,
  allModels: readonly DMMF.Model[],
  enumMap: ReadonlyMap<string, DMMF.DatamodelEnum>,
  provider: string,
  model: DMMF.Model,
  isMapperKey: boolean,
) {
  // The attribute is the field in Python's case; the column is Prisma's, named
  // positionally whenever the two differ.
  const tableName = model.dbName ?? model.name
  const columnName = field.dbName ?? field.name
  const attrName = attributeName(model, field.name)
  const elemPythonType = field.kind === 'enum' ? 'str' : pythonTypeForNative(field)
  // A scalar list is a collection; collapsing it to its element type silently
  // drops the array. Lists are non-Optional (an empty array, not None).
  const pythonType = field.isList ? `list[${elemPythonType}]` : elemPythonType
  const typeHint = field.isList || field.isRequired ? pythonType : `Optional[${pythonType}]`

  const colArgs = [
    // An attribute renamed (`<name>_`, a numbered twin): pin the real column name positionally.
    ...(attrName === columnName ? [] : [`"${columnName}"`]),
    ...columnTypeArgs(field, enumMap, provider),
    ...(isFk
      ? foreignKeyArgs(field, associations, allModels, tableName, columnName, provider)
      : []),
    ...keyArgs(field, isPk, provider),
    // Prisma Migrate leaves a list's column nullable; the model reads it as a list all the same.
    ...(field.isList ? ['nullable=True'] : []),
    ...defaultArgs(field, enumMap, provider),
    ...updatedAtArgs(field),
  ]

  // A bare annotation binds no name in the class body, and `__mapper_args__` names a key column
  // by its attribute: that one is assigned, as SQLAlchemy's docs write it.
  if (colArgs.length === 0 && !isMapperKey) {
    return `    ${attrName}: Mapped[${typeHint}]`
  }

  return `    ${attrName}: Mapped[${typeHint}] = mapped_column(${colArgs.join(', ')})`
}

function tableOptions(model: DMMF.Model, provider: string) {
  if (provider === 'mysql') {
    return '{"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}'
  }
  return provider === 'sqlite' && model.fields.some((f) => f.isId && f.type === 'Int')
    ? '{"sqlite_autoincrement": True}'
    : null
}

// A composite @@id whose columns are not in field order: `primary_key=True` on each column makes
// SQLAlchemy's key the table's column order, so the key is spelled out in Prisma's order. Its
// name is still the base's `<table>_pkey`.
function keyOrderConstraint(model: DMMF.Model) {
  const keyFields = model.primaryKey?.fields ?? []
  const keySet = new Set(keyFields)
  const fieldOrder = model.fields.filter((f) => keySet.has(f.name)).map((f) => f.name)
  if (keyFields.every((name, i) => fieldOrder[i] === name)) return null
  const columns = keyFields.map((name) => toPythonString(fieldColumn(model, name)))
  return `PrimaryKeyConstraint(${columns.join(', ')})`
}

function generateTableArgs(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  indexes: readonly SqlIndex[],
  provider: string,
  views: ReadonlySet<string>,
) {
  // A view has no index, no foreign key and no table option: its SQL is written by hand.
  if (views.has(model.name)) return []
  const tableName = model.dbName ?? model.name

  // Prisma Migrate makes every unique a unique index, named `<table>_<columns>_key`, and every
  // index `<table>_<columns>_idx`; a partial one keeps its condition, and one on PostgreSQL its
  // method and operator classes.
  const indexConstraints = modelIndexes(model, indexes).map((idx) => {
    const columns = idx.fields.map((f) => fieldColumn(model, f.name))
    const unique = idx.type === 'unique'
    const name = idx.dbName ?? constraintName(tableName, columns, unique ? 'key' : 'idx', provider)
    const where = whereArg(idx, provider)
    const args = [
      toPythonString(name),
      ...idx.fields.map((f) => indexColumnArg(model, f, provider)),
      ...(unique ? ['unique=True'] : []),
      ...postgresIndexArgs(model, idx, provider),
      ...(where === null ? [] : [where]),
    ]
    return `Index(${args.join(', ')})`
  })

  const modelByName = new Map(allModels.map((m) => [m.name, m]))
  const fkConstraints = model.fields
    .filter(
      (f) =>
        f.kind === 'object' &&
        f.relationFromFields !== undefined &&
        f.relationFromFields.length > 1 &&
        f.relationToFields !== undefined &&
        !views.has(f.type),
    )
    .map((f) => {
      const target = modelByName.get(f.type)
      const targetFields = new Map((target?.fields ?? []).map((mf) => [mf.name, mf]))
      const targetTable = target?.dbName ?? f.type
      const localCols = (f.relationFromFields ?? []).map((c) => fieldColumn(model, c))
      const targetCols = (f.relationToFields ?? []).map(
        (c) => `"${targetTable}.${targetFields.get(c)?.dbName ?? c}"`,
      )
      const { onDelete, onUpdate } = referentialActions(f)
      const actions = referentialActionArgs(onDelete, onUpdate)
      const name = constraintName(tableName, localCols, 'fkey', provider)
      return `ForeignKeyConstraint([${localCols.map((c) => `"${c}"`).join(', ')}], [${targetCols.join(', ')}]${actions}, name="${name}")`
    })

  // The options Prisma Migrate gives each table: MySQL's character set and collation, and
  // SQLite's AUTOINCREMENT on a lone Int key, whether or not it defaults to autoincrement() (a
  // BigInt's is no INTEGER key, and goes without).
  const options = tableOptions(model, provider)
  const keyOrder = keyOrderConstraint(model)
  const allConstraints = [
    ...(keyOrder === null ? [] : [keyOrder]),
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

/**
 * The arguments of a relationship one of whose ends is a view. A view is in a `MetaData` of its
 * own and the database holds no foreign key to or from it, so the mapped tables have none either:
 * the join is spelled out, `foreign()` marking the columns of the model that names them in
 * `@relation(fields:)`. The relationship only reads (`viewonly=True`): a view takes no write, and
 * a flush has no key to copy.
 *
 * @example
 * ```python
 * user: Mapped["User"] = relationship(primaryjoin="foreign(UserStat.user_id) == User.id", viewonly=True)
 * ```
 */
function viewJoinArgs(
  holdingModelName: string,
  foreignKeys: readonly string[],
  targetModelName: string,
  references: readonly string[],
  allModels: readonly DMMF.Model[],
) {
  const holding = allModels.find((m) => m.name === holdingModelName)
  const target = allModels.find((m) => m.name === targetModelName)
  const pairs = foreignKeys.map(
    (fk, i) =>
      `foreign(${className(holdingModelName)}.${attributeName(holding, fk)}) == ${className(targetModelName)}.${attributeName(target, references[i] ?? 'id')}`,
  )
  const join = pairs.length === 1 ? pairs.join('') : `and_(${pairs.join(', ')})`
  return `primaryjoin="${join}", viewonly=True`
}

function generateBelongsToRelationships(
  associations: ReturnType<typeof getAssociations>,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  views: ReadonlySet<string>,
) {
  const fieldByName = new Map(model.fields.map((f) => [f.name, f]))
  return associations.belongsTo.map((assoc) => {
    const snakeName = attributeName(model, assoc.name)
    const backPop = findBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.foreignKey,
      allModels,
      assoc.name,
    )
    const fkClause = needsForeignKeysParam(model.name, assoc.targetModel, allModels)
      ? `foreign_keys=[${assoc.foreignKeys.map((fk) => attributeName(model, fk)).join(', ')}], `
      : ''
    // A self-referential many-to-one needs remote_side (the PK side) so the ORM
    // can tell which end is "one"; without it mapper configuration fails.
    const identity = primaryKeyFields(model)
    const remoteClause =
      assoc.targetModel === model.name && identity.length > 0
        ? `remote_side=[${identity.map((name) => attributeName(model, name)).join(', ')}], `
        : ''
    const target = className(assoc.targetModel)
    const mappedType = assoc.optional ? `Optional["${target}"]` : `"${target}"`
    if (views.has(model.name) || views.has(assoc.targetModel)) {
      const join = viewJoinArgs(
        model.name,
        assoc.foreignKeys,
        assoc.targetModel,
        assoc.referencesList,
        allModels,
      )
      return `    ${snakeName}: Mapped[${mappedType}] = relationship(${remoteClause}${join})`
    }
    const relation = fieldByName.get(assoc.name)
    const overlaps = relation ? overlapsClause(model.name, relation, allModels) : ''
    return `    ${snakeName}: Mapped[${mappedType}] = relationship(${remoteClause}${fkClause}${overlaps}back_populates="${backPop}")`
  })
}

// The foreign key a has-many or has-one joins on, as the string SQLAlchemy evaluates once every
// class is defined: one column, or the list of a composite key.
function inverseForeignKeys(
  targetModelName: string,
  foreignKeys: readonly string[],
  allModels: readonly DMMF.Model[],
) {
  const targetModel = allModels.find((m) => m.name === targetModelName)
  const columns = foreignKeys.map(
    (fk) => `${className(targetModelName)}.${attributeName(targetModel, fk)}`,
  )
  return columns.length === 1 ? `"${columns.join('')}"` : `"[${columns.join(', ')}]"`
}

function generateHasManyRelationships(
  associations: ReturnType<typeof getAssociations>,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  views: ReadonlySet<string>,
) {
  return associations.hasMany.map((assoc) => {
    const snakeName = attributeName(model, assoc.name)
    if (views.has(model.name) || views.has(assoc.targetModel)) {
      const join = viewJoinArgs(
        assoc.targetModel,
        assoc.foreignKeys,
        model.name,
        assoc.inverse.relationToFields ?? [],
        allModels,
      )
      return `    ${snakeName}: Mapped[list["${className(assoc.targetModel)}"]] = relationship(${join})`
    }
    const backPop = findBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.foreignKey,
      allModels,
      assoc.name,
    )
    const fkClause = needsForeignKeysParam(model.name, assoc.targetModel, allModels)
      ? `foreign_keys=${inverseForeignKeys(assoc.targetModel, assoc.foreignKeys, allModels)}, `
      : ''
    const overlaps = overlapsClause(assoc.targetModel, assoc.inverse, allModels)
    return `    ${snakeName}: Mapped[list["${className(assoc.targetModel)}"]] = relationship(${fkClause}${deleteClause(assoc.onDelete)}${overlaps}back_populates="${backPop}")`
  })
}

function generateHasOneRelationships(
  associations: ReturnType<typeof getAssociations>,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  views: ReadonlySet<string>,
) {
  return associations.hasOne.map((assoc) => {
    const snakeName = attributeName(model, assoc.name)
    if (views.has(model.name) || views.has(assoc.targetModel)) {
      const join = viewJoinArgs(
        assoc.targetModel,
        assoc.foreignKeys,
        model.name,
        assoc.inverse.relationToFields ?? [],
        allModels,
      )
      const one = className(assoc.targetModel)
      const hint = assoc.optional ? `Optional["${one}"]` : `"${one}"`
      return `    ${snakeName}: Mapped[${hint}] = relationship(${join})`
    }
    const backPop = findBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.foreignKey,
      allModels,
      assoc.name,
    )
    const fkClause = needsForeignKeysParam(model.name, assoc.targetModel, allModels)
      ? `foreign_keys=${inverseForeignKeys(assoc.targetModel, assoc.foreignKeys, allModels)}, `
      : ''
    const target = className(assoc.targetModel)
    const mappedType = assoc.optional ? `Optional["${target}"]` : `"${target}"`
    const overlaps = overlapsClause(assoc.targetModel, assoc.inverse, allModels)
    return `    ${snakeName}: Mapped[${mappedType}] = relationship(${fkClause}${deleteClause(assoc.onDelete)}${overlaps}back_populates="${backPop}")`
  })
}

function relationFieldsOf(model: DMMF.Model, relationName: string) {
  return model.fields.filter((f) => f.kind === 'object' && f.relationName === relationName)
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
  const tableByRelation = new Map(m2mTables.map((t) => [t.relationName, t]))
  const pkField = model.fields.find((f) => f.isId)
  return associations.manyToMany.map((assoc) => {
    const snakeName = attributeName(model, assoc.name)
    const backPop = findM2MBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.name,
      assoc.relationName,
      allModels,
    )

    const table = tableByRelation.get(assoc.relationName)
    const secondaryVar = table?.varName ?? associationVarName(assoc.relationName)

    // Both columns of a self join table reference the same table, so the relationship is told
    // which one holds this row. Prisma orders the two fields by name: the one that sorts first
    // lists the B of the rows whose A is this row, the other the A of the rows whose B is.
    const other = relationFieldsOf(model, assoc.relationName).find((f) => f.name !== assoc.name)
    const [own, far] = other && other.name < assoc.name ? ['B', 'A'] : ['A', 'B']
    const pk = `${className(model.name)}.${attributeName(model, pkField?.name ?? 'id')}`
    const joinClause =
      assoc.targetModel === model.name && other
        ? `primaryjoin=lambda: ${pk} == ${secondaryVar}.c.${own}, secondaryjoin=lambda: ${pk} == ${secondaryVar}.c.${far}, `
        : ''

    return `    ${snakeName}: Mapped[list["${className(assoc.targetModel)}"]] = relationship(secondary=${secondaryVar}, ${joinClause}back_populates="${backPop}")`
  })
}

/**
 * The many-to-one relations of `model` the database holds a foreign key for: none of a view's,
 * and none that points at a view.
 */
function realForeignKeys(
  model: DMMF.Model,
  associations: ReturnType<typeof getAssociations>,
  views: ReadonlySet<string>,
) {
  return views.has(model.name)
    ? []
    : associations.belongsTo.filter((assoc) => !views.has(assoc.targetModel))
}

// A Prisma `view` is a database view, whose SQL is written by hand and which Prisma Migrate never
// creates. Its class is mapped as any other and shares the registry of `Base`, so it is queried
// and related by name; its table is in a `MetaData` of its own, so nothing that walks
// `Base.metadata` takes it for a table to create, drop, empty or migrate.
const VIEW_METADATA_LINES = [
  '    # A database view: its own MetaData keeps it out of Base.metadata, so create_all(), drop_all()',
  "    # and Alembic's autogenerate leave it alone. Read it; do not write to it.",
  '    metadata = MetaData()',
]

export function generateModelBody(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  indexes: readonly SqlIndex[],
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
  views: ReadonlySet<string> = new Set(),
) {
  const idField = model.fields.find((f) => f.isId)
  const compositePkFieldNames = new Set(model.primaryKey?.fields)
  const identity = primaryKeyFields(model)

  if (identity.length === 0) return null

  const associations = getAssociations(model, allModels)
  const belongsToFkFields = new Set(
    realForeignKeys(model, associations, views).map((a) => a.foreignKey),
  )

  const enumMap = new Map<string, DMMF.DatamodelEnum>((enums ?? []).map((e) => [e.name, e]))

  const tableName = model.dbName ?? model.name
  const scalarFields = model.fields.filter((f) => f.kind !== 'object')

  const isKeyless = !idField && !model.primaryKey
  const identityNames = new Set(identity)
  const columnLines = scalarFields.flatMap((field) => {
    const isPk = field.isId || compositePkFieldNames.has(field.name)
    const isFk = belongsToFkFields.has(field.name)
    const isMapperKey = isKeyless && identityNames.has(field.name)
    const lines = pythonDocstringLines(stripAnnotations(field.documentation), '    ')
    lines.unshift(
      generateColumn(
        field,
        isPk,
        isFk,
        associations,
        allModels,
        enumMap,
        provider,
        model,
        isMapperKey,
      ),
    )
    return lines
  })

  const tableArgsLines = generateTableArgs(model, allModels, indexes, provider, views)
  // A table with no key is mapped by its first unique: the mapper is told, the table is not.
  const mapperArgsLines = isKeyless
    ? [
        '',
        `    __mapper_args__ = {"primary_key": [${identity.map((name) => attributeName(model, name)).join(', ')}]}`,
      ]
    : []

  // Each generator writes one line per association, in the order the associations are listed.
  const fieldByName = new Map(model.fields.map((f) => [f.name, f]))
  const relationNames = [
    ...associations.belongsTo,
    ...associations.hasMany,
    ...associations.hasOne,
    ...associations.manyToMany,
  ].map((assoc) => assoc.name)
  const relationLines = [
    ...generateBelongsToRelationships(associations, model, allModels, views),
    ...generateHasManyRelationships(associations, model, allModels, views),
    ...generateHasOneRelationships(associations, model, allModels, views),
    ...generateManyToManyRelationships(associations, model, allModels, m2mTables),
  ].flatMap((line, index) => {
    const relationName = relationNames[index]
    const lines = pythonDocstringLines(
      stripAnnotations(fieldByName.get(relationName ?? '')?.documentation),
      '    ',
    )
    lines.unshift(line)
    return lines
  })

  const hasRelations = relationLines.length > 0
  const docstring = pythonDocstringLines(stripAnnotations(model.documentation), '    ')

  return [
    `class ${className(model.name)}(Base):`,
    ...docstring,
    ...(docstring.length > 0 ? [''] : []),
    `    __tablename__ = "${tableName}"`,
    ...(views.has(model.name) ? VIEW_METADATA_LINES : []),
    '',
    ...columnLines,
    ...tableArgsLines,
    ...mapperArgsLines,
    ...(hasRelations ? [''] : []),
    ...relationLines,
  ].join('\n')
}

// The type a column's SQLAlchemy type is imported by: `String(191)` is `String`.
function importedType(saType: string) {
  return saType.replace(/\(.*\)$/u, '')
}

function someField(models: readonly DMMF.Model[], test: (field: DMMF.Field) => boolean) {
  return models.some((m) => m.fields.some(test))
}

// Whether a field's default is SQL text, a server_default: a now(), a literal default (a key's
// included), a dbgenerated().
function hasServerDefaultText(model: DMMF.Model) {
  return model.fields.some(
    (f) =>
      f.default !== undefined &&
      f.default !== null &&
      (!isFunctionDefault(f.default) ||
        f.default.name === 'now' ||
        // defaultArgs writes a dbgenerated() only with its SQL text.
        (f.default.name === 'dbgenerated' && typeof f.default.args[0] === 'string')),
  )
}

function isUuidField(field: DMMF.Field) {
  if (uuidDefaultVersion(field) === 4) return true
  if (!field.nativeType) return false
  const [n] = field.nativeType
  return n === 'Uuid'
}

/** What the module's imports and helpers are needed for. */
function importNeeds(models: readonly DMMF.Model[], provider: string) {
  const utcDateTime = usesUtcDateTime(models)
  const utcTimestamp = provider === 'mysql' && usesNativeType(models, ['Timestamp'])
  const utcType = utcDateTime || (provider !== 'mysql' && usesNativeType(models, ['Timestamptz']))
  const utcNow = someField(models, (f) => isNowDefault(f) || f.isUpdatedAt === true)
  const jsonb = provider === 'sqlite' && someField(models, (f) => f.type === 'Json')
  const xml = usesNativeType(models, ['Xml'])
  // The types create_all declares as Prisma does through a compiler of their own: SQLite's
  // UtcDateTime and Jsonb, and PostgreSQL's Xml.
  const compiles = (utcDateTime && provider === 'sqlite') || jsonb || xml
  return {
    utcDateTime,
    utcTimestamp,
    utcType,
    utcNow,
    // A DateTime is a `datetime` unless it holds a date or a time; `utc_now` returns one.
    datetime:
      utcNow ||
      someField(
        models,
        (f) =>
          f.type === 'DateTime' && !['Date', 'Time', 'Timetz'].includes(f.nativeType?.[0] ?? ''),
      ),
    // The UTC types take and return an Optional.
    optional: utcType || someField(models, (f) => f.kind !== 'object' && !f.isRequired),
    relationship: someField(models, (f) => f.kind === 'object'),
    jsonb,
    xml,
    compiles,
    text: utcTimestamp || models.some(hasServerDefaultText),
    any: compiles || someField(models, (f) => f.type === 'Json'),
    array: someField(models, (f) => f.kind !== 'object' && f.isList),
    decimal: someField(models, (f) => f.type === 'Decimal'),
    uuid: someField(models, isUuidField),
    uuid7: someField(models, (f) => uuidDefaultVersion(f) === 7),
    ulid: someField(models, (f) => isUlidDefault(f)),
    cuid: someField(models, (f) => cuidDefaultVersion(f) === 1),
    cuid2: someField(models, (f) => cuidDefaultVersion(f) === 2),
    nanoid: someField(models, (f) => nanoidDefault(f) !== null),
    date: usesNativeType(models, ['Date']),
    time: usesNativeType(models, ['Time', 'Timetz']),
  }
}

type ImportNeeds = ReturnType<typeof importNeeds>

function fieldSaImports(field: DMMF.Field, provider: string) {
  if (field.kind === 'object') return []
  if (field.kind === 'enum') return provider === 'sqlite' ? [] : ['Enum']
  // A scalar list wraps its element SA type in ARRAY(...), so that element
  // type needs importing too (e.g. ARRAY(String) needs String).
  return field.isList || needsExplicitSaType(field, provider)
    ? [importedType(resolveNativeType(field, provider))]
    : []
}

function modelSaImports(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  indexes: readonly SqlIndex[],
  provider: string,
  views: ReadonlySet<string>,
) {
  const columns = model.fields.flatMap((field) => fieldSaImports(field, provider))
  // A view is written with its columns alone, in a MetaData of its own.
  if (views.has(model.name)) {
    return primaryKeyFields(model).length > 0 ? [...columns, 'MetaData'] : columns
  }
  const foreignKeys = realForeignKeys(model, getAssociations(model, models), views)
  return [
    ...columns,
    ...(foreignKeys.length > 0 ? ['ForeignKey'] : []),
    ...(foreignKeys.some((assoc) => assoc.foreignKeys.length > 1) ? ['ForeignKeyConstraint'] : []),
    ...(keyOrderConstraint(model) === null ? [] : ['PrimaryKeyConstraint']),
    ...(modelIndexes(model, indexes).length > 0 ? ['Index'] : []),
    ...(readsLiteralColumn(model, indexes, provider) ? ['literal_column'] : []),
  ]
}

function joinTableSaImports(
  m2mTables: readonly {
    readonly leftPkField: DMMF.Field | undefined
    readonly rightPkField: DMMF.Field | undefined
  }[],
  provider: string,
) {
  if (m2mTables.length === 0) return []
  const plain = plainType('String', provider)
  return [
    'Column',
    'ForeignKey',
    'Index',
    'Table',
    ...(provider !== 'mysql' && provider !== 'sqlite' ? ['PrimaryKeyConstraint'] : []),
    ...m2mTables.flatMap((info) => [
      importedType(info.leftPkField ? resolveNativeType(info.leftPkField, provider) : plain),
      importedType(info.rightPkField ? resolveNativeType(info.rightPkField, provider) : plain),
    ]),
  ]
}

// What the module's own types and defaults are made of.
function supportSaImports(needs: ImportNeeds, provider: string) {
  return [
    ...(needs.utcType ? ['Dialect', 'TypeDecorator'] : []),
    ...(needs.utcDateTime && provider === 'sqlite' ? ['String'] : []),
    ...(needs.utcTimestamp ? ['BindParameter', 'DateTime', 'ColumnElement', 'func'] : []),
    ...(needs.text ? ['text'] : []),
    ...(needs.array ? ['ARRAY'] : []),
    ...(needs.jsonb ? ['JSON'] : []),
    ...(needs.xml ? ['Text'] : []),
    // The base's key names, on PostgreSQL: MySQL's is PRIMARY and SQLite's has none.
    ...(provider !== 'mysql' && provider !== 'sqlite' ? ['MetaData'] : []),
  ]
}

function utcDialectTypes(needs: ImportNeeds, provider: string) {
  if (provider === 'mysql') {
    return [
      ...(needs.utcDateTime ? ['DATETIME'] : []),
      ...(needs.utcTimestamp ? ['TIMESTAMP'] : []),
    ]
  }
  return provider !== 'sqlite' && needs.utcType ? ['TIMESTAMP'] : []
}

// The dialect's own types, where they carry the precision: the columns' and what the UTC types
// are made on.
function dialectImportLines(saImports: ReadonlySet<string>, needs: ImportNeeds, provider: string) {
  const dialectTypes = [
    ...[...saImports].filter((name) => DIALECT_TYPES.has(name)),
    ...utcDialectTypes(needs, provider),
  ]
  if (dialectTypes.length === 0) return []
  const dialect = provider === 'mysql' ? 'mysql' : 'postgresql'
  return [`from sqlalchemy.dialects.${dialect} import ${dialectTypes.toSorted().join(', ')}`]
}

// The packages from PyPI the ids Prisma Client makes are made with: uuid(7), ulid(), cuid(),
// cuid(2) and nanoid(). cuid ships no types, nor does typeshed have any; nanoid's are typeshed's
// types-nanoid.
function idPackageImportLines(needs: ImportNeeds) {
  return [
    ...(needs.uuid7 ? ['import uuid6'] : []),
    ...(needs.ulid ? ['from ulid import ULID'] : []),
    ...(needs.cuid ? ['import cuid  # type: ignore[import-untyped, unused-ignore]'] : []),
    ...(needs.cuid2 ? ['import cuid2'] : []),
    ...(needs.nanoid ? ['import nanoid'] : []),
  ]
}

function pythonImportLines(needs: ImportNeeds) {
  const typingImports = [needs.any ? 'Any' : null, needs.optional ? 'Optional' : null].filter(
    (i) => i !== null,
  )
  const dtParts = [
    ...(needs.datetime ? ['datetime'] : []),
    ...(needs.date ? ['date'] : []),
    ...(needs.time ? ['time as time_type'] : []),
    ...(needs.utcType || needs.utcNow ? ['timezone'] : []),
  ]
  return [
    ...(typingImports.length > 0 ? [`from typing import ${typingImports.join(', ')}`] : []),
    ...(needs.decimal ? ['from decimal import Decimal as DecimalType'] : []),
    ...(dtParts.length > 0 ? [`from datetime import ${dtParts.join(', ')}`] : []),
    ...(needs.uuid ? ['import uuid as uuid_mod'] : []),
    ...idPackageImportLines(needs),
  ]
}

export function collectGlobalImports(
  models: readonly DMMF.Model[],
  _enums: readonly DMMF.DatamodelEnum[] | undefined,
  indexes: readonly SqlIndex[],
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
  views: ReadonlySet<string> = new Set(),
) {
  const needs = importNeeds(models, provider)
  const saImports = new Set([
    ...models.flatMap((model) => modelSaImports(model, models, indexes, provider, views)),
    ...joinTableSaImports(m2mTables, provider),
    ...supportSaImports(needs, provider),
    ...annotationMapEntries(models, provider).map((entry) =>
      importedType(entry.slice(entry.indexOf(': ') + 2)),
    ),
  ])

  const sortedSa = [...saImports]
    .filter((name) => !MODULE_TYPES.has(name) && !DIALECT_TYPES.has(name))
    .toSorted()
  const ormImports = [
    'DeclarativeBase',
    'Mapped',
    'mapped_column',
    ...(needs.relationship ? ['relationship'] : []),
  ]
  return [
    ...(sortedSa.length > 0 ? [`from sqlalchemy import ${sortedSa.join(', ')}`] : []),
    ...dialectImportLines(saImports, needs, provider),
    ...(needs.compiles ? ['from sqlalchemy.ext.compiler import compiles'] : []),
    `from sqlalchemy.orm import ${ormImports.toSorted().join(', ')}`,
    ...pythonImportLines(needs),
  ]
}

// UtcTimestamp puts TIMESTAMP where this has DATETIME: both are a DateTime to mypy.
function utcDateTimeImpl(provider: string, needsUtcTimestamp: boolean) {
  if (provider !== 'mysql') return 'impl = TIMESTAMP'
  return needsUtcTimestamp ? 'impl: type[DateTime] = DATETIME' : 'impl = DATETIME'
}

function utcDateTimeClass(provider: string, needsUtcTimestamp: boolean) {
  if (provider === 'sqlite') {
    return [
      'class UtcDateTime(TypeDecorator[datetime]):',
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
      '    return "DATETIME"',
      '',
      '',
    ]
  }
  const impl = utcDateTimeImpl(provider, needsUtcTimestamp)
  return [
    'class UtcDateTime(TypeDecorator[datetime]):',
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
  const utcDateTime = needsUtcDateTime ? utcDateTimeClass(provider, needsUtcTimestamp) : []
  const utcDateTimeTz =
    provider !== 'mysql' && usesNativeType(models, ['Timestamptz'])
      ? [
          'class UtcDateTimeTz(TypeDecorator[datetime]):',
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
          '    pass',
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
        '    pass',
        '',
        '',
        '@compiles(Xml)',
        'def xml_ddl(type_: Xml, compiler: Any, **kw: Any) -> str:',
        '    return "XML"',
        '',
        '',
      ]
    : []
  const utcNow = models.some((m) => m.fields.some((f) => isNowDefault(f) || f.isUpdatedAt === true))
    ? [
        // A Prisma DateTime holds milliseconds; a value with microseconds would differ from the
        // row it is written to, and the session would keep an identity the row does not have.
        'def utc_now() -> datetime:',
        '    now = datetime.now(timezone.utc)',
        '    return now.replace(microsecond=now.microsecond // 1000 * 1000)',
        '',
        '',
      ]
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
