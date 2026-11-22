import type { DMMF } from '@prisma/generator-helper'

import { docBlockLines, stripAnnotations } from '../annotation/index.js'
import { tsString } from '../literal/typescript.js'
import { makePascalCase, makeSnakeCase } from '../naming/case.js'
import { implicitJoinTables, isFunctionDefault } from '../prisma/model.js'

const SCALAR_TYPE_MAP: { readonly [k: string]: string } = {
  String: 'string',
  Boolean: 'boolean',
  Int: 'number',
  BigInt: 'bigint',
  Float: 'number',
  Decimal: 'string',
  DateTime: 'Timestamp',
  Json: 'unknown',
  Bytes: 'Buffer',
}

// What an insert or an update may give a BigInt column: pg and mysql2 each send a bigint, a
// number and a string of digits as the same integer.
const BIGINT_INPUT = 'bigint | number | string'

// pg, the driver of Kysely's PostgresDialect, reads an int8 as its text: a number would lose
// what is past 2^53, and pg parses no type into a bigint unless it is asked to
// (`pg.types.setTypeParser(20, BigInt)`). CockroachDB is reached through the same driver.
const POSTGRESQL_SCALAR_TYPE_MAP: { readonly [k: string]: string } = {
  ...SCALAR_TYPE_MAP,
  BigInt: `ColumnType<string, ${BIGINT_INPUT}, ${BIGINT_INPUT}>`,
}

// mysql2, the driver of Kysely's MysqlDialect, reads a BIGINT as a number (rounded past 2^53
// unless the connection sets `supportBigNumbers`) and a Boolean, which is TINYINT(1), as 0 or 1;
// it sends `true` and `false` as the literals MySQL reads as 1 and 0.
const MYSQL_SCALAR_TYPE_MAP: { readonly [k: string]: string } = {
  ...SCALAR_TYPE_MAP,
  Boolean: 'ColumnType<number, boolean | number, boolean | number>',
  BigInt: `ColumnType<number, ${BIGINT_INPUT}, ${BIGINT_INPUT}>`,
}

// better-sqlite3, the driver of Kysely's SqliteDialect, binds numbers, strings, bigints, buffers
// and null (a boolean is refused: "SQLite3 can only bind numbers, strings, bigints, buffers, and
// null"), and reads back what SQLite keeps: a Boolean is 0 or 1, a DateTime the text it was
// given (CURRENT_TIMESTAMP writes `YYYY-MM-DD HH:MM:SS`), a Decimal a REAL, and a BigInt a
// number unless the connection turns on safeIntegers (which makes every INTEGER a bigint). Prisma
// declares a Json column JSONB, which has numeric affinity: a document that is a bare number is
// kept, and read back, as one.
const SQLITE_SCALAR_TYPE_MAP: { readonly [k: string]: string } = {
  ...SCALAR_TYPE_MAP,
  Boolean: 'number',
  BigInt: 'ColumnType<number, number | bigint, number | bigint>',
  Decimal: 'ColumnType<number, number | string, number | string>',
  DateTime: 'string',
  Json: 'ColumnType<string | number, string, string>',
}

const SCALAR_TYPE_MAP_BY_PROVIDER: { readonly [provider: string]: typeof SCALAR_TYPE_MAP } = {
  postgresql: POSTGRESQL_SCALAR_TYPE_MAP,
  cockroachdb: POSTGRESQL_SCALAR_TYPE_MAP,
  mysql: MYSQL_SCALAR_TYPE_MAP,
  sqlite: SQLITE_SCALAR_TYPE_MAP,
}

/**
 * The TypeScript type of each Prisma scalar as the default driver of Kysely's dialect for
 * `provider` reads and binds it. A provider with no map of its own (SQL Server) keeps the plain
 * types.
 *
 * @param provider - The datasource's provider.
 * @returns The type of each scalar, a `ColumnType<Select, Insert, Update>` where the sides differ.
 */
export function scalarTypeMap(provider: string) {
  return SCALAR_TYPE_MAP_BY_PROVIDER[provider] ?? SCALAR_TYPE_MAP
}

// Prisma runs uuid()/cuid()/ulid()/nanoid()/auto() in the client, so migrate
// emits no DDL DEFAULT for them and a raw kysely insert must still supply the
// value. Only database-side defaults may become Generated<T>.
const CLIENT_SIDE_DEFAULTS = new Set(['uuid', 'cuid', 'ulid', 'nanoid', 'auto'])

// Prisma Client writes a DateTime default itself as well, `now()` and a literal alike. On SQLite
// the column's own default is other text for the instant (`CURRENT_TIMESTAMP` writes
// `YYYY-MM-DD HH:MM:SS`, a literal is kept as the migration wrote it, which Prisma reads as an
// Invalid Date), and a DateTime there is compared as text: an insert gives it, as Prisma does.
export function isDbGenerated(field: DMMF.Field, provider = 'postgresql') {
  return (
    field.hasDefaultValue &&
    !(isFunctionDefault(field.default) && CLIENT_SIDE_DEFAULTS.has(field.default.name)) &&
    !(provider === 'sqlite' && field.type === 'DateTime')
  )
}

function makePropertyKey(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) ? name : tsString(name)
}

// pg and mysql2 read a time column as its text (`03:04:05.678`, `03:04:05.678+00` for timetz),
// and PostgreSQL refuses the full timestamp a bound Date is sent as.
const TIME_OF_DAY = new Set(['Time', 'Timetz'])

/** The TypeScript type of the column's value, before list and null wrap it. */
function columnBaseType(field: DMMF.Field, scalarTypes: { readonly [k: string]: string }) {
  if (field.kind === 'enum') return field.type
  if (field.type === 'DateTime' && TIME_OF_DAY.has(field.nativeType?.[0] ?? '')) return 'string'
  return scalarTypes[field.type] ?? 'unknown'
}

// The sides of a `ColumnType<Select, Insert, Update>` of the scalar maps, none of which holds a
// comma of its own.
function columnTypeSides(type: string) {
  const sides = /^ColumnType<([^,]+), ([^,]+), ([^,]+)>$/u.exec(type)
  return sides === null
    ? undefined
    : { select: sides[1] ?? '', insert: sides[2] ?? '', update: sides[3] ?? '' }
}

function listOf(type: string) {
  return /^\w+$/u.test(type) ? `${type}[]` : `(${type})[]`
}

// A list is one ColumnType, not a list of them: a list of `Timestamp`, or of PostgreSQL's BigInt,
// would select as the ColumnType objects. pg reads an array of an enum as its text (`{ADMIN,USER}`):
// the array's type is made with the enum, under an OID pg has no parser for. It binds a JavaScript
// array as that text all the same, which PostgreSQL casts to the column's type.
function listedColumnType(field: DMMF.Field, base: string, provider: string) {
  if (!field.isList) return base
  if (field.kind === 'enum' && (provider === 'postgresql' || provider === 'cockroachdb')) {
    return `ColumnType<string, ${base}[], ${base}[]>`
  }
  if (base === 'Timestamp') return 'ColumnType<Date[], (Date | string)[], (Date | string)[]>'
  const sides = columnTypeSides(base)
  return sides === undefined
    ? `${base}[]`
    : `ColumnType<${listOf(sides.select)}, ${listOf(sides.insert)}, ${listOf(sides.update)}>`
}

// Prisma sets an optional @updatedAt on create as well, so an insert is asked for it.
// `unknown | null` collapses to `unknown`, so the union would be redundant.
function nullableColumnType(field: DMMF.Field, listed: string) {
  if (field.isRequired || listed === 'unknown') return listed
  if (field.isUpdatedAt !== true) return `${listed} | null`
  return listed === 'Timestamp'
    ? 'ColumnType<Date | null, Date | string, Date | string | null>'
    : `ColumnType<${listed} | null, ${listed}, ${listed} | null>`
}

export function makeColumnType(
  field: DMMF.Field,
  scalarTypes: { readonly [k: string]: string },
  provider = 'postgresql',
) {
  const nullable = nullableColumnType(
    field,
    listedColumnType(field, columnBaseType(field, scalarTypes), provider),
  )
  return isDbGenerated(field, provider) ? `Generated<${nullable}>` : nullable
}

export function makeTableInterface(
  model: DMMF.Model,
  scalarTypes: { readonly [k: string]: string },
  provider = 'postgresql',
) {
  const columns = model.fields.flatMap((field) => {
    if (field.kind !== 'scalar' && field.kind !== 'enum') return []
    const lines = docBlockLines(stripAnnotations(field.documentation), '  ')
    lines.push(
      `  ${makePropertyKey(field.dbName ?? field.name)}: ${makeColumnType(field, scalarTypes, provider)}`,
    )
    return lines
  })
  const declaration =
    columns.length > 0
      ? `export interface ${model.name} {\n${columns.join('\n')}\n}`
      : `export interface ${model.name} {}`
  return [...docBlockLines(stripAnnotations(model.documentation), ''), declaration].join('\n')
}

export function makeEnumDeclarations(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
) {
  const usedEnumNames = new Set(
    models.flatMap((m) => m.fields.filter((f) => f.kind === 'enum').map((f) => f.type)),
  )
  return enums
    .filter((e) => usedEnumNames.has(e.name))
    .map((e) =>
      [
        ...docBlockLines(stripAnnotations(e.documentation), ''),
        `export type ${e.name} = ${e.values.map((v) => tsString(v.dbName ?? v.name)).join(' | ')}`,
      ].join('\n'),
    )
}

function pkTsType(
  modelName: string,
  models: readonly DMMF.Model[],
  scalarTypes: { readonly [k: string]: string },
) {
  const pkField = models.find((m) => m.name === modelName)?.fields.find((f) => f.isId)
  return pkField ? (scalarTypes[pkField.type] ?? 'unknown') : 'string'
}

// Prisma's implicit join table: `_<relationName>`, FK columns "A"/"B" typed
// after each side's PK (models in alphabetical order). Without it a Kysely
// query against the m2m storage has no table type at all.
export function collectM2MJoinEntries(
  models: readonly DMMF.Model[],
  scalarTypes: { readonly [k: string]: string },
) {
  return implicitJoinTables(models).map((pair) => ({
    interfaceName: makePascalCase(makeSnakeCase(pair.relationName)),
    tableName: `_${pair.relationName}`,
    aType: pkTsType(pair.left, models, scalarTypes),
    bType: pkTsType(pair.right, models, scalarTypes),
  }))
}

export function makeM2MJoinInterface(entry: {
  readonly interfaceName: string
  readonly aType: string
  readonly bType: string
}) {
  return `export interface ${entry.interfaceName} {\n  A: ${entry.aType}\n  B: ${entry.bType}\n}`
}

export function makeDbInterface(
  models: readonly DMMF.Model[],
  joinEntries: readonly { readonly interfaceName: string; readonly tableName: string }[],
) {
  const lines = [
    ...models.map((m) => `  ${makePropertyKey(m.dbName ?? m.name)}: ${m.name}`),
    ...joinEntries.map((e) => `  ${makePropertyKey(e.tableName)}: ${e.interfaceName}`),
  ]
  return lines.length > 0
    ? `export interface DB {\n${lines.join('\n')}\n}`
    : 'export interface DB {}'
}
