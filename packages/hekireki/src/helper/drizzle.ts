import type { DMMF } from '@prisma/generator-helper'

import { makeSnakeCase } from '../utils/index.js'

type DbProvider = 'postgresql' | 'mysql' | 'sqlite'

export function resolveDbProvider(provider: 'postgresql' | 'cockroachdb' | 'mysql' | 'sqlite') {
  return provider === 'cockroachdb' ? 'postgresql' : provider
}

const PG_SCALAR_MAP: { [k: string]: string } = {
  String: 'text()',
  Int: 'integer()',
  BigInt: "bigint({ mode: 'bigint' })",
  Float: 'doublePrecision()',
  Decimal: 'numeric()',
  Boolean: 'boolean()',
  DateTime: 'timestamp({ precision: 3 })',
  Json: 'jsonb()',
  Bytes: 'text()',
}

const MYSQL_SCALAR_MAP: { [k: string]: string } = {
  String: 'text()',
  Int: 'int()',
  BigInt: "bigint({ mode: 'bigint' })",
  Float: 'double()',
  Decimal: 'decimal()',
  Boolean: 'boolean()',
  DateTime: 'datetime({ fsp: 3 })',
  Json: 'json()',
  Bytes: 'binary()',
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
      return 'text()'
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
    case 'Binary':
      return args[0] ? `binary({ length: ${args[0]} })` : 'binary()'
    case 'VarBinary':
      return args[0] ? `varbinary({ length: ${args[0]} })` : 'varbinary()'
    case 'Blob':
      return 'blob()'
    default:
      return null
  }
}

// Columns that keep a DateTime in UTC, in the form Prisma Client writes and reads it.
const DATE_HELPERS: { readonly [name: string]: string } = {
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
    dates: new Set<string>(),
  }
}

type DrizzleImports = ReturnType<typeof createImports>

// A column function is drizzle's own, imported from its core module, or one of the date helpers,
// declared in the schema itself.
function addColumnImport(baseExpr: string, imports: DrizzleImports) {
  const fnName = baseExpr.match(/^(\w+)/u)?.[1]
  if (fnName === undefined) return
  if (fnName in DATE_HELPERS) imports.dates.add(fnName)
  else imports.core.add(fnName)
}

/**
 * The date helpers the tables use, in a fixed order, to be written after the imports.
 *
 * @param imports - What the tables asked for; `customType` is added to it when a helper is one.
 * @returns The declarations, one per helper.
 */
export function makeDateHelpers(imports: DrizzleImports) {
  const used = Object.keys(DATE_HELPERS).filter((name) => imports.dates.has(name))
  if (used.some((name) => name !== 'utcNow')) imports.core.add('customType')
  return used.map((name) => DATE_HELPERS[name] ?? '')
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

function makeFkActionOpts(onDelete: string | undefined, onUpdate: string | undefined) {
  const parts = [
    onDelete && PRISMA_ACTION_MAP[onDelete] ? `onDelete: '${PRISMA_ACTION_MAP[onDelete]}'` : null,
    onUpdate && PRISMA_ACTION_MAP[onUpdate] ? `onUpdate: '${PRISMA_ACTION_MAP[onUpdate]}'` : null,
  ].filter((p) => p !== null)
  return parts.length > 0 ? `, { ${parts.join(', ')} }` : ''
}

function makeFkReference(field: DMMF.Field, model: DMMF.Model, models: readonly DMMF.Model[]) {
  const relField = model.fields.find(
    (f) => f.kind === 'object' && f.relationFromFields?.includes(field.name),
  )
  if (!(relField?.relationFromFields && relField.relationToFields)) return ''

  // A multi-column FK cannot be expressed per column: an inline .references()
  // here would pair each local column with relationToFields[0] and emit a
  // half-join; the table-level foreignKey() constraint covers it instead.
  if (relField.relationFromFields.length > 1) return ''

  // Skip inline .references() for self-referencing FKs to avoid TypeScript circular inference error
  if (relField.type === model.name) return ''

  const targetVar = resolveVarNameByType(relField.type, models)
  const toCol = relField.relationToFields[0] ?? 'id'
  const opts = makeFkActionOpts(relField.relationOnDelete, relField.relationOnUpdate)
  return `.references(() => ${targetVar}.${toCol}${opts})`
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
    imports.dates.add('utcNow')
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
    field.isUnique ? '.unique()' : '',
    makeFkReference(field, model, models),
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

function makeCompositeConstraints(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  imports: DrizzleImports,
  indexes: readonly DMMF.Index[],
  tableName: string,
) {
  const pkLine = model.primaryKey
    ? (() => {
        imports.core.add('primaryKey')
        return `primaryKey({ columns: [${model.primaryKey.fields.map((f) => `table.${f}`).join(', ')}] })`
      })()
    : null

  // Read from the datamodel indexes rather than `model.uniqueFields`, which is column names and
  // nothing else: `map:` names the constraint in the database, so it has to reach the output, the
  // way it already does for `@@index` below. Prisma's `name:` does not — it names the compound
  // key on the Client and means nothing to the database. A `@@unique` on a single column arrives
  // on the field as `isUnique`, and is written there.
  const uniqueLines = indexes
    .filter(
      (idx) =>
        idx.model === model.name &&
        idx.type === 'unique' &&
        !idx.isDefinedOnField &&
        idx.fields.length > 1,
    )
    .map((idx) => {
      imports.core.add('unique')
      const columns = idx.fields.map((f) => `table.${f.name}`).join(', ')
      return idx.dbName ? `unique('${idx.dbName}').on(${columns})` : `unique().on(${columns})`
    })

  const indexLines = indexes
    .filter((idx) => idx.model === model.name && (idx.type === 'normal' || idx.type === 'fulltext'))
    .map((idx) => {
      imports.core.add('index')
      const idxName =
        idx.dbName ?? idx.name ?? `idx_${tableName}_${idx.fields.map((f) => f.name).join('_')}`
      return `index('${idxName}').on(${idx.fields.map((f) => `table.${f.name}`).join(', ')})`
    })

  const compositeFkLines = model.fields
    .filter(
      (f) =>
        f.kind === 'object' &&
        f.relationFromFields &&
        f.relationFromFields.length > 1 &&
        f.relationToFields &&
        f.type !== model.name,
    )
    .map((f) => {
      imports.core.add('foreignKey')
      const targetVar = resolveVarNameByType(f.type, models)
      const columns = (f.relationFromFields ?? []).map((c) => `table.${c}`).join(', ')
      const foreignColumns = (f.relationToFields ?? []).map((c) => `${targetVar}.${c}`).join(', ')
      const onDelete =
        f.relationOnDelete && PRISMA_ACTION_MAP[f.relationOnDelete]
          ? `.onDelete('${PRISMA_ACTION_MAP[f.relationOnDelete]}')`
          : ''
      const onUpdate =
        f.relationOnUpdate && PRISMA_ACTION_MAP[f.relationOnUpdate]
          ? `.onUpdate('${PRISMA_ACTION_MAP[f.relationOnUpdate]}')`
          : ''
      return `foreignKey({ columns: [${columns}], foreignColumns: [${foreignColumns}] })${onDelete}${onUpdate}`
    })

  const all = [pkLine, ...uniqueLines, ...indexLines, ...compositeFkLines].filter((l) => l !== null)
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
  const constraints = makeCompositeConstraints(model, models, imports, indexes, tableName)

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

// Prisma's implicit join table: `_<relationName>`, FK columns "A"/"B" typed
// after each side's PK (models in alphabetical order), composite PK (A, B),
// both FKs ON DELETE CASCADE. Without this table the generated migration
// would silently lack the m2m storage entirely.
export function makeM2MJoinTables(
  models: readonly DMMF.Model[],
  provider: DbProvider,
  imports: DrizzleImports,
) {
  const tableFunc =
    provider === 'postgresql' ? 'pgTable' : provider === 'mysql' ? 'mysqlTable' : 'sqliteTable'
  return collectM2MJoinTables(models).map((pair) => {
    imports.core.add(tableFunc)
    imports.core.add('primaryKey')
    const varName = joinVarName(pair.relationName)
    const leftVar = resolveVarNameByType(pair.left, models)
    const rightVar = resolveVarNameByType(pair.right, models)
    const leftPk = models.find((m) => m.name === pair.left)?.fields.find((f) => f.isId)
    const rightPk = models.find((m) => m.name === pair.right)?.fields.find((f) => f.isId)
    const leftCol = `A: ${pkColumnExpr(pair.left, 'A', models, provider, imports)}.notNull().references(() => ${leftVar}.${leftPk?.name ?? 'id'}, { onDelete: 'cascade' })`
    const rightCol = `B: ${pkColumnExpr(pair.right, 'B', models, provider, imports)}.notNull().references(() => ${rightVar}.${rightPk?.name ?? 'id'}, { onDelete: 'cascade' })`
    return `export const ${varName} = ${tableFunc}('_${pair.relationName}', { ${leftCol}, ${rightCol} }, (table) => [primaryKey({ columns: [table.A, table.B] })])`
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
