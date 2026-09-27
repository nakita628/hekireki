import type { DMMF } from '@prisma/generator-helper'

import { constraintName, indexPrefix, makeSnakeCase } from '../utils/index.js'

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
  BigInt: "blob({ mode: 'bigint' })",
  Float: 'real()',
  Decimal: 'numeric()',
  Boolean: "integer({ mode: 'boolean' })",
  DateTime: 'utcDateTime()',
  Json: "text({ mode: 'json' })",
  Bytes: 'blob()',
}

function makeDecimalOpts(args: readonly string[]) {
  const opts = [
    args[0] ? `precision: ${args[0]}` : null,
    args[1] ? `scale: ${args[1]}` : null,
  ].filter((o) => o !== null)
  return opts.length > 0 ? `{ ${opts.join(', ')} }` : ''
}

function pgNativeType(name: string, args: readonly string[]) {
  switch (name) {
    case 'VarChar':
      return args[0] ? `varchar({ length: ${args[0]} })` : 'varchar()'
    case 'Char':
      return args[0] ? `char({ length: ${args[0]} })` : 'char()'
    case 'Text':
      return 'text()'
    case 'Uuid':
      return 'uuid()'
    case 'SmallInt':
      return 'smallint()'
    case 'Integer':
      return 'integer()'
    case 'BigInt':
      return "bigint({ mode: 'bigint' })"
    case 'Real':
      return 'real()'
    case 'DoublePrecision':
      return 'doublePrecision()'
    case 'Decimal': {
      const opts = makeDecimalOpts(args)
      return opts ? `numeric(${opts})` : 'numeric()'
    }
    case 'Timestamp':
      return args[0] ? `timestamp({ precision: ${args[0]} })` : 'timestamp()'
    case 'Timestamptz': {
      const opts = ['withTimezone: true', args[0] ? `precision: ${args[0]}` : null].filter(
        (o) => o !== null,
      )
      return `timestamp({ ${opts.join(', ')} })`
    }
    case 'Date':
      return 'utcDate()'
    case 'Time':
      return args[0] ? `utcTime({ precision: ${args[0]} })` : 'utcTime()'
    case 'Timetz':
      return args[0] ? `utcTimetz({ precision: ${args[0]} })` : 'utcTimetz()'
    case 'Json':
      return 'json()'
    case 'JsonB':
      return 'jsonb()'
    case 'ByteA':
      return 'bytea()'
    default:
      return null
  }
}

function mysqlNativeType(name: string, args: readonly string[]) {
  switch (name) {
    case 'VarChar':
      return args[0] ? `varchar({ length: ${args[0]} })` : 'varchar()'
    case 'Char':
      return args[0] ? `char({ length: ${args[0]} })` : 'char()'
    case 'Text':
      return 'text()'
    case 'LongText':
      return 'longtext()'
    case 'MediumText':
      return 'mediumtext()'
    case 'TinyText':
      return 'tinytext()'
    case 'TinyInt':
      return 'tinyint()'
    case 'SmallInt':
      return 'smallint()'
    case 'MediumInt':
      return 'mediumint()'
    case 'Int':
      return 'int()'
    case 'BigInt':
      return "bigint({ mode: 'bigint' })"
    case 'Float':
      return 'float()'
    case 'Double':
      return 'double()'
    case 'Decimal': {
      const opts = makeDecimalOpts(args)
      return opts ? `decimal(${opts})` : 'decimal()'
    }
    case 'Date':
      return 'utcDate()'
    case 'Time':
      return args[0] ? `utcTime({ precision: ${args[0]} })` : 'utcTime()'
    case 'DateTime':
      return `datetime({ fsp: ${args[0] ?? 0} })`
    case 'Timestamp':
      return `timestamp({ fsp: ${args[0] ?? 0} })`
    case 'Json':
      return 'json()'
    // drizzle's binary() and varbinary() read the bytes as text, and it has no blob.
    case 'Binary':
    case 'VarBinary':
      return `bytes({ type: '${name.toLowerCase()}${args[0] ? `(${args[0]})` : ''}' })`
    case 'TinyBlob':
    case 'Blob':
    case 'MediumBlob':
    case 'LongBlob':
      return `bytes({ type: '${name.toLowerCase()}' })`
    default:
      return null
  }
}

// Columns drizzle has none of its own for: a DateTime kept in UTC, in the form Prisma Client
// writes and reads it, and a Bytes as the Uint8Array Prisma Client gives.
const COLUMN_HELPERS: { readonly [name: string]: string } = {
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
      : { named: entry.named.add(req.name), default: entry.default }
  imports.ext.set(req.pkg, next)
}

export function generateImports(imports: DrizzleImports, provider: DbProvider) {
  const mod =
    provider === 'postgresql'
      ? 'drizzle-orm/pg-core'
      : provider === 'mysql'
        ? 'drizzle-orm/mysql-core'
        : 'drizzle-orm/sqlite-core'
  const coreImport =
    imports.core.size > 0
      ? `import { ${[...imports.core].toSorted().join(', ')} } from '${mod}'`
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
      return `export const ${enumIdentifier(e.name)} = pgEnum('${e.dbName ?? e.name}', [${values}])`
    })
}

function resolveScalarType(field: DMMF.Field, provider: DbProvider) {
  if (field.nativeType && provider !== 'sqlite') {
    const [nativeName, nativeArgs] = field.nativeType
    const override =
      provider === 'postgresql'
        ? pgNativeType(nativeName, nativeArgs)
        : mysqlNativeType(nativeName, nativeArgs)
    if (override) return override
  }
  const scalarMap =
    provider === 'postgresql'
      ? PG_SCALAR_MAP
      : provider === 'mysql'
        ? MYSQL_SCALAR_MAP
        : SQLITE_SCALAR_MAP
  return scalarMap[field.type] ?? 'text()'
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

function toTsString(value: string) {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
  return `'${escaped}'`
}

function resolveDefaultValue(
  field: DMMF.Field,
  provider: DbProvider,
  enums: readonly DMMF.DatamodelEnum[],
) {
  const dflt = field.default
  const fieldType = field.type
  if (dflt === undefined || dflt === null) return { chain: '', imports: [] }
  // An enum default arrives as the Prisma-level value name; the column stores
  // the @map-ped database value.
  if (field.kind === 'enum' && typeof dflt === 'string') {
    const enumDef = enums.find((e) => e.name === field.type)
    const value = enumDef?.values.find((v) => v.name === dflt)
    return { chain: `.default(${toTsString(value?.dbName ?? dflt)})`, imports: [] }
  }
  // A scalar-list default is a JSON-compatible array; emit it as a TS array
  // literal.
  if (Array.isArray(dflt)) {
    const items = dflt.map((item) => (typeof item === 'string' ? toTsString(item) : String(item)))
    return { chain: `.default([${items.join(', ')}])`, imports: [] }
  }
  if (isFieldDefault(dflt)) {
    switch (dflt.name) {
      case 'autoincrement':
        return { chain: '', imports: [] }
      // CockroachDB's counter on an Int, which Prisma makes `GENERATED BY DEFAULT AS IDENTITY`.
      // The DMMF drops sequence()'s arguments, so the identity takes the database's defaults.
      case 'sequence':
        return { chain: '.generatedByDefaultAsIdentity()', imports: [] }
      // Prisma Client sends now() itself; the table's default is for the DDL drizzle-kit writes,
      // and on SQLite, where drizzle would send that default in place of the function's value,
      // there is none: CURRENT_TIMESTAMP writes `2030-01-01 09:00:00`, not Prisma's form.
      // Elsewhere it is Prisma's CURRENT_TIMESTAMP, at the column's precision on MySQL, which
      // refuses any other; `defaultNow()` is not on a customType column.
      case 'now': {
        if (provider === 'sqlite') return { chain: '.$defaultFn(utcNow)', imports: [] }
        const fsp =
          provider === 'mysql' ? (field.nativeType ? (field.nativeType[1][0] ?? '0') : '3') : '0'
        return {
          chain: `.default(sql\`CURRENT_TIMESTAMP${fsp === '0' ? '' : `(${fsp})`}\`).$defaultFn(utcNow)`,
          imports: [SQL_IMPORT],
        }
      }
      case 'uuid':
        return dflt.args[0] === 7
          ? {
              chain: '.$defaultFn(() => uuidv7())',
              imports: [{ pkg: 'uuid', kind: 'named', name: 'v7 as uuidv7' } as const],
            }
          : { chain: '.$defaultFn(() => crypto.randomUUID())', imports: [] }
      case 'cuid':
        return dflt.args[0] === 2
          ? {
              chain: '.$defaultFn(() => createId())',
              imports: [{ pkg: '@paralleldrive/cuid2', kind: 'named', name: 'createId' } as const],
            }
          : {
              chain: '.$defaultFn(() => cuid())',
              imports: [{ pkg: 'cuid', kind: 'default', name: 'cuid' } as const],
            }
      case 'nanoid':
        return {
          chain: `.$defaultFn(() => nanoid(${typeof dflt.args[0] === 'number' ? dflt.args[0] : ''}))`,
          imports: [{ pkg: 'nanoid', kind: 'named', name: 'nanoid' } as const],
        }
      case 'ulid':
        return {
          chain: '.$defaultFn(() => ulid())',
          imports: [{ pkg: 'ulidx', kind: 'named', name: 'ulid' } as const],
        }
      case 'dbgenerated':
        if (typeof dflt.args[0] === 'string') {
          return { chain: `.default(sql\`${dflt.args[0]}\`)`, imports: [SQL_IMPORT] }
        }
        return { chain: '', imports: [] }
      default:
        return { chain: '', imports: [] }
    }
  }
  if (typeof dflt === 'string') {
    // DMMF carries BigInt defaults as digit strings, DateTime literals as ISO
    // strings, and Json defaults as JSON text (already a valid TS expression);
    // each needs its TypeScript shape, not a bare quoted string. A BigInt
    // default must stay out of the schema snapshot as a bigint value:
    // drizzle-kit serializes snapshots with JSON.stringify, which throws on
    // bigint, so emit it as a raw SQL DDL literal instead of `${dflt}n`.
    if (fieldType === 'BigInt') return { chain: `.default(sql\`${dflt}\`)`, imports: [SQL_IMPORT] }
    if (fieldType === 'DateTime') {
      return { chain: `.default(new Date(${toTsString(dflt)}))`, imports: [] }
    }
    if (fieldType === 'Json') return { chain: `.default(${dflt})`, imports: [] }
    // A Bytes default is base64 in the DMMF, and the column's literal in the table.
    if (fieldType === 'Bytes') {
      const hex = Buffer.from(dflt, 'base64').toString('hex')
      const literal =
        provider === 'postgresql'
          ? `decode('${hex}', 'hex')`
          : provider === 'mysql'
            ? `0x${hex}`
            : `X'${hex}'`
      return { chain: `.default(sql\`${literal}\`)`, imports: [SQL_IMPORT] }
    }
    return { chain: `.default(${toTsString(dflt)})`, imports: [] }
  }
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

function makeColumn(
  field: DMMF.Field,
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  provider: DbProvider,
  imports: DrizzleImports,
  enums: readonly DMMF.DatamodelEnum[],
) {
  if (field.kind === 'object') return null
  if (field.kind === 'unsupported') return `// unsupported type: ${field.name}`

  const isAutoincrement = isFieldDefault(field.default) && field.default.name === 'autoincrement'
  const hasCompositePK = model.primaryKey !== null
  const colExpr = makeColumnExpr(field, provider, imports, enums)
  if (field.isUpdatedAt || (isFieldDefault(field.default) && field.default.name === 'now')) {
    imports.helpers.add('utcNow')
  }

  const chain = [
    // .array() must wrap the base column before any modifier: chained after
    // .notNull() it produces a nullable array column (string[] | null).
    field.isList && (field.kind === 'scalar' || field.kind === 'enum') && provider === 'postgresql'
      ? '.array()'
      : '',
    field.isId && !hasCompositePK
      ? isAutoincrement && provider === 'sqlite'
        ? '.primaryKey({ autoIncrement: true })'
        : '.primaryKey()'
      : '',
    // A scalar list is a nullable array column in the table Prisma makes.
    field.isRequired &&
    !field.isList &&
    !field.isId &&
    !(isAutoincrement && provider === 'postgresql')
      ? '.notNull()'
      : '',
    isAutoincrement
      ? provider === 'mysql'
        ? '.autoincrement()'
        : ''
      : makeDefaultChain(field, provider, imports, enums),
    // Prisma Client sets @updatedAt on create and on every update, and the table has no default
    // for it: drizzle calls this on an insert as well, where the column has no other default.
    field.isUpdatedAt ? '.$onUpdate(utcNow)' : '',
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
) {
  const columnOf = (name: string) => model.fields.find((f) => f.name === name)?.dbName ?? name
  const pkLine = model.primaryKey
    ? (() => {
        imports.core.add('primaryKey')
        return `primaryKey({ name: '${tableName}_pkey', columns: [${model.primaryKey.fields.map((f) => `table.${f}`).join(', ')}] })`
      })()
    : null

  const indexLines = indexes
    .filter(
      (idx) =>
        idx.model === model.name &&
        (idx.type === 'unique' || idx.type === 'normal' || idx.type === 'fulltext'),
    )
    .map((idx) => {
      const name =
        idx.dbName ??
        constraintName(
          tableName,
          idx.fields.map((f) => columnOf(f.name)),
          idx.type === 'unique' ? 'key' : 'idx',
          provider,
        )
      // drizzle-kit adds a table's foreign keys before its indexes, and a foreign key is refused
      // where what it points at is not unique yet: a unique a relation points at is a constraint,
      // made with the table. SQLite makes its foreign keys with the table and asks for neither.
      const referenced =
        provider !== 'sqlite' &&
        models.some((m) =>
          m.fields.some(
            (f) =>
              f.type === model.name &&
              f.relationToFields?.join(',') === idx.fields.map((field) => field.name).join(','),
          ),
        )
      const make = idx.type !== 'unique' ? 'index' : referenced ? 'unique' : 'uniqueIndex'
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

  const fkLines = model.fields
    .filter(
      (f) =>
        f.kind === 'object' &&
        f.relationFromFields !== undefined &&
        f.relationFromFields.length > 0 &&
        f.relationToFields !== undefined,
    )
    .map((f) => {
      imports.core.add('foreignKey')
      // A relation of a model to itself reads its own columns from the table it is given.
      const target = f.type === model.name ? 'table' : resolveVarNameByType(f.type, models)
      const from = f.relationFromFields ?? []
      const name = constraintName(tableName, from.map(columnOf), 'fkey', provider)
      const onDelete = f.relationOnDelete ?? (f.isRequired ? 'Restrict' : 'SetNull')
      const onUpdate = f.relationOnUpdate ?? 'Cascade'
      return `foreignKey({ name: '${name}', columns: [${from.map((c) => `table.${c}`).join(', ')}], foreignColumns: [${(f.relationToFields ?? []).map((c) => `${target}.${c}`).join(', ')}] }).onDelete('${PRISMA_ACTION_MAP[onDelete] ?? 'no action'}').onUpdate('${PRISMA_ACTION_MAP[onUpdate] ?? 'no action'}')`
    })

  const all = [pkLine, ...indexLines, ...fkLines].filter((l) => l !== null)
  return all.length > 0 ? all.join(', ') : null
}

export function makeTable(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  provider: DbProvider,
  imports: DrizzleImports,
  enums: readonly DMMF.DatamodelEnum[],
  indexes: readonly DMMF.Index[],
) {
  const tableFunc =
    provider === 'postgresql' ? 'pgTable' : provider === 'mysql' ? 'mysqlTable' : 'sqliteTable'
  imports.core.add(tableFunc)

  const varName = resolveVarName(model)
  const tableName = resolveTableName(model)
  const columns = model.fields
    .map((field) => makeColumn(field, model, models, provider, imports, enums))
    .filter((c) => c !== null)
    .join(', ')
  const constraints = makeTableConstraints(model, models, provider, imports, indexes, tableName)

  return constraints
    ? `export const ${varName} = ${tableFunc}('${tableName}', { ${columns} }, (table) => [${constraints}])`
    : `export const ${varName} = ${tableFunc}('${tableName}', { ${columns} })`
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

function joinVarName(relationName: string) {
  return snakeToCamel(makeSnakeCase(relationName))
}

function collectM2MJoinTables(models: readonly DMMF.Model[]) {
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
  return pairs.filter((pair) => {
    if (seen.has(pair.relationName)) return false
    seen.add(pair.relationName)
    return true
  })
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
  const tableFunc =
    provider === 'postgresql' ? 'pgTable' : provider === 'mysql' ? 'mysqlTable' : 'sqliteTable'
  return collectM2MJoinTables(models).map((pair) => {
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
        key: models.find((m) => m.name === model)?.fields.find((f) => f.isId)?.name ?? 'id',
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

export function makeM2MJoinRelations(models: readonly DMMF.Model[], imports: DrizzleImports) {
  const pairs = collectM2MJoinTables(models)
  if (pairs.length > 0) imports.orm.add('relations')
  return pairs.map((pair) => {
    const varName = joinVarName(pair.relationName)
    const leftVar = resolveVarNameByType(pair.left, models)
    const rightVar = resolveVarNameByType(pair.right, models)
    const leftPk = models.find((m) => m.name === pair.left)?.fields.find((f) => f.isId)
    const rightPk = models.find((m) => m.name === pair.right)?.fields.find((f) => f.isId)
    const leftKey = uncapitalizeName(pair.left)
    const rightKey =
      pair.left === pair.right ? `${uncapitalizeName(pair.right)}_` : uncapitalizeName(pair.right)
    return `export const ${varName}Relations = relations(${varName}, ({ one }) => ({ ${leftKey}: one(${leftVar}, { fields: [${varName}.A], references: [${leftVar}.${leftPk?.name ?? 'id'}] }), ${rightKey}: one(${rightVar}, { fields: [${varName}.B], references: [${rightVar}.${rightPk?.name ?? 'id'}] }) }))`
  })
}

function uncapitalizeName(name: string) {
  const camel = snakeToCamel(makeSnakeCase(name))
  return camel.charAt(0).toLowerCase() + camel.slice(1)
}

function makeRelationField(
  field: DMMF.Field,
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  relFields: readonly DMMF.Field[],
) {
  const targetVar = resolveVarNameByType(field.type, models)
  const modelVar = resolveVarName(model)
  const needsAlias = relFields.filter((f) => f.type === field.type).length > 1 && field.relationName

  if (field.relationFromFields && field.relationFromFields.length > 0) {
    const fromCols = field.relationFromFields.map((c) => `${modelVar}.${c}`).join(', ')
    const toCols = (
      field.relationToFields && field.relationToFields.length > 0 ? field.relationToFields : ['id']
    )
      .map((c) => `${targetVar}.${c}`)
      .join(', ')
    const configParts = [
      `fields: [${fromCols}]`,
      `references: [${toCols}]`,
      needsAlias ? `relationName: '${field.relationName}'` : '',
    ].filter(Boolean)
    return `${field.name}: one(${targetVar}, { ${configParts.join(', ')} })`
  }

  if (field.isList) {
    // An implicit m2m side goes through the junction table: drizzle's
    // relational API has no direct many-to-many, so `many(target)` here
    // would fail to resolve at query time.
    if (isImplicitM2M(field, models)) {
      const [left, right] =
        model.name < field.type ? [model.name, field.type] : [field.type, model.name]
      return `${field.name}: many(${joinVarName(field.relationName ?? `${left}To${right}`)})`
    }
    return needsAlias
      ? `${field.name}: many(${targetVar}, { relationName: '${field.relationName}' })`
      : `${field.name}: many(${targetVar})`
  }

  return `${field.name}: one(${targetVar})`
}

export function makeRelations(models: readonly DMMF.Model[], imports: DrizzleImports) {
  const modelsWithRels = models.filter((model) => model.fields.some((f) => f.kind === 'object'))
  if (modelsWithRels.length === 0) return []

  imports.orm.add('relations')

  return modelsWithRels.map((model) => {
    const relFields = model.fields.filter((f) => f.kind === 'object')
    const fieldLines = relFields
      .map((field) => makeRelationField(field, model, models, relFields))
      .join(', ')
    const modelVar = resolveVarName(model)
    const needsOne = relFields.some((f) => (f.relationFromFields?.length ?? 0) > 0 || !f.isList)
    const needsMany = relFields.some((f) => f.isList && (f.relationFromFields?.length ?? 0) === 0)
    const destructured = [needsOne ? 'one' : '', needsMany ? 'many' : ''].filter(Boolean).join(', ')
    return `export const ${modelVar}Relations = relations(${modelVar}, ({ ${destructured} }) => ({ ${fieldLines} }))`
  })
}
