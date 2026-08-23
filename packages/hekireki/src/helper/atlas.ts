import type { DMMF } from '@prisma/generator-helper'

import { stripAnnotations } from '../utils/index.js'

export type AtlasDialect = 'postgresql' | 'mysql' | 'sqlite'

const REFERENTIAL_ACTION: { [k: string]: string } = {
  Cascade: 'CASCADE',
  Restrict: 'RESTRICT',
  NoAction: 'NO_ACTION',
  SetNull: 'SET_NULL',
  SetDefault: 'SET_DEFAULT',
}

const PG_SCALAR: { [k: string]: string } = {
  String: 'text',
  Boolean: 'boolean',
  Int: 'integer',
  BigInt: 'bigint',
  Float: 'double_precision',
  Decimal: 'decimal(65, 30)',
  DateTime: 'timestamp(3)',
  Json: 'jsonb',
  Bytes: 'bytea',
}

const MYSQL_SCALAR: { [k: string]: string } = {
  String: 'varchar(191)',
  Boolean: 'bool',
  Int: 'int',
  BigInt: 'bigint',
  Float: 'double',
  Decimal: 'decimal(65, 30)',
  DateTime: 'datetime(3)',
  Json: 'json',
  Bytes: 'longblob',
}

const SQLITE_SCALAR: { [k: string]: string } = {
  String: 'text',
  Boolean: 'boolean',
  Int: 'integer',
  BigInt: 'bigint',
  Float: 'real',
  Decimal: 'decimal',
  DateTime: 'datetime',
  Json: 'jsonb',
  Bytes: 'blob',
}

function hclString(value: string) {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('${', () => '$${')
    .replaceAll('%{', () => '%%{')
  return `"${escaped}"`
}

function sqlExpr(expression: string) {
  return `sql(${hclString(expression)})`
}

function refPart(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/u.test(name) ? `.${name}` : `[${hclString(name)}]`
}

function attr(key: string, value: string) {
  return { key, value }
}

// hclfmt aligns the `=` of consecutive attribute lines to the longest key in
// the run; emitting the aligned form keeps the output byte-identical to what
// `atlas schema fmt` would produce.
function alignAttrs(
  attrs: readonly { readonly key: string; readonly value: string }[],
  indent: string,
) {
  const width = Math.max(...attrs.map((a) => a.key.length))
  return attrs.map((a) => `${indent}${a.key.padEnd(width)} = ${a.value}`)
}

function tableNameOf(model: DMMF.Model) {
  return model.dbName ?? model.name
}

function columnDbName(model: DMMF.Model, prismaFieldName: string) {
  const field = model.fields.find((f) => f.name === prismaFieldName)
  return field?.dbName ?? prismaFieldName
}

function schemaOf(model: DMMF.Model, defaultSchema: string) {
  return model.schema ?? defaultSchema
}

function duplicateTableNames(models: readonly DMMF.Model[]) {
  const counts = models.reduce(
    (acc, m) => acc.set(tableNameOf(m), (acc.get(tableNameOf(m)) ?? 0) + 1),
    new Map<string, number>(),
  )
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name))
}

function tableRef(target: DMMF.Model, models: readonly DMMF.Model[], defaultSchema: string) {
  const name = tableNameOf(target)
  return duplicateTableNames(models).has(name)
    ? `table${refPart(schemaOf(target, defaultSchema))}${refPart(name)}`
    : `table${refPart(name)}`
}

function isFunctionDefault(
  def: DMMF.Field['default'],
): def is { readonly name: string; readonly args: readonly (string | number)[] } {
  return def !== null && typeof def === 'object' && !Array.isArray(def) && 'name' in def
}

function pgNativeType(name: string, args: readonly string[]) {
  switch (name) {
    case 'Uuid':
      return 'uuid'
    case 'Char':
      return args[0] ? `char(${args[0]})` : 'char'
    case 'VarChar':
      return args[0] ? `varchar(${args[0]})` : 'varchar'
    case 'Text':
      return 'text'
    case 'SmallInt':
      return 'smallint'
    case 'Integer':
      return 'integer'
    case 'BigInt':
      return 'bigint'
    case 'Oid':
      return 'oid'
    case 'Real':
      return 'real'
    case 'DoublePrecision':
      return 'double_precision'
    case 'Money':
      return 'money'
    case 'Decimal':
      return args.length > 0 ? `decimal(${args.join(', ')})` : 'decimal'
    case 'ByteA':
      return 'bytea'
    case 'JsonB':
      return 'jsonb'
    case 'Json':
      return 'json'
    case 'Date':
      return 'date'
    case 'Time':
      return args[0] ? `time(${args[0]})` : 'time'
    case 'Timestamp':
      return args[0] ? `timestamp(${args[0]})` : 'timestamp'
    case 'Timestamptz':
      return args[0] ? `timestamptz(${args[0]})` : 'timestamptz'
    case 'Inet':
      return 'inet'
    case 'Bit':
      return args[0] ? `bit(${args[0]})` : 'bit'
    case 'VarBit':
      return args[0] ? `bit_varying(${args[0]})` : 'bit_varying'
    case 'Xml':
      return 'xml'
    case 'Boolean':
      return 'boolean'
    default:
      return null
  }
}

function mysqlNativeType(name: string, args: readonly string[]) {
  switch (name) {
    case 'VarChar':
      return { type: args[0] ? `varchar(${args[0]})` : 'varchar(191)', unsigned: false }
    case 'Char':
      return { type: args[0] ? `char(${args[0]})` : 'char', unsigned: false }
    case 'Text':
      return { type: 'text', unsigned: false }
    case 'TinyText':
      return { type: 'tinytext', unsigned: false }
    case 'MediumText':
      return { type: 'mediumtext', unsigned: false }
    case 'LongText':
      return { type: 'longtext', unsigned: false }
    case 'TinyInt':
      return { type: 'tinyint', unsigned: false }
    case 'SmallInt':
      return { type: 'smallint', unsigned: false }
    case 'MediumInt':
      return { type: 'mediumint', unsigned: false }
    case 'Int':
      return { type: 'int', unsigned: false }
    case 'BigInt':
      return { type: 'bigint', unsigned: false }
    case 'UnsignedTinyInt':
      return { type: 'tinyint', unsigned: true }
    case 'UnsignedSmallInt':
      return { type: 'smallint', unsigned: true }
    case 'UnsignedMediumInt':
      return { type: 'mediumint', unsigned: true }
    case 'UnsignedInt':
      return { type: 'int', unsigned: true }
    case 'UnsignedBigInt':
      return { type: 'bigint', unsigned: true }
    case 'Float':
      return { type: 'float', unsigned: false }
    case 'Double':
      return { type: 'double', unsigned: false }
    case 'Decimal':
      return { type: args.length > 0 ? `decimal(${args.join(', ')})` : 'decimal', unsigned: false }
    case 'Bit':
      return { type: args[0] ? `bit(${args[0]})` : 'bit', unsigned: false }
    case 'Date':
      return { type: 'date', unsigned: false }
    case 'Time':
      return { type: args[0] ? `time(${args[0]})` : 'time', unsigned: false }
    case 'DateTime':
      return { type: `datetime(${args[0] ?? 3})`, unsigned: false }
    case 'Timestamp':
      return { type: `timestamp(${args[0] ?? 3})`, unsigned: false }
    case 'Year':
      return { type: 'year', unsigned: false }
    case 'Json':
      return { type: 'json', unsigned: false }
    case 'Binary':
      return { type: args[0] ? `binary(${args[0]})` : 'binary', unsigned: false }
    case 'VarBinary':
      return { type: args[0] ? `varbinary(${args[0]})` : 'varbinary', unsigned: false }
    case 'TinyBlob':
      return { type: 'tinyblob', unsigned: false }
    case 'MediumBlob':
      return { type: 'mediumblob', unsigned: false }
    case 'LongBlob':
      return { type: 'longblob', unsigned: false }
    case 'Blob':
      return { type: 'blob', unsigned: false }
    default:
      return null
  }
}

function scalarType(field: DMMF.Field, dialect: AtlasDialect) {
  if (field.nativeType && dialect !== 'sqlite') {
    const [nativeName, nativeArgs] = field.nativeType
    if (dialect === 'postgresql') {
      const resolved = pgNativeType(nativeName, nativeArgs)
      if (resolved) return { type: resolved, unsigned: false }
    }
    if (dialect === 'mysql') {
      const resolved = mysqlNativeType(nativeName, nativeArgs)
      if (resolved) return resolved
    }
  }
  const map =
    dialect === 'postgresql' ? PG_SCALAR : dialect === 'mysql' ? MYSQL_SCALAR : SQLITE_SCALAR
  return { type: map[field.type] ?? 'text', unsigned: false }
}

function enumDbName(enumName: string, enums: readonly DMMF.DatamodelEnum[]) {
  const enumDef = enums.find((e) => e.name === enumName)
  return enumDef ? (enumDef.dbName ?? enumDef.name) : enumName
}

function enumTypeExpr(
  field: DMMF.Field,
  dialect: AtlasDialect,
  enums: readonly DMMF.DatamodelEnum[],
) {
  if (dialect === 'postgresql') {
    const dbName = enumDbName(field.type, enums)
    return field.isList ? sqlExpr(`"${dbName}"[]`) : `enum${refPart(dbName)}`
  }
  if (dialect === 'mysql') {
    const enumDef = enums.find((e) => e.name === field.type)
    const values = (enumDef?.values ?? []).map((v) => hclString(v.dbName ?? v.name))
    return `enum(${values.join(', ')})`
  }
  return 'text'
}

function serialType(field: DMMF.Field) {
  const nativeName = field.nativeType ? field.nativeType[0] : null
  if (nativeName === 'SmallInt') return 'smallserial'
  if (field.type === 'BigInt' || nativeName === 'BigInt') return 'bigserial'
  return 'serial'
}

// SQL type name for a list element / array cast: Atlas HCL type identifiers
// use `_` where the SQL type name has a space (double_precision, bit_varying).
function sqlTypeName(atlasType: string) {
  return atlasType.replaceAll('_', ' ')
}

function columnTypeInfo(
  field: DMMF.Field,
  dialect: AtlasDialect,
  enums: readonly DMMF.DatamodelEnum[],
  isAutoincrement: boolean,
) {
  if (field.kind === 'enum') {
    return { type: enumTypeExpr(field, dialect, enums), unsigned: false }
  }
  if (isAutoincrement && dialect === 'postgresql') {
    return { type: serialType(field), unsigned: false }
  }
  if (field.isList && dialect === 'postgresql') {
    return { type: sqlExpr(`${sqlTypeName(scalarType(field, dialect).type)}[]`), unsigned: false }
  }
  return scalarType(field, dialect)
}

function sqlStringLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

// Atlas reads a string default that opens and closes with the same quote
// character as an already-quoted SQL literal and drops the pair, so the HCL
// value `"quoted"` would reach the database as `quoted` — a syntax error on a
// json column and a silently wrong value everywhere else. Handing Atlas the
// SQL literal as a raw expression keeps the value verbatim.
function isQuoteWrapped(value: string) {
  const first = value[0]
  return (
    value.length > 1 && (first === '"' || first === "'" || first === '`') && value.at(-1) === first
  )
}

function literalDefault(value: string) {
  return isQuoteWrapped(value) ? sqlExpr(sqlStringLiteral(value)) : hclString(value)
}

function listDefault(
  items: readonly (string | number | boolean)[],
  field: DMMF.Field,
  dialect: AtlasDialect,
  enums: readonly DMMF.DatamodelEnum[],
) {
  const elemType =
    field.kind === 'enum'
      ? `"${enumDbName(field.type, enums)}"`
      : sqlTypeName(scalarType(field, dialect).type)
  const rendered = items.map((item) => {
    if (typeof item !== 'string') return String(item)
    if (field.kind === 'enum') {
      const enumDef = enums.find((e) => e.name === field.type)
      const value = enumDef?.values.find((v) => v.name === item)
      return sqlStringLiteral(value?.dbName ?? item)
    }
    if (field.type === 'BigInt') return item
    return sqlStringLiteral(item)
  })
  return sqlExpr(`ARRAY[${rendered.join(', ')}]::${elemType}[]`)
}

function resolveDefault(
  field: DMMF.Field,
  dialect: AtlasDialect,
  enums: readonly DMMF.DatamodelEnum[],
) {
  const dflt = field.default
  if (!field.hasDefaultValue || dflt === undefined || dflt === null) return undefined
  if (isFunctionDefault(dflt)) {
    if (dflt.name === 'now') {
      return dialect === 'mysql' ? sqlExpr('CURRENT_TIMESTAMP(3)') : sqlExpr('CURRENT_TIMESTAMP')
    }
    if (dflt.name === 'dbgenerated') {
      return typeof dflt.args[0] === 'string' ? sqlExpr(dflt.args[0]) : undefined
    }
    // uuid()/cuid()/ulid()/nanoid()/auto() are client-side defaults: Prisma
    // migrate emits no DDL DEFAULT for them.
    return undefined
  }
  if (Array.isArray(dflt)) return listDefault(dflt, field, dialect, enums)
  if (field.kind === 'enum' && typeof dflt === 'string') {
    const enumDef = enums.find((e) => e.name === field.type)
    const value = enumDef?.values.find((v) => v.name === dflt)
    return literalDefault(value?.dbName ?? dflt)
  }
  if (typeof dflt === 'string') {
    // DMMF carries BigInt defaults as digit strings; the column default is a
    // numeric literal, not a quoted string.
    return field.type === 'BigInt' ? dflt : literalDefault(dflt)
  }
  if (typeof dflt === 'number' || typeof dflt === 'boolean') return String(dflt)
  return undefined
}

export function makeAtlasColumn(
  field: DMMF.Field,
  dialect: AtlasDialect,
  enums: readonly DMMF.DatamodelEnum[],
  comment: boolean,
) {
  const name = field.dbName ?? field.name
  const isAutoincrement = isFunctionDefault(field.default) && field.default.name === 'autoincrement'
  const typeInfo = columnTypeInfo(field, dialect, enums, isAutoincrement)
  const defaultValue = isAutoincrement ? undefined : resolveDefault(field, dialect, enums)
  const doc = comment ? stripAnnotations(field.documentation) : undefined
  const attrs = [
    attr('null', field.isList ? 'true' : String(!field.isRequired)),
    attr('type', typeInfo.type),
    ...(typeInfo.unsigned ? [attr('unsigned', 'true')] : []),
    ...(defaultValue !== undefined ? [attr('default', defaultValue)] : []),
    ...(isAutoincrement && dialect !== 'postgresql' ? [attr('auto_increment', 'true')] : []),
    ...(doc !== undefined ? [attr('comment', hclString(doc))] : []),
  ]
  return [`  column ${hclString(name)} {`, ...alignAttrs(attrs, '    '), '  }'].join('\n')
}

export function makeAtlasPrimaryKey(model: DMMF.Model, indexes: readonly DMMF.Index[]) {
  const pk = indexes.find((idx) => idx.model === model.name && idx.type === 'id')
  if (!pk) return null
  const columns = pk.fields.map((f) => `column${refPart(columnDbName(model, f.name))}`)
  return ['  primary_key {', `    columns = [${columns.join(', ')}]`, '  }'].join('\n')
}

export function makeAtlasForeignKeys(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  defaultSchema: string,
) {
  const table = tableNameOf(model)
  return model.fields
    .filter(
      (field) =>
        field.relationName !== undefined &&
        field.relationFromFields !== undefined &&
        field.relationFromFields.length > 0,
    )
    .flatMap((field) => {
      const target = models.find((m) => m.name === field.type)
      if (!target) return []
      const fromCols = (field.relationFromFields ?? []).map((name) => columnDbName(model, name))
      const toCols = (field.relationToFields ?? []).map((name) => columnDbName(target, name))
      const name = `${table}_${fromCols.join('_')}_fkey`
      const targetRef = tableRef(target, models, defaultSchema)
      // Prisma applies these referential actions when @relation omits them:
      // onUpdate defaults to Cascade, onDelete to Restrict (required relation)
      // or SetNull (optional relation).
      const onUpdate = field.relationOnUpdate ?? 'Cascade'
      const onDelete = field.relationOnDelete ?? (field.isRequired ? 'Restrict' : 'SetNull')
      const attrs = [
        attr('columns', `[${fromCols.map((c) => `column${refPart(c)}`).join(', ')}]`),
        attr(
          'ref_columns',
          `[${toCols.map((c) => `${targetRef}.column${refPart(c)}`).join(', ')}]`,
        ),
        attr('on_update', REFERENTIAL_ACTION[onUpdate] ?? 'NO_ACTION'),
        attr('on_delete', REFERENTIAL_ACTION[onDelete] ?? 'NO_ACTION'),
      ]
      return [
        [`  foreign_key ${hclString(name)} {`, ...alignAttrs(attrs, '    '), '  }'].join('\n'),
      ]
    })
}

export function makeAtlasIndexes(
  model: DMMF.Model,
  indexes: readonly DMMF.Index[],
  dialect: AtlasDialect,
) {
  const table = tableNameOf(model)
  return indexes
    .filter((idx) => idx.model === model.name && idx.type !== 'id')
    .map((idx) => {
      const colsDb = idx.fields.map((f) => columnDbName(model, f.name))
      const suffix = idx.type === 'unique' ? 'key' : 'idx'
      const name = idx.dbName ?? `${table}_${colsDb.join('_')}_${suffix}`
      const hasDesc = idx.fields.some((f) => f.sortOrder === 'desc')
      const body = hasDesc
        ? [
            ...(idx.type === 'unique' ? ['    unique = true'] : []),
            ...idx.fields.map((f) => {
              const ref = `column${refPart(columnDbName(model, f.name))}`
              const attrs =
                f.sortOrder === 'desc'
                  ? [attr('desc', 'true'), attr('column', ref)]
                  : [attr('column', ref)]
              return ['    on {', ...alignAttrs(attrs, '      '), '    }'].join('\n')
            }),
          ]
        : alignAttrs(
            [
              ...(idx.type === 'unique' ? [attr('unique', 'true')] : []),
              attr('columns', `[${colsDb.map((c) => `column${refPart(c)}`).join(', ')}]`),
              ...(idx.type === 'fulltext' && dialect === 'mysql' ? [attr('type', 'FULLTEXT')] : []),
            ],
            '    ',
          )
      return [`  index ${hclString(name)} {`, ...body, '  }'].join('\n')
    })
}

export function makeAtlasTable(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  indexes: readonly DMMF.Index[],
  dialect: AtlasDialect,
  enums: readonly DMMF.DatamodelEnum[],
  options: { readonly schemaName: string; readonly comment: boolean },
) {
  const name = tableNameOf(model)
  const schema = schemaOf(model, options.schemaName)
  const label = duplicateTableNames(models).has(name)
    ? `table ${hclString(schema)} ${hclString(name)}`
    : `table ${hclString(name)}`
  const doc = options.comment ? stripAnnotations(model.documentation) : undefined
  const headAttrs = [
    attr('schema', `schema${refPart(schema)}`),
    ...(doc !== undefined ? [attr('comment', hclString(doc))] : []),
  ]
  const columns = model.fields
    .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
    .map((f) => makeAtlasColumn(f, dialect, enums, options.comment))
  const pk = makeAtlasPrimaryKey(model, indexes)
  return [
    `${label} {`,
    ...alignAttrs(headAttrs, '  '),
    ...columns,
    ...(pk ? [pk] : []),
    ...makeAtlasForeignKeys(model, models, options.schemaName),
    ...makeAtlasIndexes(model, indexes, dialect),
    '}',
  ].join('\n')
}

function isImplicitM2M(field: DMMF.Field, models: readonly DMMF.Model[]) {
  if (field.kind !== 'object' || !field.isList) return false
  if (field.relationFromFields && field.relationFromFields.length > 0) return false
  const target = models.find((m) => m.name === field.type)
  const otherSide = target?.fields.find(
    (f) => f.kind === 'object' && f.relationName === field.relationName,
  )
  return otherSide?.isList === true
}

function collectM2M(models: readonly DMMF.Model[]) {
  const pairs = models.flatMap((model) =>
    model.fields
      .filter((field) => isImplicitM2M(field, models))
      .map((field) => {
        const [leftName, rightName] =
          model.name < field.type ? [model.name, field.type] : [field.type, model.name]
        return {
          leftName,
          rightName,
          relationName: field.relationName ?? `${leftName}To${rightName}`,
        }
      }),
  )
  const seen = new Set<string>()
  return pairs
    .filter((pair) => {
      if (seen.has(pair.relationName)) return false
      seen.add(pair.relationName)
      return true
    })
    .flatMap((pair) => {
      const left = models.find((m) => m.name === pair.leftName)
      const right = models.find((m) => m.name === pair.rightName)
      return left && right ? [{ left, right, relationName: pair.relationName }] : []
    })
}

function m2mColumn(
  side: 'A' | 'B',
  pkField: DMMF.Field | undefined,
  dialect: AtlasDialect,
  enums: readonly DMMF.DatamodelEnum[],
) {
  const type = pkField ? columnTypeInfo(pkField, dialect, enums, false).type : 'text'
  return [
    `  column "${side}" {`,
    ...alignAttrs([attr('null', 'false'), attr('type', type)], '    '),
    '  }',
  ].join('\n')
}

function m2mForeignKey(
  side: 'A' | 'B',
  target: DMMF.Model,
  tableName: string,
  models: readonly DMMF.Model[],
  defaultSchema: string,
) {
  const pkField = target.fields.find((f) => f.isId)
  const refCol = pkField ? (pkField.dbName ?? pkField.name) : 'id'
  const attrs = [
    attr('columns', `[column.${side}]`),
    attr('ref_columns', `[${tableRef(target, models, defaultSchema)}.column${refPart(refCol)}]`),
    attr('on_update', 'CASCADE'),
    attr('on_delete', 'CASCADE'),
  ]
  return [
    `  foreign_key ${hclString(`${tableName}_${side}_fkey`)} {`,
    ...alignAttrs(attrs, '    '),
    '  }',
  ].join('\n')
}

// Prisma's implicit m2m join table: `_<relationName>` with FK columns "A"/"B"
// (sides in model-name alphabetical order), a composite PK on (A, B), an index
// on B, and CASCADE/CASCADE foreign keys to each side's primary key.
export function makeAtlasM2MJoinTables(
  models: readonly DMMF.Model[],
  dialect: AtlasDialect,
  enums: readonly DMMF.DatamodelEnum[],
  defaultSchema: string,
) {
  return collectM2M(models).map((pair) => {
    const tableName = `_${pair.relationName}`
    const leftPk = pair.left.fields.find((f) => f.isId)
    const rightPk = pair.right.fields.find((f) => f.isId)
    return [
      `table ${hclString(tableName)} {`,
      `  schema = schema${refPart(schemaOf(pair.left, defaultSchema))}`,
      m2mColumn('A', leftPk, dialect, enums),
      m2mColumn('B', rightPk, dialect, enums),
      '  primary_key {',
      '    columns = [column.A, column.B]',
      '  }',
      m2mForeignKey('A', pair.left, tableName, models, defaultSchema),
      m2mForeignKey('B', pair.right, tableName, models, defaultSchema),
      `  index ${hclString(`${tableName}_B_index`)} {`,
      '    columns = [column.B]',
      '  }',
      '}',
    ].join('\n')
  })
}

// PostgreSQL enums become top-level enum blocks; MySQL inlines enum(...) in the
// column type and SQLite stores enums as text, so both skip declarations.
// Every declared enum is emitted, used or not: prisma migrate CREATEs unused
// enum types too (prisma/prisma#13382), and dropping them here would make
// `atlas schema diff` against a migrate-managed database emit DROP TYPE.
// DMMF exposes no schema for enums, so they land in the default schema.
export function makeAtlasEnums(
  enums: readonly DMMF.DatamodelEnum[],
  dialect: AtlasDialect,
  defaultSchema: string,
) {
  if (dialect !== 'postgresql') return []
  return enums.map((e) => {
    const attrs = [
      attr('schema', `schema${refPart(defaultSchema)}`),
      attr('values', `[${e.values.map((v) => hclString(v.dbName ?? v.name)).join(', ')}]`),
    ]
    return [`enum ${hclString(e.dbName ?? e.name)} {`, ...alignAttrs(attrs, '  '), '}'].join('\n')
  })
}

export function makeAtlasSchemas(models: readonly DMMF.Model[], defaultSchema: string) {
  const names = [
    defaultSchema,
    ...models.map((m) => m.schema).filter((s): s is string => s !== null),
  ]
  return [...new Set(names)].map((name) => `schema ${hclString(name)} {}`)
}
