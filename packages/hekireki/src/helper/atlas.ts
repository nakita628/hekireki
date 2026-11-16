import type { DMMF } from '@prisma/generator-helper'

import { stripAnnotations } from '../annotation/index.js'
import { indexPrefix } from '../naming/case.js'
import { implicitJoinTables, isFunctionDefault, referentialActions } from '../prisma/model.js'
import { sqlString } from '../prisma/postgres.js'

type AtlasDialect = 'postgresql' | 'mysql' | 'sqlite'

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

function hclCommentLines(text: string | undefined, indent: string) {
  if (text === undefined) return []
  return text.split('\n').map((line) => (line === '' ? `${indent}#` : `${indent}# ${line}`))
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

// A native type with an optional size argument, `varchar(255)`, takes the bare name without one.
function sized(base: string, arg: string | undefined, fallback = base) {
  return arg !== undefined && arg !== '' ? `${base}(${arg})` : fallback
}

const PG_NATIVE_FIXED: { [k: string]: string } = {
  Uuid: 'uuid',
  Text: 'text',
  SmallInt: 'smallint',
  Integer: 'integer',
  BigInt: 'bigint',
  Oid: 'oid',
  Real: 'real',
  DoublePrecision: 'double_precision',
  Money: 'money',
  ByteA: 'bytea',
  JsonB: 'jsonb',
  Json: 'json',
  Date: 'date',
  Inet: 'inet',
  Xml: 'xml',
  Boolean: 'boolean',
}

const PG_NATIVE_SIZED: { [k: string]: string } = {
  Char: 'char',
  VarChar: 'varchar',
  Time: 'time',
  Timestamp: 'timestamp',
  Timestamptz: 'timestamptz',
  Bit: 'bit',
  VarBit: 'bit_varying',
}

function pgNativeType(name: string, args: readonly string[]) {
  if (name === 'Decimal') return args.length > 0 ? `decimal(${args.join(', ')})` : 'decimal'
  const sizedBase = PG_NATIVE_SIZED[name]
  if (sizedBase !== undefined) return sized(sizedBase, args[0])
  return PG_NATIVE_FIXED[name] ?? null
}

const MYSQL_NATIVE_FIXED: { [k: string]: string } = {
  Text: 'text',
  TinyText: 'tinytext',
  MediumText: 'mediumtext',
  LongText: 'longtext',
  TinyInt: 'tinyint',
  SmallInt: 'smallint',
  MediumInt: 'mediumint',
  Int: 'int',
  BigInt: 'bigint',
  Float: 'float',
  Double: 'double',
  Date: 'date',
  Year: 'year',
  Json: 'json',
  TinyBlob: 'tinyblob',
  MediumBlob: 'mediumblob',
  LongBlob: 'longblob',
  Blob: 'blob',
}

const MYSQL_NATIVE_SIZED: { [k: string]: string } = {
  Char: 'char',
  Bit: 'bit',
  Time: 'time',
  Binary: 'binary',
  VarBinary: 'varbinary',
}

const MYSQL_NATIVE_UNSIGNED: { [k: string]: string } = {
  UnsignedTinyInt: 'tinyint',
  UnsignedSmallInt: 'smallint',
  UnsignedMediumInt: 'mediumint',
  UnsignedInt: 'int',
  UnsignedBigInt: 'bigint',
}

function mysqlSignedNativeType(name: string, args: readonly string[]) {
  switch (name) {
    case 'VarChar':
      return sized('varchar', args[0], 'varchar(191)')
    case 'Decimal':
      return args.length > 0 ? `decimal(${args.join(', ')})` : 'decimal'
    case 'DateTime':
      return `datetime(${args[0] ?? 3})`
    case 'Timestamp':
      return `timestamp(${args[0] ?? 3})`
    default: {
      const sizedBase = MYSQL_NATIVE_SIZED[name]
      if (sizedBase !== undefined) return sized(sizedBase, args[0])
      return MYSQL_NATIVE_FIXED[name] ?? null
    }
  }
}

function mysqlNativeType(name: string, args: readonly string[]) {
  const unsigned = MYSQL_NATIVE_UNSIGNED[name]
  if (unsigned !== undefined) return { type: unsigned, unsigned: true }
  const type = mysqlSignedNativeType(name, args)
  return type === null ? null : { type, unsigned: false }
}

const SCALAR_BY_DIALECT: { readonly [d in AtlasDialect]: { readonly [k: string]: string } } = {
  postgresql: PG_SCALAR,
  mysql: MYSQL_SCALAR,
  sqlite: SQLITE_SCALAR,
}

function scalarType(field: DMMF.Field, dialect: AtlasDialect) {
  if (field.nativeType && dialect !== 'sqlite') {
    const [nativeName, nativeArgs] = field.nativeType
    if (dialect === 'postgresql') {
      const resolved = pgNativeType(nativeName, nativeArgs)
      if (resolved !== null) return { type: resolved, unsigned: false }
    }
    if (dialect === 'mysql') {
      const resolved = mysqlNativeType(nativeName, nativeArgs)
      if (resolved !== null) return resolved
    }
  }
  return { type: SCALAR_BY_DIALECT[dialect][field.type] ?? 'text', unsigned: false }
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
  return isQuoteWrapped(value) ? sqlExpr(sqlString(value)) : hclString(value)
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
  const enumValues = new Map(
    (enums.find((e) => e.name === field.type)?.values ?? []).map((v) => [v.name, v]),
  )
  const rendered = items.map((item) => {
    if (typeof item !== 'string') return String(item)
    if (field.kind === 'enum') {
      return sqlString(enumValues.get(item)?.dbName ?? item)
    }
    if (field.type === 'BigInt') return item
    return sqlString(item)
  })
  return sqlExpr(`ARRAY[${rendered.join(', ')}]::${elemType}[]`)
}

function functionDefault(dflt: DMMF.FieldDefault, dialect: AtlasDialect) {
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

function resolveDefault(
  field: DMMF.Field,
  dialect: AtlasDialect,
  enums: readonly DMMF.DatamodelEnum[],
) {
  const dflt = field.default
  if (!field.hasDefaultValue || dflt === undefined || dflt === null) return undefined
  if (isFunctionDefault(dflt)) return functionDefault(dflt, dialect)
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
) {
  const name = field.dbName ?? field.name
  const isAutoincrement = isFunctionDefault(field.default) && field.default.name === 'autoincrement'
  const typeInfo = columnTypeInfo(field, dialect, enums, isAutoincrement)
  const defaultValue = isAutoincrement ? undefined : resolveDefault(field, dialect, enums)
  const attrs = [
    attr('null', field.isList ? 'true' : String(!field.isRequired)),
    attr('type', typeInfo.type),
    ...(typeInfo.unsigned ? [attr('unsigned', 'true')] : []),
    ...(defaultValue !== undefined ? [attr('default', defaultValue)] : []),
    ...(isAutoincrement && dialect !== 'postgresql' ? [attr('auto_increment', 'true')] : []),
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
  const modelByName = new Map(models.map((m) => [m.name, m]))
  return model.fields
    .filter(
      (field) =>
        field.relationName !== undefined &&
        field.relationFromFields !== undefined &&
        field.relationFromFields.length > 0,
    )
    .flatMap((field) => {
      const target = modelByName.get(field.type)
      if (target === undefined) return []
      const fromCols = (field.relationFromFields ?? []).map((name) => columnDbName(model, name))
      const toCols = (field.relationToFields ?? []).map((name) => columnDbName(target, name))
      const name = `${table}_${fromCols.join('_')}_fkey`
      const targetRef = tableRef(target, models, defaultSchema)
      // Prisma applies its own referential actions when @relation omits them.
      const { onDelete, onUpdate } = referentialActions(field)
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
  const fieldNames = new Set(model.fields.map((field) => field.name))
  // DMMF leaves an `@ignore` field out of the model, but not out of an index that lists it: the
  // table has no column for such an index to name, so it is left out with the field.
  return indexes
    .filter(
      (idx) =>
        idx.model === model.name &&
        idx.type !== 'id' &&
        idx.fields.every((f) => fieldNames.has(f.name)),
    )
    .map((idx) => {
      const colsDb = idx.fields.map((f) => columnDbName(model, f.name))
      const suffix = idx.type === 'unique' ? 'key' : 'idx'
      const name = idx.dbName ?? `${table}_${colsDb.join('_')}_${suffix}`
      // A column the index takes part of or backwards is an `on` block of its own.
      const hasParts = idx.fields.some(
        (f) => f.sortOrder === 'desc' || indexPrefix(model, f) !== undefined,
      )
      const indexType =
        idx.type === 'fulltext' && dialect === 'mysql' ? [attr('type', 'FULLTEXT')] : []
      const body = hasParts
        ? [
            ...alignAttrs(
              [...(idx.type === 'unique' ? [attr('unique', 'true')] : []), ...indexType],
              '    ',
            ),
            ...idx.fields.map((f) => {
              const attrs = [
                ...(f.sortOrder === 'desc' ? [attr('desc', 'true')] : []),
                attr('column', `column${refPart(columnDbName(model, f.name))}`),
                ...(indexPrefix(model, f) === undefined
                  ? []
                  : [attr('prefix', String(indexPrefix(model, f)))]),
              ]
              return ['    on {', ...alignAttrs(attrs, '      '), '    }'].join('\n')
            }),
          ]
        : alignAttrs(
            [
              ...(idx.type === 'unique' ? [attr('unique', 'true')] : []),
              attr('columns', `[${colsDb.map((c) => `column${refPart(c)}`).join(', ')}]`),
              ...indexType,
            ],
            '    ',
          )
      return [`  index ${hclString(name)} {`, ...body, '  }'].join('\n')
    })
}

// Prisma Migrate makes every MySQL table `DEFAULT CHARACTER SET utf8mb4 COLLATE
// utf8mb4_unicode_ci`, whatever the database's own is.
const MYSQL_TABLE_ATTRS = [attr('charset', '"utf8mb4"'), attr('collate', '"utf8mb4_unicode_ci"')]

export function makeAtlasTable(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  indexes: readonly DMMF.Index[],
  dialect: AtlasDialect,
  enums: readonly DMMF.DatamodelEnum[],
  options: { readonly schemaName: string },
) {
  const name = tableNameOf(model)
  const schema = schemaOf(model, options.schemaName)
  const label = duplicateTableNames(models).has(name)
    ? `table ${hclString(schema)} ${hclString(name)}`
    : `table ${hclString(name)}`
  const headAttrs = [
    attr('schema', `schema${refPart(schema)}`),
    ...(dialect === 'mysql' ? MYSQL_TABLE_ATTRS : []),
  ]
  const columns = model.fields
    .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
    .map((f) =>
      [
        ...hclCommentLines(stripAnnotations(f.documentation), '  '),
        makeAtlasColumn(f, dialect, enums),
      ].join('\n'),
    )
  const pk = makeAtlasPrimaryKey(model, indexes)
  return [
    ...hclCommentLines(stripAnnotations(model.documentation), ''),
    `${label} {`,
    ...alignAttrs(headAttrs, '  '),
    ...columns,
    ...(pk === null ? [] : [pk]),
    ...makeAtlasForeignKeys(model, models, options.schemaName),
    ...makeAtlasIndexes(model, indexes, dialect),
    '}',
  ].join('\n')
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
// (sides in model-name alphabetical order), an index on B, and CASCADE/CASCADE
// foreign keys to each side's primary key. The pair is the key on PostgreSQL,
// `_<relationName>_AB_pkey`, and a unique index on MySQL and SQLite,
// `_<relationName>_AB_unique`, as Prisma Migrate makes it.
export function makeAtlasM2MJoinTables(
  models: readonly DMMF.Model[],
  dialect: AtlasDialect,
  enums: readonly DMMF.DatamodelEnum[],
  defaultSchema: string,
) {
  const modelByName = new Map(models.map((m) => [m.name, m]))
  return implicitJoinTables(models)
    .flatMap((pair) => {
      const left = modelByName.get(pair.left)
      const right = modelByName.get(pair.right)
      return left && right ? [{ left, right, relationName: pair.relationName }] : []
    })
    .map((pair) => {
      const tableName = `_${pair.relationName}`
      const leftPk = pair.left.fields.find((f) => f.isId)
      const rightPk = pair.right.fields.find((f) => f.isId)
      return [
        `table ${hclString(tableName)} {`,
        ...alignAttrs(
          [
            attr('schema', `schema${refPart(schemaOf(pair.left, defaultSchema))}`),
            ...(dialect === 'mysql' ? MYSQL_TABLE_ATTRS : []),
          ],
          '  ',
        ),
        m2mColumn('A', leftPk, dialect, enums),
        m2mColumn('B', rightPk, dialect, enums),
        ...(dialect === 'postgresql'
          ? [
              `  primary_key ${hclString(`${tableName}_AB_pkey`)} {`,
              '    columns = [column.A, column.B]',
              '  }',
            ]
          : []),
        m2mForeignKey('A', pair.left, tableName, models, defaultSchema),
        m2mForeignKey('B', pair.right, tableName, models, defaultSchema),
        ...(dialect === 'postgresql'
          ? []
          : [
              `  index ${hclString(`${tableName}_AB_unique`)} {`,
              '    unique  = true',
              '    columns = [column.A, column.B]',
              '  }',
            ]),
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
    return [
      ...hclCommentLines(stripAnnotations(e.documentation), ''),
      `enum ${hclString(e.dbName ?? e.name)} {`,
      ...alignAttrs(attrs, '  '),
      '}',
    ].join('\n')
  })
}

export function makeAtlasSchemas(models: readonly DMMF.Model[], defaultSchema: string) {
  const names = [
    defaultSchema,
    ...models.map((m) => m.schema).filter((s): s is string => s !== null),
  ]
  return [...new Set(names)].map((name) => `schema ${hclString(name)} {}`)
}
