import type { DMMF } from '@prisma/generator-helper'

import { docBlockLines, stripAnnotations } from '../annotation/index.js'
import { tsString } from '../literal/typescript.js'
import { constraintName, indexPrefix, makeSnakeCase } from '../naming/case.js'
import {
  backRelation,
  fieldColumn,
  implicitJoinTables,
  isFunctionDefault,
  isImplicitManyToMany,
  isJoinSideA,
  referentialActions,
} from '../prisma/model.js'

type DbProvider = 'postgresql' | 'mysql' | 'sqlite'

export function resolveDbProvider(provider: 'postgresql' | 'cockroachdb' | 'mysql' | 'sqlite') {
  return provider === 'cockroachdb' ? 'postgresql' : provider
}

// A column with no native type is the one Prisma Migrate makes for the scalar: a Decimal is
// `decimal(65,30)`, and a String on MySQL `varchar(191)`.
const PG_SCALAR_MAP: { [k: string]: string } = {
  String: 'text()',
  Int: 'integer()',
  BigInt: "bigint({ mode: 'bigint' })",
  Float: 'doublePrecision()',
  Decimal: 'numeric({ precision: 65, scale: 30 })',
  Boolean: 'boolean()',
  DateTime: 'timestamp({ precision: 3 })',
  Json: 'jsonb()',
  Bytes: 'bytea()',
}

const MYSQL_SCALAR_MAP: { [k: string]: string } = {
  String: 'varchar({ length: 191 })',
  Int: 'int()',
  BigInt: "bigint({ mode: 'bigint' })",
  Float: 'double()',
  Decimal: 'decimal({ precision: 65, scale: 30 })',
  Boolean: 'boolean()',
  DateTime: 'datetime({ fsp: 3 })',
  Json: 'json()',
  Bytes: "bytes({ type: 'longblob' })",
}

const SQLITE_SCALAR_MAP: { [k: string]: string } = {
  String: 'text()',
  Int: 'integer()',
  BigInt: 'bigInteger()',
  Float: 'real()',
  Decimal: 'numeric()',
  Boolean: "integer({ mode: 'boolean' })",
  DateTime: 'utcDateTime()',
  Json: "text({ mode: 'json' })",
  Bytes: 'blob()',
}

// A native type argument Prisma gives, which an empty one is not.
function isPresent(arg: string | undefined): arg is string {
  return arg !== undefined && arg !== ''
}

function makeDecimalOpts(args: readonly string[]) {
  const opts = [
    isPresent(args[0]) ? `precision: ${args[0]}` : null,
    isPresent(args[1]) ? `scale: ${args[1]}` : null,
  ].filter((o) => o !== null)
  return opts.length > 0 ? `{ ${opts.join(', ')} }` : ''
}

// A column function with one optional size option: `varchar({ length: 255 })`, or `varchar()`.
type SizedColumn = readonly [fn: string, option: string]

function sizedColumn([fn, option]: SizedColumn, arg: string | undefined) {
  return isPresent(arg) ? `${fn}({ ${option}: ${arg} })` : `${fn}()`
}

const PG_NATIVE_FIXED: { [k: string]: string } = {
  Text: 'text()',
  Uuid: 'uuid()',
  SmallInt: 'smallint()',
  Integer: 'integer()',
  BigInt: "bigint({ mode: 'bigint' })",
  Real: 'real()',
  DoublePrecision: 'doublePrecision()',
  Date: 'utcDate()',
  Json: 'json()',
  JsonB: 'jsonb()',
  ByteA: 'bytea()',
}

const PG_NATIVE_SIZED: { [k: string]: SizedColumn } = {
  VarChar: ['varchar', 'length'],
  Char: ['char', 'length'],
  Timestamp: ['timestamp', 'precision'],
  Time: ['utcTime', 'precision'],
  Timetz: ['utcTimetz', 'precision'],
}

function pgNativeType(name: string, args: readonly string[]) {
  if (name === 'Decimal') {
    const opts = makeDecimalOpts(args)
    return opts === '' ? 'numeric()' : `numeric(${opts})`
  }
  if (name === 'Timestamptz') {
    const opts = ['withTimezone: true', isPresent(args[0]) ? `precision: ${args[0]}` : null].filter(
      (o) => o !== null,
    )
    return `timestamp({ ${opts.join(', ')} })`
  }
  const sized = PG_NATIVE_SIZED[name]
  if (sized !== undefined) return sizedColumn(sized, args[0])
  return PG_NATIVE_FIXED[name] ?? null
}

const MYSQL_NATIVE_FIXED: { [k: string]: string } = {
  Text: 'text()',
  LongText: 'longtext()',
  MediumText: 'mediumtext()',
  TinyText: 'tinytext()',
  TinyInt: 'tinyint()',
  SmallInt: 'smallint()',
  MediumInt: 'mediumint()',
  Int: 'int()',
  BigInt: "bigint({ mode: 'bigint' })",
  Float: 'float()',
  Double: 'double()',
  Date: 'utcDate()',
  Json: 'json()',
  TinyBlob: "bytes({ type: 'tinyblob' })",
  Blob: "bytes({ type: 'blob' })",
  MediumBlob: "bytes({ type: 'mediumblob' })",
  LongBlob: "bytes({ type: 'longblob' })",
}

const MYSQL_NATIVE_SIZED: { [k: string]: SizedColumn } = {
  VarChar: ['varchar', 'length'],
  Char: ['char', 'length'],
  Time: ['utcTime', 'precision'],
}

function mysqlNativeType(name: string, args: readonly string[]) {
  switch (name) {
    case 'Decimal': {
      const opts = makeDecimalOpts(args)
      return opts === '' ? 'decimal()' : `decimal(${opts})`
    }
    case 'DateTime':
      return `datetime({ fsp: ${args[0] ?? 0} })`
    case 'Timestamp':
      return `timestamp({ fsp: ${args[0] ?? 0} })`
    // drizzle's binary() and varbinary() read the bytes as text, and it has no blob.
    case 'Binary':
    case 'VarBinary':
      return `bytes({ type: '${name.toLowerCase()}${isPresent(args[0]) ? `(${args[0]})` : ''}' })`
    default: {
      const sized = MYSQL_NATIVE_SIZED[name]
      if (sized !== undefined) return sizedColumn(sized, args[0])
      return MYSQL_NATIVE_FIXED[name] ?? null
    }
  }
}

// Columns drizzle has none of its own for: a DateTime kept in UTC, in the form Prisma Client
// writes and reads it, a Bytes as the Uint8Array Prisma Client gives, and a BigInt on SQLite as
// the integer Prisma keeps it as. drizzle's own `blob({ mode: 'bigint' })` reads the column as
// bytes and writes the digits as a BLOB, which neither reads what Prisma wrote nor writes what
// Prisma reads.
const COLUMN_HELPERS: { readonly [name: string]: string } = {
  bigInteger: `const bigInteger = customType<{ data: bigint; driverData: number | bigint }>({
  dataType: () => 'bigint',
  toDriver: (value) => value,
  fromDriver: (value) => BigInt(value),
})`,
  bytea: `const bytea = customType<{ data: Uint8Array }>({
  dataType: () => 'bytea',
})`,
  bytes: `const bytes = customType<{ data: Uint8Array; config: { type: string } }>({
  dataType: (config) => config?.type ?? 'longblob',
})`,
  utcDateTime: `const utcDateTime = customType<{ data: Date; driverData: string | number }>({
  dataType: () => 'datetime',
  toDriver: (value) => value.toISOString().replace('Z', '+00:00'),
  fromDriver: (value) => {
    if (typeof value === 'number' || /^-?\\d+$/u.test(value)) return new Date(Number(value))
    const iso = value.replace(' ', 'T').replace(/ (?=[+-]\\d\\d:?\\d\\d$)/u, '')
    return new Date(/T[\\d:.]+$/u.test(iso) ? \`\${iso}Z\` : iso)
  },
})`,
  utcDate: `const utcDate = customType<{ data: Date; driverData: string }>({
  dataType: () => 'date',
  toDriver: (value) => value.toISOString().slice(0, 10),
  fromDriver: (value) => new Date(value),
})`,
  utcTime: `const utcTime = customType<{
  data: Date
  driverData: string
  config: { precision?: number }
}>({
  dataType: (config) => \`time\${config?.precision === undefined ? '' : \`(\${config.precision})\`}\`,
  toDriver: (value) => value.toISOString().slice(11, 23),
  fromDriver: (value) => new Date(\`1970-01-01T\${value}Z\`),
})`,
  utcTimetz: `const utcTimetz = customType<{
  data: Date
  driverData: string
  config: { precision?: number }
}>({
  dataType: (config) =>
    \`time\${config?.precision === undefined ? '' : \`(\${config.precision})\`} with time zone\`,
  toDriver: (value) => \`\${value.toISOString().slice(11, 23)}+00\`,
  fromDriver: (value) => new Date(\`1970-01-01T\${value.replace(/[+-]\\d\\d(:?\\d\\d)?$/u, '')}Z\`),
})`,
  utcNow: `const utcNow = (() => {
  let now: Date | undefined
  return () => {
    if (now === undefined) {
      now = new Date()
      queueMicrotask(() => {
        now = undefined
      })
    }
    return now
  }
})()`,
}

type ImportReq = { readonly pkg: string; readonly kind: 'named' | 'default'; readonly name: string }

export function createImports() {
  return {
    core: new Set<string>(),
    // Written `type X` in the core import, so a schema compiled with `verbatimModuleSyntax` holds.
    coreTypes: new Set<string>(),
    orm: new Set<string>(),
    ext: new Map<string, { named: Set<string>; default?: string }>(),
    helpers: new Set<string>(),
  }
}

type DrizzleImports = ReturnType<typeof createImports>

// A column function is drizzle's own, imported from its core module, or one of the helpers,
// declared in the schema itself.
function addColumnImport(baseExpr: string, imports: DrizzleImports) {
  const fnName = baseExpr.match(/^(\w+)/u)?.[1]
  if (fnName === undefined) return
  if (fnName in COLUMN_HELPERS) imports.helpers.add(fnName)
  else imports.core.add(fnName)
}

/**
 * The column helpers the tables use, in a fixed order, to be written after the imports.
 *
 * @param imports - What the tables asked for; `customType` is added to it when a helper is one.
 * @returns The declarations, one per helper.
 */
export function makeColumnHelpers(imports: DrizzleImports) {
  const used = Object.keys(COLUMN_HELPERS).filter((name) => imports.helpers.has(name))
  if (used.some((name) => name !== 'utcNow')) imports.core.add('customType')
  return used.map((name) => COLUMN_HELPERS[name] ?? '')
}

function applyImport(imports: DrizzleImports, req: ImportReq) {
  if (req.pkg === 'drizzle-orm') {
    imports.orm.add(req.name)
    return
  }
  const entry = imports.ext.get(req.pkg) ?? { named: new Set<string>() }
  const next =
    req.kind === 'default'
      ? { named: entry.named, default: req.name }
      : {
          named: entry.named.add(req.name),
          ...(entry.default === undefined ? {} : { default: entry.default }),
        }
  imports.ext.set(req.pkg, next)
}

const CORE_MODULE: { readonly [p in DbProvider]: string } = {
  postgresql: 'drizzle-orm/pg-core',
  mysql: 'drizzle-orm/mysql-core',
  sqlite: 'drizzle-orm/sqlite-core',
}

function byName(a: { readonly name: string }, b: { readonly name: string }) {
  if (a.name < b.name) return -1
  if (a.name > b.name) return 1
  return 0
}

export function generateImports(imports: DrizzleImports, provider: DbProvider) {
  const mod = CORE_MODULE[provider]
  const coreNames = [
    ...[...imports.core].map((name) => ({ name, text: name })),
    ...[...imports.coreTypes].map((name) => ({ name, text: `type ${name}` })),
  ].toSorted(byName)
  const coreImport =
    coreNames.length > 0
      ? `import { ${coreNames.map((entry) => entry.text).join(', ')} } from '${mod}'`
      : ''
  const ormImport =
    imports.orm.size > 0
      ? `import { ${[...imports.orm].toSorted().join(', ')} } from 'drizzle-orm'`
      : ''
  const extImports = [...imports.ext.entries()].map(([pkg, entry]) => {
    const clause = [
      entry.default,
      entry.named.size > 0 ? `{ ${[...entry.named].toSorted().join(', ')} }` : undefined,
    ]
      .filter((c) => c !== undefined)
      .join(', ')
    return `import ${clause} from '${pkg}'`
  })
  return [coreImport, ormImport, ...extImports].filter(Boolean).join('\n')
}

function snakeToCamel(name: string) {
  return name.replaceAll(/_+([a-zA-Z0-9])/gu, (_match: string, char: string) => char.toUpperCase())
}

function resolveTableName(model: DMMF.Model) {
  return model.dbName ?? model.name
}

// The export is the table's name as a camelCase identifier: `users` for
// @@map("users"), `orderLineItem` for a snake_case table, `todo` for "Todo".
function resolveVarName(model: DMMF.Model) {
  const name = snakeToCamel(resolveTableName(model))
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}`
}

function resolveVarNameByType(type: string, models: readonly DMMF.Model[]) {
  const target = models.find((m) => m.name === type)
  return target ? resolveVarName(target) : `${type.charAt(0).toLowerCase()}${type.slice(1)}`
}

function isFieldDefault(v: unknown) {
  return typeof v === 'object' && v !== null && 'name' in v
}

function enumIdentifier(enumName: string) {
  return `${snakeToCamel(makeSnakeCase(enumName))}Enum`
}

export function makeEnumDeclarations(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
  provider: DbProvider,
  imports: DrizzleImports,
) {
  if (provider !== 'postgresql') return []
  const usedEnumNames = new Set(
    models.flatMap((m) => m.fields.filter((f) => f.kind === 'enum').map((f) => f.type)),
  )
  return enums
    .filter((e) => usedEnumNames.has(e.name))
    .map((e) => {
      imports.core.add('pgEnum')
      const values = e.values.map((v) => `'${v.dbName ?? v.name}'`).join(', ')
      return [
        ...docBlockLines(stripAnnotations(e.documentation), ''),
        `export const ${enumIdentifier(e.name)} = pgEnum('${e.dbName ?? e.name}', [${values}])`,
      ].join('\n')
    })
}

const SCALAR_MAP_BY_PROVIDER: { readonly [p in DbProvider]: { readonly [k: string]: string } } = {
  postgresql: PG_SCALAR_MAP,
  mysql: MYSQL_SCALAR_MAP,
  sqlite: SQLITE_SCALAR_MAP,
}

function resolveScalarType(field: DMMF.Field, provider: DbProvider) {
  if (field.nativeType && provider !== 'sqlite') {
    const [nativeName, nativeArgs] = field.nativeType
    const override =
      provider === 'postgresql'
        ? pgNativeType(nativeName, nativeArgs)
        : mysqlNativeType(nativeName, nativeArgs)
    if (override !== null) return override
  }
  return SCALAR_MAP_BY_PROVIDER[provider][field.type] ?? 'text()'
}

function makeColumnExpr(
  field: DMMF.Field,
  provider: DbProvider,
  imports: DrizzleImports,
  enums: readonly DMMF.DatamodelEnum[],
) {
  const colName = field.dbName ?? field.name
  const isAutoincrement = isFieldDefault(field.default) && field.default.name === 'autoincrement'

  if (field.kind === 'enum') {
    const enumDef = enums.find((e) => e.name === field.type)
    const enumValues = enumDef
      ? enumDef.values.map((v) => `'${v.dbName ?? v.name}'`).join(', ')
      : ''
    if (provider === 'postgresql') {
      // References the top-level declaration from makeEnumDeclarations: an
      // inline pgEnum(...) per column is invisible to drizzle-kit, so the
      // migration uses the type without ever emitting CREATE TYPE.
      return `${enumIdentifier(field.type)}('${colName}')`
    }
    if (provider === 'mysql') {
      imports.core.add('mysqlEnum')
      return `mysqlEnum('${colName}', [${enumValues}])`
    }
    imports.core.add('text')
    return `text('${colName}', { enum: [${enumValues}] })`
  }

  if (isAutoincrement && provider === 'postgresql') {
    if (field.type === 'BigInt') {
      imports.core.add('bigserial')
      return `bigserial('${colName}', { mode: 'bigint' })`
    }
    imports.core.add('serial')
    return `serial('${colName}')`
  }

  const baseExpr = resolveScalarType(field, provider)
  addColumnImport(baseExpr, imports)
  const parenIdx = baseExpr.indexOf('(')
  if (parenIdx === -1) return baseExpr
  const baseFnName = baseExpr.slice(0, parenIdx)
  const rest = baseExpr.slice(parenIdx + 1)
  return rest === ')' ? `${baseFnName}('${colName}')` : `${baseFnName}('${colName}', ${rest}`
}

const SQL_IMPORT = { pkg: 'drizzle-orm', kind: 'named', name: 'sql' } as const

type DefaultChain = {
  readonly chain: string
  readonly imports: readonly ImportReq[]
}

const NO_DEFAULT: DefaultChain = { chain: '', imports: [] }

// Prisma Client sends now() itself; the table's default is for the DDL drizzle-kit writes,
// and on SQLite, where drizzle would send that default in place of the function's value,
// there is none: CURRENT_TIMESTAMP writes `2030-01-01 09:00:00`, not Prisma's form.
// Elsewhere it is Prisma's CURRENT_TIMESTAMP, at the column's precision on MySQL, which
// refuses any other; `defaultNow()` is not on a customType column.
function nowDefaultChain(field: DMMF.Field, provider: DbProvider): DefaultChain {
  if (provider === 'sqlite') return { chain: '.$defaultFn(utcNow)', imports: [] }
  const fsp = provider === 'mysql' ? mysqlNowPrecision(field) : '0'
  return {
    chain: `.default(sql\`CURRENT_TIMESTAMP${fsp === '0' ? '' : `(${fsp})`}\`).$defaultFn(utcNow)`,
    imports: [SQL_IMPORT],
  }
}

function mysqlNowPrecision(field: DMMF.Field) {
  return field.nativeType ? (field.nativeType[1][0] ?? '0') : '3'
}

function uuidDefaultChain(version: string | number | undefined): DefaultChain {
  return version === 7
    ? {
        chain: '.$defaultFn(() => uuidv7())',
        imports: [{ pkg: 'uuid', kind: 'named', name: 'v7 as uuidv7' }],
      }
    : { chain: '.$defaultFn(() => crypto.randomUUID())', imports: [] }
}

function cuidDefaultChain(version: string | number | undefined): DefaultChain {
  return version === 2
    ? {
        chain: '.$defaultFn(() => createId())',
        imports: [{ pkg: '@paralleldrive/cuid2', kind: 'named', name: 'createId' }],
      }
    : {
        chain: '.$defaultFn(() => cuid())',
        imports: [{ pkg: 'cuid', kind: 'default', name: 'cuid' }],
      }
}

function functionDefaultChain(
  dflt: { readonly name: string; readonly args: readonly (string | number)[] },
  field: DMMF.Field,
  provider: DbProvider,
): DefaultChain {
  switch (dflt.name) {
    // CockroachDB's counter on an Int, which Prisma makes `GENERATED BY DEFAULT AS IDENTITY`.
    // The DMMF drops sequence()'s arguments, so the identity takes the database's defaults.
    case 'sequence':
      return { chain: '.generatedByDefaultAsIdentity()', imports: [] }
    case 'now':
      return nowDefaultChain(field, provider)
    case 'uuid':
      return uuidDefaultChain(dflt.args[0])
    case 'cuid':
      return cuidDefaultChain(dflt.args[0])
    case 'nanoid':
      return {
        chain: `.$defaultFn(() => nanoid(${typeof dflt.args[0] === 'number' ? dflt.args[0] : ''}))`,
        imports: [{ pkg: 'nanoid', kind: 'named', name: 'nanoid' }],
      }
    case 'ulid':
      return {
        chain: '.$defaultFn(() => ulid())',
        imports: [{ pkg: 'ulidx', kind: 'named', name: 'ulid' }],
      }
    case 'dbgenerated':
      if (typeof dflt.args[0] === 'string') {
        return { chain: `.default(sql\`${dflt.args[0]}\`)`, imports: [SQL_IMPORT] }
      }
      return NO_DEFAULT
    default:
      // autoincrement() is the column's own, and the rest have no drizzle default.
      return NO_DEFAULT
  }
}

// A Bytes default is base64 in the DMMF, and the column's literal in the table.
function bytesLiteral(base64: string, provider: DbProvider) {
  const hex = Buffer.from(base64, 'base64').toString('hex')
  if (provider === 'postgresql') return `decode('${hex}', 'hex')`
  if (provider === 'mysql') return `0x${hex}`
  return `X'${hex}'`
}

// DMMF carries BigInt defaults as digit strings, DateTime literals as ISO
// strings, and Json defaults as JSON text (already a valid TS expression);
// each needs its TypeScript shape, not a bare quoted string. A BigInt
// default must stay out of the schema snapshot as a bigint value:
// drizzle-kit serializes snapshots with JSON.stringify, which throws on
// bigint, so emit it as a raw SQL DDL literal instead of `${dflt}n`.
function stringDefaultChain(dflt: string, fieldType: string, provider: DbProvider): DefaultChain {
  if (fieldType === 'BigInt') return { chain: `.default(sql\`${dflt}\`)`, imports: [SQL_IMPORT] }
  if (fieldType === 'DateTime') {
    // SQLite's column is the `utcDateTime` text, whose default drizzle-kit takes only as SQL:
    // the text the column writes, so the default and the rows compare alike.
    if (provider === 'sqlite') {
      const text = new Date(dflt).toISOString().replace('Z', '+00:00')
      return { chain: `.default(sql\`'${text}'\`)`, imports: [SQL_IMPORT] }
    }
    return { chain: `.default(new Date(${tsString(dflt)}))`, imports: [] }
  }
  if (fieldType === 'Json') return { chain: `.default(${dflt})`, imports: [] }
  if (fieldType === 'Bytes') {
    return { chain: `.default(sql\`${bytesLiteral(dflt, provider)}\`)`, imports: [SQL_IMPORT] }
  }
  return { chain: `.default(${tsString(dflt)})`, imports: [] }
}

function resolveDefaultValue(
  field: DMMF.Field,
  provider: DbProvider,
  enums: readonly DMMF.DatamodelEnum[],
): DefaultChain {
  const dflt = field.default
  const fieldType = field.type
  if (dflt === undefined || dflt === null) return { chain: '', imports: [] }
  // An enum default arrives as the Prisma-level value name; the column stores
  // the @map-ped database value.
  if (field.kind === 'enum' && typeof dflt === 'string') {
    const enumDef = enums.find((e) => e.name === field.type)
    const value = enumDef?.values.find((v) => v.name === dflt)
    return { chain: `.default(${tsString(value?.dbName ?? dflt)})`, imports: [] }
  }
  // A scalar-list default is a JSON-compatible array; emit it as a TS array
  // literal.
  if (Array.isArray(dflt)) {
    const items = dflt.map((item) => (typeof item === 'string' ? tsString(item) : String(item)))
    return { chain: `.default([${items.join(', ')}])`, imports: [] }
  }
  if (isFunctionDefault(dflt)) return functionDefaultChain(dflt, field, provider)
  if (typeof dflt === 'string') return stringDefaultChain(dflt, field.type, provider)
  if (typeof dflt === 'number') {
    const chain = fieldType === 'Decimal' ? `.default('${dflt}')` : `.default(${dflt})`
    return { chain, imports: [] }
  }
  if (typeof dflt === 'boolean') return { chain: `.default(${dflt})`, imports: [] }
  return { chain: '', imports: [] }
}

function makeDefaultChain(
  field: DMMF.Field,
  provider: DbProvider,
  imports: DrizzleImports,
  enums: readonly DMMF.DatamodelEnum[],
) {
  const result = resolveDefaultValue(field, provider, enums)
  for (const req of result.imports) {
    applyImport(imports, req)
  }
  return result.chain
}

const PRISMA_ACTION_MAP: { [k: string]: string } = {
  Cascade: 'cascade',
  SetNull: 'set null',
  Restrict: 'restrict',
  NoAction: 'no action',
  SetDefault: 'set default',
}

function arrayChain(field: DMMF.Field, provider: DbProvider) {
  return field.isList &&
    (field.kind === 'scalar' || field.kind === 'enum') &&
    provider === 'postgresql'
    ? '.array()'
    : ''
}

/**
 * Whether a field is a single primary key SQLite lets hold NULL: any key but an INTEGER (the rowid)
 * does, where Prisma makes it `TEXT NOT NULL PRIMARY KEY`. drizzle-kit drops `.notNull()` from a
 * column declared `.primaryKey()`, so such a key is declared on the table instead, which it writes
 * inline with NOT NULL. A Boolean key is left as it was: it is `integer({ mode: 'boolean' })`, and
 * drizzle-kit leaves NOT NULL off any single key whose SQL type is an integer, so it is a rowid
 * either way.
 */
function isNullableSqliteKey(field: DMMF.Field, model: DMMF.Model, provider: DbProvider) {
  return (
    provider === 'sqlite' &&
    field.isId &&
    field.kind !== 'unsupported' &&
    model.primaryKey === null &&
    field.type !== 'Int' &&
    field.type !== 'Boolean'
  )
}

// A scalar list is a nullable array column in the table Prisma makes. A primary key is NOT NULL by
// itself, but for the SQLite keys isNullableSqliteKey names.
function notNullChain(
  field: DMMF.Field,
  model: DMMF.Model,
  isAutoincrement: boolean,
  provider: DbProvider,
) {
  return field.isRequired &&
    !field.isList &&
    (!field.isId || isNullableSqliteKey(field, model, provider)) &&
    !(isAutoincrement && provider === 'postgresql')
    ? '.notNull()'
    : ''
}

// SQLite counts only an INTEGER key, and Prisma makes a BigInt key BIGINT: none to ask for.
function primaryKeyChain(field: DMMF.Field, isAutoincrement: boolean, provider: DbProvider) {
  return isAutoincrement && provider === 'sqlite' && field.type !== 'BigInt'
    ? '.primaryKey({ autoIncrement: true })'
    : '.primaryKey()'
}

function autoincrementChain(provider: DbProvider) {
  return provider === 'mysql' ? '.autoincrement()' : ''
}

function makeColumn(
  field: DMMF.Field,
  model: DMMF.Model,
  provider: DbProvider,
  imports: DrizzleImports,
  enums: readonly DMMF.DatamodelEnum[],
) {
  if (field.kind === 'object') return null
  if (field.kind === 'unsupported') return `// unsupported type: ${field.name}`

  const isAutoincrement = isFieldDefault(field.default) && field.default.name === 'autoincrement'
  const hasCompositePK = model.primaryKey !== null
  const colExpr = makeColumnExpr(field, provider, imports, enums)
  if (
    field.isUpdatedAt === true ||
    (isFieldDefault(field.default) && field.default.name === 'now')
  ) {
    imports.helpers.add('utcNow')
  }

  const chain = [
    // .array() must wrap the base column before any modifier: chained after
    // .notNull() it produces a nullable array column (string[] | null).
    arrayChain(field, provider),
    field.isId && !hasCompositePK && !isNullableSqliteKey(field, model, provider)
      ? primaryKeyChain(field, isAutoincrement, provider)
      : '',
    notNullChain(field, model, isAutoincrement, provider),
    isAutoincrement
      ? autoincrementChain(provider)
      : makeDefaultChain(field, provider, imports, enums),
    // Prisma Client sets @updatedAt on create and on every update, and the table has no default
    // for it: drizzle calls this on an insert as well, where the column has no other default.
    field.isUpdatedAt === true ? '.$onUpdate(utcNow)' : '',
  ].join('')

  return `${field.name}: ${colExpr}${chain}`
}

// What a table has beside its columns, under the names Prisma Migrate gives them where the schema
// names none: the composite key `<table>_pkey`, every unique a unique index `<table>_<columns>_key`,
// every index `<table>_<columns>_idx`, and every foreign key `<table>_<columns>_fkey` with the
// actions Prisma implies (onUpdate Cascade; onDelete Restrict, or SetNull on an optional relation).
function makeTableConstraints(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  provider: DbProvider,
  imports: DrizzleImports,
  indexes: readonly DMMF.Index[],
  tableName: string,
  views: ReadonlySet<string>,
) {
  const sqliteKey = model.fields.find((field) => isNullableSqliteKey(field, model, provider))
  const keyColumns = sqliteKey ? [sqliteKey.name] : model.primaryKey?.fields
  if (keyColumns) imports.core.add('primaryKey')
  const columns = keyColumns?.map((f) => `table.${f}`).join(', ')
  // MySQL's primary key is always named PRIMARY, and drizzle's `primaryKey` there takes no name; a
  // single SQLite key goes unnamed, so drizzle-kit writes it inline as Prisma does.
  const pkName = provider === 'mysql' || sqliteKey ? '' : `name: '${tableName}_pkey', `
  const pkLine = columns === undefined ? null : `primaryKey({ ${pkName}columns: [${columns}] })`

  // DMMF leaves an `@ignore` field out of the model, but not out of an index that lists it: the
  // table has no column for such an index to name, so it is left out with the field.
  const fieldNames = new Set(model.fields.map((field) => field.name))
  // The columns of this model each relation pointing at it references, as `a,b`.
  const referencedKeys = new Set(
    models.flatMap((m) =>
      m.fields.flatMap((f) =>
        f.type === model.name && f.relationToFields !== undefined
          ? [f.relationToFields.join(',')]
          : [],
      ),
    ),
  )
  const indexLines = indexes
    .filter(
      (idx) =>
        idx.model === model.name &&
        (idx.type === 'unique' || idx.type === 'normal' || idx.type === 'fulltext') &&
        idx.fields.every((f) => fieldNames.has(f.name)),
    )
    .map((idx) => {
      const name =
        idx.dbName ??
        constraintName(
          tableName,
          idx.fields.map((f) => fieldColumn(model, f.name)),
          idx.type === 'unique' ? 'key' : 'idx',
          provider,
        )
      // drizzle-kit adds a table's foreign keys before its indexes, and a foreign key is refused
      // where what it points at is not unique yet: a unique a relation points at is a constraint,
      // made with the table. SQLite makes its foreign keys with the table and asks for neither.
      const referenced =
        provider !== 'sqlite' && referencedKeys.has(idx.fields.map((field) => field.name).join(','))
      const make = indexMaker(idx.type, referenced)
      imports.core.add(make)
      // MySQL takes part of a TEXT in an index; drizzle has the part as SQL.
      const on = idx.fields.map((f) => {
        const prefix = provider === 'mysql' ? indexPrefix(model, f) : undefined
        if (prefix === undefined) return `table.${f.name}`
        imports.orm.add('sql')
        return `sql\`\${table.${f.name}}(${prefix})\``
      })
      return `${make}('${name}').on(${on.join(', ')})`
    })

  // A view cannot be referenced: Prisma Migrate makes no foreign key for a relation to one.
  const foreignKeys = model.fields.filter((f) => isForeignKey(f) && !views.has(f.type))
  const fkLines = foreignKeys.map((f) => {
    imports.core.add('foreignKey')
    // A relation of a model to itself reads its own columns from the table it is given.
    const target = f.type === model.name ? 'table' : resolveVarNameByType(f.type, models)
    const from = f.relationFromFields ?? []
    const name = constraintName(
      tableName,
      from.map((c) => fieldColumn(model, c)),
      'fkey',
      provider,
    )
    const { onDelete, onUpdate } = referentialActions(f)
    return `foreignKey({ name: '${name}', columns: [${from.map((c) => `table.${c}`).join(', ')}], foreignColumns: [${(f.relationToFields ?? []).map((c) => `${target}.${c}`).join(', ')}] }).onDelete('${PRISMA_ACTION_MAP[onDelete] ?? 'no action'}').onUpdate('${PRISMA_ACTION_MAP[onUpdate] ?? 'no action'}')`
  })

  const all = [pkLine, ...indexLines, ...fkLines].filter((l) => l !== null)
  return all.length > 0 ? all.join(', ') : null
}

function indexMaker(type: DMMF.Index['type'], referenced: boolean) {
  if (type !== 'unique') return 'index'
  return referenced ? 'unique' : 'uniqueIndex'
}

function isForeignKey(field: DMMF.Field) {
  return (
    field.kind === 'object' &&
    field.relationFromFields !== undefined &&
    field.relationFromFields.length > 0 &&
    field.relationToFields !== undefined
  )
}

// Whether the model's foreign keys lead, through other tables', back to it. A table's callback that
// names another table makes the table's type wait on that table's, so on such a cycle TypeScript
// cannot infer any of them (TS7022) unless the callback states what it returns.
function isOnForeignKeyCycle(model: DMMF.Model, models: readonly DMMF.Model[]) {
  const targets = (name: string) =>
    models
      .find((m) => m.name === name)
      ?.fields.filter((f) => isForeignKey(f) && f.type !== name)
      .map((f) => f.type) ?? []
  const reaches = (from: readonly string[], seen: ReadonlySet<string>): boolean => {
    if (from.includes(model.name)) return true
    const next = [...new Set(from.flatMap(targets))].filter((name) => !seen.has(name))
    return next.length > 0 && reaches(next, new Set([...seen, ...next]))
  }
  const first = targets(model.name)
  return reaches(first, new Set(first))
}

const TABLE_FUNC: { readonly [p in DbProvider]: string } = {
  postgresql: 'pgTable',
  mysql: 'mysqlTable',
  sqlite: 'sqliteTable',
}

const EXTRA_CONFIG_TYPE: { readonly [p in DbProvider]: string } = {
  postgresql: 'PgTableExtraConfigValue',
  mysql: 'MySqlTableExtraConfigValue',
  sqlite: 'SQLiteTableExtraConfigValue',
}

const VIEW_FUNC: { readonly [p in DbProvider]: string } = {
  postgresql: 'pgView',
  mysql: 'mysqlView',
  sqlite: 'sqliteView',
}

// A view's column is its type and whether it holds NULL, which is all a query reads of it: a view
// has no key, default, index or foreign key of its own.
function makeViewColumn(
  field: DMMF.Field,
  provider: DbProvider,
  imports: DrizzleImports,
  enums: readonly DMMF.DatamodelEnum[],
) {
  if (field.kind === 'object') return null
  if (field.kind === 'unsupported') return `// unsupported type: ${field.name}`
  const { default: _default, ...plain } = field
  const colExpr = makeColumnExpr(plain, provider, imports, enums)
  const notNull = field.isRequired && !field.isList ? '.notNull()' : ''
  return `${field.name}: ${colExpr}${arrayChain(field, provider)}${notNull}`
}

type ColumnEntry = { readonly code: string; readonly doc: string | undefined }

// A JSDoc block needs lines of its own, so a table with one lays its columns out one per line.
function columnMap(entries: readonly ColumnEntry[]) {
  return entries.some((entry) => entry.doc !== undefined)
    ? `{\n${entries.map((entry) => [...docBlockLines(entry.doc, '  '), `  ${entry.code},`].join('\n')).join('\n')}\n}`
    : `{ ${entries.map((entry) => entry.code).join(', ')} }`
}

/**
 * A table, or, for a model named in `views`, the view Prisma reads: `pgView('Name', { ... })
 * .existing()`. Prisma Migrate creates no view (its SQL is written by hand), and drizzle-kit
 * leaves an existing one alone, where a table of that name would be created by drizzle-kit and
 * dropped by Prisma's next diff.
 *
 * @param views - The names of the schema's `view` blocks, which DMMF lists among the models.
 */
export function makeTable(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  provider: DbProvider,
  imports: DrizzleImports,
  enums: readonly DMMF.DatamodelEnum[],
  indexes: readonly DMMF.Index[],
  views: ReadonlySet<string> = new Set(),
) {
  const varName = resolveVarName(model)
  const tableName = resolveTableName(model)
  const modelDoc = docBlockLines(stripAnnotations(model.documentation), '')
  if (views.has(model.name)) {
    const viewFunc = VIEW_FUNC[provider]
    imports.core.add(viewFunc)
    const viewColumns = columnMap(
      model.fields.flatMap((field) => {
        const code = makeViewColumn(field, provider, imports, enums)
        return code === null ? [] : [{ code, doc: stripAnnotations(field.documentation) }]
      }),
    )
    return [
      ...modelDoc,
      `export const ${varName} = ${viewFunc}('${tableName}', ${viewColumns}).existing()`,
    ].join('\n')
  }

  const tableFunc = TABLE_FUNC[provider]
  imports.core.add(tableFunc)

  const columns = columnMap(
    model.fields.flatMap((field) => {
      const code = makeColumn(field, model, provider, imports, enums)
      return code === null ? [] : [{ code, doc: stripAnnotations(field.documentation) }]
    }),
  )
  const constraints = makeTableConstraints(
    model,
    models,
    provider,
    imports,
    indexes,
    tableName,
    views,
  )
  if (constraints === null) {
    return [...modelDoc, `export const ${varName} = ${tableFunc}('${tableName}', ${columns})`].join(
      '\n',
    )
  }

  const configType = isOnForeignKeyCycle(model, models) ? EXTRA_CONFIG_TYPE[provider] : undefined
  if (configType !== undefined) imports.coreTypes.add(configType)
  const params = configType === undefined ? '(table)' : `(table): ${configType}[]`
  return [
    ...modelDoc,
    `export const ${varName} = ${tableFunc}('${tableName}', ${columns}, ${params} => [${constraints}])`,
  ].join('\n')
}

function joinVarName(relationName: string) {
  return snakeToCamel(makeSnakeCase(relationName))
}

function withColumnName(baseExpr: string, colName: string) {
  const parenIdx = baseExpr.indexOf('(')
  const fnName = baseExpr.slice(0, parenIdx)
  const rest = baseExpr.slice(parenIdx + 1)
  return rest === ')' ? `${fnName}('${colName}')` : `${fnName}('${colName}', ${rest}`
}

function pkColumnExpr(
  modelName: string,
  colName: string,
  models: readonly DMMF.Model[],
  provider: DbProvider,
  imports: DrizzleImports,
) {
  const pkField = models.find((m) => m.name === modelName)?.fields.find((f) => f.isId)
  const baseExpr = pkField ? resolveScalarType(pkField, provider) : 'text()'
  addColumnImport(baseExpr, imports)
  return withColumnName(baseExpr, colName)
}

// Prisma's implicit join table: `_<relationName>`, columns "A"/"B" typed after each side's key
// (models in alphabetical order), both foreign keys CASCADE/CASCADE, and an index on B. The pair
// is the key on PostgreSQL, `_<relationName>_AB_pkey`, and a unique index on MySQL and SQLite,
// `_<relationName>_AB_unique`, as Prisma Migrate makes it.
export function makeM2MJoinTables(
  models: readonly DMMF.Model[],
  provider: DbProvider,
  imports: DrizzleImports,
) {
  const tableFunc = TABLE_FUNC[provider]
  return implicitJoinTables(models).map((pair) => {
    imports.core.add(tableFunc)
    imports.core.add('foreignKey')
    imports.core.add('index')
    imports.core.add(provider === 'postgresql' ? 'primaryKey' : 'uniqueIndex')
    const tableName = `_${pair.relationName}`
    const sides = (['A', 'B'] as const).map((column) => {
      const model = column === 'A' ? pair.left : pair.right
      return {
        column,
        model,
        target: resolveVarNameByType(model, models),
        key: keyName(model, models),
      }
    })
    const columns = sides.map(
      (side) =>
        `${side.column}: ${pkColumnExpr(side.model, side.column, models, provider, imports)}.notNull()`,
    )
    const constraints = [
      provider === 'postgresql'
        ? `primaryKey({ name: '${tableName}_AB_pkey', columns: [table.A, table.B] })`
        : `uniqueIndex('${tableName}_AB_unique').on(table.A, table.B)`,
      `index('${tableName}_B_index').on(table.B)`,
      ...sides.map(
        (side) =>
          `foreignKey({ name: '${tableName}_${side.column}_fkey', columns: [table.${side.column}], foreignColumns: [${side.target}.${side.key}] }).onDelete('cascade').onUpdate('cascade')`,
      ),
    ]
    return `export const ${joinVarName(pair.relationName)} = ${tableFunc}('${tableName}', { ${columns.join(', ')} }, (table) => [${constraints.join(', ')}])`
  })
}

function uncapitalizeName(name: string) {
  const camel = snakeToCamel(makeSnakeCase(name))
  return camel.charAt(0).toLowerCase() + camel.slice(1)
}

// `r.posts.authorId` for one column, `[r.stock.country, r.stock.code]` for a composite key.
function columnRefs(tableVar: string, columns: readonly string[]) {
  const refs = columns.map((column) => `r.${tableVar}.${column}`)
  return refs.length > 1 ? `[${refs.join(', ')}]` : refs.join(', ')
}

function keyName(modelName: string, models: readonly DMMF.Model[]) {
  return models.find((m) => m.name === modelName)?.fields.find((f) => f.isId)?.name ?? 'id'
}

// `r.many.posts()` with nothing to say, `r.one.users({ from: ..., to: ... })` otherwise.
function call(options: readonly string[]) {
  return options.length > 0 ? `({ ${options.join(', ')} })` : '()'
}

// The relation's name, where the model has more than one relation to the same table.
function relationAlias(field: DMMF.Field, relFields: readonly DMMF.Field[]) {
  return relFields.filter((f) => f.type === field.type).length > 1 &&
    field.relationName !== undefined &&
    field.relationName !== ''
    ? [`alias: '${field.relationName}'`]
    : []
}

// Both ends of an implicit many-to-many read the join table `through` its columns.
function manyToManyOptions(field: DMMF.Field, model: DMMF.Model, models: readonly DMMF.Model[]) {
  const targetVar = resolveVarNameByType(field.type, models)
  const modelVar = resolveVarName(model)
  const [left, right] =
    model.name < field.type ? [model.name, field.type] : [field.type, model.name]
  const joinVar = joinVarName(field.relationName ?? `${left}To${right}`)
  const inverse = backRelation(field, model, models)
  // A self-relation's end reads the rows that hold its own key: column A for the end on side A.
  const [own, other] = inverse && isJoinSideA(field, model, inverse) ? ['A', 'B'] : ['B', 'A']
  return call([
    `from: r.${modelVar}.${keyName(model.name, models)}.through(r.${joinVar}.${own})`,
    `to: r.${targetVar}.${keyName(field.type, models)}.through(r.${joinVar}.${other})`,
  ])
}

/**
 * One relation. The end that holds the foreign key names its columns and, where Prisma requires
 * the relation, `optional: false`; the other end of a one-to-one names them the other way round,
 * and the list end is `r.many.<table>()`, which drizzle pairs with the `one` through the alias
 * where a model has two relations to one table. An implicit many-to-many reads the join table
 * with `through` from both ends, so neither is inferred.
 */
function makeRelationField(
  field: DMMF.Field,
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  relFields: readonly DMMF.Field[],
) {
  const targetVar = resolveVarNameByType(field.type, models)
  const modelVar = resolveVarName(model)
  const alias = relationAlias(field, relFields)

  if (field.relationFromFields && field.relationFromFields.length > 0) {
    const toFields =
      field.relationToFields && field.relationToFields.length > 0 ? field.relationToFields : ['id']
    return `${field.name}: r.one.${targetVar}${call([
      `from: ${columnRefs(modelVar, field.relationFromFields)}`,
      `to: ${columnRefs(targetVar, toFields)}`,
      ...(field.isRequired ? ['optional: false'] : []),
      ...alias,
    ])}`
  }

  if (field.isList) {
    if (isImplicitManyToMany(field, model, models)) {
      return `${field.name}: r.many.${targetVar}${manyToManyOptions(field, model, models)}`
    }
    return `${field.name}: r.many.${targetVar}${call(alias)}`
  }

  const inverse = backRelation(field, model, models)
  if (inverse?.relationFromFields && inverse.relationFromFields.length > 0) {
    const fromFields =
      inverse.relationToFields && inverse.relationToFields.length > 0
        ? inverse.relationToFields
        : ['id']
    return `${field.name}: r.one.${targetVar}${call([
      `from: ${columnRefs(modelVar, fromFields)}`,
      `to: ${columnRefs(targetVar, inverse.relationFromFields)}`,
      ...alias,
    ])}`
  }
  return `${field.name}: r.one.${targetVar}${call(alias)}`
}

/**
 * The relations as drizzle 1.0 reads them: one `defineRelations` over every table, the
 * join tables of the implicit many-to-many relations included, keyed by the table's variable.
 *
 * @example
 * ```ts
 * export const relations = defineRelations({ user, post }, (r) => ({
 *   user: { posts: r.many.post() },
 *   post: { author: r.one.user({ from: r.post.userId, to: r.user.id, optional: false }) },
 * }))
 * ```
 */
export function makeRelations(models: readonly DMMF.Model[], imports: DrizzleImports) {
  const modelsWithRels = models.filter((model) => model.fields.some((f) => f.kind === 'object'))
  if (modelsWithRels.length === 0) return []

  imports.orm.add('defineRelations')

  const pairs = implicitJoinTables(models)
  const tables = [
    ...models.map((model) => resolveVarName(model)),
    ...pairs.map((pair) => joinVarName(pair.relationName)),
  ]
  const entries = [
    ...modelsWithRels.map((model) => {
      const relFields = model.fields.filter((f) => f.kind === 'object')
      const fieldLines = relFields
        .map((field) => makeRelationField(field, model, models, relFields))
        .join(', ')
      return `${resolveVarName(model)}: { ${fieldLines} }`
    }),
    ...pairs.map((pair) => {
      const joinVar = joinVarName(pair.relationName)
      const isSelf = pair.left === pair.right
      const sides = (['A', 'B'] as const).map((column) => {
        const modelName = column === 'A' ? pair.left : pair.right
        const key = uncapitalizeName(modelName)
        return `${isSelf && column === 'B' ? `${key}_` : key}: r.one.${resolveVarNameByType(modelName, models)}({ from: r.${joinVar}.${column}, to: r.${resolveVarNameByType(modelName, models)}.${keyName(modelName, models)}, optional: false })`
      })
      return `${joinVar}: { ${sides.join(', ')} }`
    }),
  ]
  return [
    `export const relations = defineRelations({ ${tables.join(', ')} }, (r) => ({ ${entries.join(', ')} }))`,
  ]
}
