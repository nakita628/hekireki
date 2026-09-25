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

// The column type of a DateTime with no native type: the precision Prisma Migrate gives it, on
// the UTC type the module defines (SQLite has no precision to give).
function dateTimeType(provider: string) {
  if (provider === 'sqlite') return 'UtcDateTime'
  return provider === 'mysql' ? 'UtcDateTime(fsp=3)' : 'UtcDateTime(precision=3)'
}

function resolveNativeType(field: DMMF.Field, provider: string) {
  const baseType =
    field.type === 'DateTime' ? dateTimeType(provider) : prismaTypeToSQLAlchemyType(field.type)
  if (!field.nativeType) return baseType

  const [nativeName, nativeArgs] = field.nativeType
  const args = nativeArgs ?? []
  // A bare `@db.Timestamp` or `@db.DateTime` is the database's own precision, as Prisma Migrate
  // writes it: timestamp (6) on PostgreSQL, TIMESTAMP and DATETIME (0) on MySQL.
  const precision = args.length > 0 ? `precision=${args[0]}` : ''
  const fsp = args.length > 0 ? `fsp=${args[0]}` : ''

  switch (nativeName) {
    case 'VarChar':
    case 'Char':
      return args.length > 0 ? `String(${args[0]})` : 'String'
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
      return 'Double'
    case 'Real':
      return 'REAL'
    case 'Decimal':
    case 'Money':
      return args.length >= 2 ? `Numeric(precision=${args[0]}, scale=${args[1]})` : 'Numeric'
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
    case 'Time':
      return 'Time'
    case 'Timetz':
      return 'Time(timezone=True)'
    case 'JsonB':
      return 'JSON'
    case 'Xml':
      return 'String'
    default:
      return baseType
  }
}

// The date-time types the module defines rather than imports from sqlalchemy.
const UTC_TYPES = new Set(['UtcDateTime', 'UtcDateTimeTz', 'UtcTimestamp'])

function needsExplicitSaType(field: DMMF.Field, provider: string) {
  if (field.kind === 'enum') return true
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
  const leftSaType = info.leftPkField ? resolveNativeType(info.leftPkField, provider) : 'String'
  const rightSaType = info.rightPkField ? resolveNativeType(info.rightPkField, provider) : 'String'
  const leftPkCol = info.leftPkField?.dbName ?? info.leftPkField?.name ?? 'id'
  const rightPkCol = info.rightPkField?.dbName ?? info.rightPkField?.name ?? 'id'

  return [
    `${info.varName} = Table(`,
    `    "${info.tableName}",`,
    '    Base.metadata,',
    // Prisma's join table goes with either row: both keys cascade.
    `    Column("A", ${leftSaType}, ForeignKey("${info.leftTable}.${leftPkCol}", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True),`,
    `    Column("B", ${rightSaType}, ForeignKey("${info.rightTable}.${rightPkCol}", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True),`,
    // The index Prisma adds for reading the relation from its B side.
    `    Index("${info.tableName}_B_index", "B"),`,
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

  if (field.kind === 'enum') {
    const enumDef = enumMap.get(field.type)
    // The database stores the @map-ped values under the @@map-ped type name.
    const valuesStr = enumDef ? enumDef.values.map((v) => `"${v.dbName ?? v.name}"`).join(', ') : ''
    const enumName = enumDef?.dbName ?? makeSnakeCase(field.type)
    const enumType = `Enum(${valuesStr}, name="${enumName}")`
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
      colArgs.push(`ForeignKey("${targetTable}.${targetCol}"${fkActions})`)
    }
  }

  if (isPk) colArgs.push('primary_key=True')
  if (isPk && isAutoincrement(field)) colArgs.push('autoincrement=True')
  if (field.isUnique) colArgs.push('unique=True')

  // now() and @updatedAt take the clock of the process, in UTC: the database's NOW() is the
  // session zone's wall time in a timestamp column and drops MySQL's milliseconds. The
  // server_default is for the DDL, where MySQL holds NOW() to the column's precision.
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
      ? `func.now(${fsp})`
      : 'func.now()'

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

function generateTableArgs(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  indexes: readonly DMMF.Index[],
) {
  const uniqueConstraints = model.uniqueFields.map((fields) => {
    const cols = fields.map((f) => {
      const fieldObj = model.fields.find((mf) => mf.name === f)
      return `"${fieldObj?.dbName ?? f}"`
    })
    return `UniqueConstraint(${cols.join(', ')})`
  })

  const indexConstraints = indexes
    .filter((idx) => idx.model === model.name && (idx.type === 'normal' || idx.type === 'fulltext'))
    .map((idx) => {
      // Index names are schema-global in PostgreSQL: the fallback includes the
      // table name so two models indexing the same column don't collide.
      const idxName =
        idx.dbName ??
        idx.name ??
        `${model.dbName ?? model.name}_${idx.fields.map((f) => model.fields.find((mf) => mf.name === f.name)?.dbName ?? f.name).join('_')}_idx`
      const cols = idx.fields.map((f) => {
        const fieldObj = model.fields.find((mf) => mf.name === f.name)
        return `"${fieldObj?.dbName ?? f.name}"`
      })
      return `Index("${idxName}", ${cols.join(', ')})`
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
      const localCols = (f.relationFromFields ?? []).map((c) => {
        const fieldObj = model.fields.find((mf) => mf.name === c)
        return `"${fieldObj?.dbName ?? c}"`
      })
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
      return `ForeignKeyConstraint([${localCols.join(', ')}], [${targetCols.join(', ')}]${actions})`
    })

  const allConstraints = [...uniqueConstraints, ...indexConstraints, ...fkConstraints]
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
    return generateColumn(field, isPk, isFk, associations, allModels, enumMap, provider)
  })

  const tableArgsLines = generateTableArgs(model, allModels, indexes)

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
  const needsDatetime = models.some((m) => m.fields.some((f) => f.type === 'DateTime'))
  // The UTC types take and return an Optional.
  const needsOptional =
    needsDatetime || models.some((m) => m.fields.some((f) => f.kind !== 'object' && !f.isRequired))
  const needsUtcTimestamp = provider === 'mysql' && usesNativeType(models, ['Timestamp'])
  const hasRelationship = models.some((m) => m.fields.some((f) => f.kind === 'object'))
  const needsFunc = needsUtcTimestamp || models.some((m) => m.fields.some(isNowDefault))
  const needsAny = models.some((m) => m.fields.some((f) => f.type === 'Json'))
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
        saImports.add('Enum')
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

    if (model.uniqueFields.length > 0) saImports.add('UniqueConstraint')

    if (model.fields.some((f) => f.kind === 'object' && (f.relationFromFields?.length ?? 0) > 1)) {
      saImports.add('ForeignKeyConstraint')
    }

    if (
      indexes.some(
        (idx) => idx.model === model.name && (idx.type === 'normal' || idx.type === 'fulltext'),
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
    for (const info of m2mTables) {
      const leftType = info.leftPkField ? resolveNativeType(info.leftPkField, provider) : 'String'
      const rightType = info.rightPkField
        ? resolveNativeType(info.rightPkField, provider)
        : 'String'
      saImports.add(leftType.replace(/\(.*\)$/u, ''))
      saImports.add(rightType.replace(/\(.*\)$/u, ''))
    }
  }

  if (needsDatetime) {
    saImports.add('Dialect')
    saImports.add('TypeDecorator')
    if (provider === 'sqlite') saImports.add('String')
  }
  if (needsUtcTimestamp) {
    saImports.add('BindParameter')
    saImports.add('DateTime')
    saImports.add('ColumnElement')
    saImports.add('text')
  }
  if (needsFunc) saImports.add('func')
  if (needsArray) saImports.add('ARRAY')
  if (
    models.some((m) =>
      m.fields.some(
        (f) =>
          f.default !== undefined &&
          f.default !== null &&
          typeof f.default === 'object' &&
          'name' in f.default &&
          f.default.name === 'dbgenerated',
      ),
    )
  ) {
    saImports.add('text')
  }

  const lines: string[] = []

  const sortedSa = [...saImports].filter((name) => !UTC_TYPES.has(name)).toSorted()
  if (sortedSa.length > 0) {
    lines.push(`from sqlalchemy import ${sortedSa.join(', ')}`)
  }
  // What the UTC types are made on, where the dialect's own type carries the precision.
  if (needsDatetime && provider === 'mysql') {
    lines.push(
      `from sqlalchemy.dialects.mysql import ${needsUtcTimestamp ? 'DATETIME, TIMESTAMP' : 'DATETIME'}`,
    )
  } else if (needsDatetime && provider !== 'sqlite') {
    lines.push('from sqlalchemy.dialects.postgresql import TIMESTAMP')
  }

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
  if (needsDatetime) dtParts.push('timezone')
  if (dtParts.length > 0) lines.push(`from datetime import ${dtParts.join(', ')}`)
  if (needsUuid) lines.push('import uuid as uuid_mod')
  if (needsUuid7) lines.push('import uuid6')
  if (needsUlid) lines.push('from ulid import ULID')

  return lines
}

/**
 * The declarative base, after the types a DateTime is read through: every instant is UTC, aware
 * in Python, as Prisma Client writes and reads it. SQLite keeps it as Prisma's text
 * (`2030-01-02T03:04:05.678+00:00`), a timestamp without time zone holds UTC whatever the
 * session's zone, and `utc_now` is the process's clock for `now()` and `@updatedAt`.
 */
export function generateBase(models: readonly DMMF.Model[], provider: string) {
  if (!models.some((m) => m.fields.some((f) => f.type === 'DateTime'))) {
    return ['class Base(DeclarativeBase):', '    pass']
  }
  const needsUtcTimestamp = provider === 'mysql' && usesNativeType(models, ['Timestamp'])
  // UtcTimestamp puts TIMESTAMP where this has DATETIME: both are a DateTime to mypy.
  const impl =
    provider !== 'mysql'
      ? 'impl = TIMESTAMP'
      : needsUtcTimestamp
        ? 'impl: type[DateTime] = DATETIME'
        : 'impl = DATETIME'
  const utcDateTime =
    provider === 'sqlite'
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
  const utcNow = models.some((m) => m.fields.some((f) => isNowDefault(f) || f.isUpdatedAt))
    ? ['def utc_now() -> datetime:', '    return datetime.now(timezone.utc)', '', '']
    : []
  return [
    ...utcDateTime,
    ...utcDateTimeTz,
    ...utcTimestamp,
    ...utcNow,
    'class Base(DeclarativeBase):',
    `    type_annotation_map = {datetime: ${dateTimeType(provider)}}`,
  ]
}
