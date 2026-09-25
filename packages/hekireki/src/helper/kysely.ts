import type { DMMF } from '@prisma/generator-helper'

import { makePascalCase, makeSnakeCase } from '../utils/index.js'

export const SCALAR_TYPE_MAP: { readonly [k: string]: string } = {
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

// better-sqlite3, the driver of Kysely's SqliteDialect, binds numbers, strings, bigints, buffers
// and null, and reads back what SQLite keeps: a Boolean is 0 or 1, a DateTime the text it was
// given (CURRENT_TIMESTAMP writes `YYYY-MM-DD HH:MM:SS`), a Decimal a REAL, and a BigInt a
// number unless the connection turns on safeIntegers (which makes every INTEGER a bigint). Prisma
// declares a Json column JSONB, which has numeric affinity: a document that is a bare number is
// kept, and read back, as one.
export const SQLITE_SCALAR_TYPE_MAP: { readonly [k: string]: string } = {
  ...SCALAR_TYPE_MAP,
  Boolean: 'number',
  BigInt: 'ColumnType<number, number | bigint, number | bigint>',
  Decimal: 'ColumnType<number, number | string, number | string>',
  DateTime: 'string',
  Json: 'ColumnType<string | number, string, string>',
}

// Prisma runs uuid()/cuid()/ulid()/nanoid()/auto() in the client, so migrate
// emits no DDL DEFAULT for them and a raw kysely insert must still supply the
// value. Only database-side defaults may become Generated<T>.
const CLIENT_SIDE_DEFAULTS = new Set(['uuid', 'cuid', 'ulid', 'nanoid', 'auto'])

function isFunctionDefault(
  def: DMMF.Field['default'],
): def is { readonly name: string; readonly args: readonly (string | number)[] } {
  return def !== null && typeof def === 'object' && !Array.isArray(def) && 'name' in def
}

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

// A database name is any string: an enum value @map-ped to `rock 'n' roll` or a column to
// `last-modified` is quoted and escaped, or the generated file does not parse.
function makeStringLiteral(value: string) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

function makePropertyKey(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) ? name : makeStringLiteral(name)
}

// pg and mysql2 read a time column as its text (`03:04:05.678`, `03:04:05.678+00` for timetz),
// and PostgreSQL refuses the full timestamp a bound Date is sent as.
const TIME_OF_DAY = new Set(['Time', 'Timetz'])

export function makeColumnType(
  field: DMMF.Field,
  scalarTypes: { readonly [k: string]: string },
  provider = 'postgresql',
) {
  const base =
    field.kind === 'enum'
      ? field.type
      : field.type === 'DateTime' && TIME_OF_DAY.has(field.nativeType?.[0] ?? '')
        ? 'string'
        : (scalarTypes[field.type] ?? 'unknown')
  // A list of `Timestamp` would select as the ColumnType objects: the list is one ColumnType.
  const listed = !field.isList
    ? base
    : base === 'Timestamp'
      ? 'ColumnType<Date[], (Date | string)[], (Date | string)[]>'
      : `${base}[]`
  // Prisma sets an optional @updatedAt on create as well, so an insert is asked for it.
  // `unknown | null` collapses to `unknown`, so the union would be redundant.
  const nullable =
    field.isRequired || listed === 'unknown'
      ? listed
      : field.isUpdatedAt && listed === 'Timestamp'
        ? 'ColumnType<Date | null, Date | string, Date | string | null>'
        : field.isUpdatedAt
          ? `ColumnType<${listed} | null, ${listed}, ${listed} | null>`
          : `${listed} | null`
  return isDbGenerated(field, provider) ? `Generated<${nullable}>` : nullable
}

export function makeTableInterface(
  model: DMMF.Model,
  scalarTypes: { readonly [k: string]: string },
  provider = 'postgresql',
) {
  const columns = model.fields
    .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
    .map(
      (field) =>
        `  ${makePropertyKey(field.dbName ?? field.name)}: ${makeColumnType(field, scalarTypes, provider)}`,
    )
  return columns.length > 0
    ? `export interface ${model.name} {\n${columns.join('\n')}\n}`
    : `export interface ${model.name} {}`
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
    .map(
      (e) =>
        `export type ${e.name} = ${e.values.map((v) => makeStringLiteral(v.dbName ?? v.name)).join(' | ')}`,
    )
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
  const pairs = models.flatMap((model) =>
    model.fields
      .filter((field) => isImplicitM2M(field, models))
      .map((field) => {
        const [left, right] =
          model.name < field.type ? [model.name, field.type] : [field.type, model.name]
        return { left, right, relationName: field.relationName ?? `${left}To${right}` }
      }),
  )
  const seen = new Set<string>()
  return pairs
    .filter((pair) => {
      if (seen.has(pair.relationName)) return false
      seen.add(pair.relationName)
      return true
    })
    .map((pair) => ({
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
