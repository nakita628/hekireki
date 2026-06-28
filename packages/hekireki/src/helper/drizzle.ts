import type { DMMF } from '@prisma/generator-helper'

import { makeSnakeCase } from '../utils/index.js'

type DbProvider = 'postgresql' | 'mysql' | 'sqlite'

export function resolveDbProvider(
  provider: 'postgresql' | 'cockroachdb' | 'mysql' | 'sqlite',
): DbProvider {
  switch (provider) {
    case 'postgresql':
    case 'cockroachdb':
      return 'postgresql'
    case 'mysql':
      return 'mysql'
    case 'sqlite':
      return 'sqlite'
  }
}

// ============================================================================
// Type Maps
// ============================================================================

const PG_SCALAR_MAP: { [k: string]: string } = {
  String: 'text()',
  Int: 'integer()',
  BigInt: "bigint({ mode: 'bigint' })",
  Float: 'doublePrecision()',
  Decimal: 'numeric()',
  Boolean: 'boolean()',
  DateTime: 'timestamp()',
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
  DateTime: "integer({ mode: 'timestamp_ms' })",
  Json: "text({ mode: 'json' })",
  Bytes: 'blob()',
}

function makeDecimalOpts(args: readonly string[]): string {
  const opts = [
    args[0] ? `precision: ${args[0]}` : null,
    args[1] ? `scale: ${args[1]}` : null,
  ].filter((o) => o !== null)
  return opts.length > 0 ? `{ ${opts.join(', ')} }` : ''
}

function pgNativeType(name: string, args: readonly string[]): string | null {
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
      return 'date()'
    case 'Time':
      return args[0] ? `time({ precision: ${args[0]} })` : 'time()'
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

function mysqlNativeType(name: string, args: readonly string[]): string | null {
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
      return 'date()'
    case 'Time':
      return args[0] ? `time({ fsp: ${args[0]} })` : 'time()'
    case 'DateTime':
      return `datetime({ fsp: ${args[0] ?? 3} })`
    case 'Timestamp':
      return `timestamp({ fsp: ${args[0] ?? 3} })`
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

type ImportReq = { readonly pkg: string; readonly kind: 'named' | 'default'; readonly name: string }

export function createImports() {
  return {
    core: new Set<string>(),
    orm: new Set<string>(),
    ext: new Map<string, { named: Set<string>; default?: string }>(),
  }
}

type DrizzleImports = ReturnType<typeof createImports>

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
    imports.core.size > 0 ? `import { ${[...imports.core].sort().join(', ')} } from '${mod}'` : ''
  const ormImport =
    imports.orm.size > 0
      ? `import { ${[...imports.orm].sort().join(', ')} } from 'drizzle-orm'`
      : ''
  const extImports = [...imports.ext.entries()].map(([pkg, entry]) => {
    const clause = [
      entry.default,
      entry.named.size > 0 ? `{ ${[...entry.named].sort().join(', ')} }` : undefined,
    ]
      .filter((c) => c !== undefined)
      .join(', ')
    return `import ${clause} from '${pkg}'`
  })
  return [coreImport, ormImport, ...extImports].filter(Boolean).join('\n')
}

// ============================================================================
// Helpers
// ============================================================================

function snakeToCamel(name: string): string {
  return name.replace(/_+([a-zA-Z0-9])/g, (_, c) => c.toUpperCase())
}

function resolveTableName(model: DMMF.Model): string {
  return model.dbName ?? makeSnakeCase(model.name)
}

function resolveVarName(model: DMMF.Model): string {
  return snakeToCamel(resolveTableName(model))
}

function resolveVarNameByType(type: string, models: readonly DMMF.Model[]): string {
  const target = models.find((m) => m.name === type)
  return snakeToCamel(target ? resolveTableName(target) : makeSnakeCase(type))
}

function isFieldDefault(v: unknown): v is DMMF.FieldDefault {
  return typeof v === 'object' && v !== null && 'name' in v
}

// ============================================================================
// Column
// ============================================================================

function resolveScalarType(field: DMMF.Field, provider: DbProvider): string {
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
): string {
  const colName = field.dbName ?? field.name
  const isAutoincrement = isFieldDefault(field.default) && field.default.name === 'autoincrement'

  if (field.kind === 'enum') {
    const enumDef = enums.find((e) => e.name === field.type)
    const enumValues = enumDef ? enumDef.values.map((v) => `'${v.name}'`).join(', ') : ''
    if (provider === 'postgresql') {
      imports.core.add('pgEnum')
      const enumDbName = enumDef?.dbName ?? field.type
      return `pgEnum('${enumDbName}', [${enumValues}])('${colName}')`
    }
    if (provider === 'mysql') {
      imports.core.add('mysqlEnum')
      return `mysqlEnum('${colName}', [${enumValues}])`
    }
    imports.core.add('text')
    return `text('${colName}', { enum: [${enumValues}] })`
  }

  if (isAutoincrement && provider === 'postgresql') {
    imports.core.add('serial')
    return `serial('${colName}')`
  }

  const baseExpr = resolveScalarType(field, provider)
  const fnName = baseExpr.match(/^(\w+)/)?.[1]
  if (fnName) imports.core.add(fnName)
  const parenIdx = baseExpr.indexOf('(')
  if (parenIdx === -1) return baseExpr
  const baseFnName = baseExpr.slice(0, parenIdx)
  const rest = baseExpr.slice(parenIdx + 1)
  return rest === ')' ? `${baseFnName}('${colName}')` : `${baseFnName}('${colName}', ${rest}`
}

const SQL_IMPORT = { pkg: 'drizzle-orm', kind: 'named', name: 'sql' } as const

function resolveDefaultValue(
  dflt: DMMF.Field['default'],
  fieldType: string,
  provider: DbProvider,
): { chain: string; imports: readonly ImportReq[] } {
  if (dflt === undefined || dflt === null) return { chain: '', imports: [] }
  if (isFieldDefault(dflt)) {
    switch (dflt.name) {
      case 'autoincrement':
        return { chain: '', imports: [] }
      case 'now':
        if (provider === 'sqlite')
          return { chain: '.default(sql`(unixepoch() * 1000)`)', imports: [SQL_IMPORT] }
        if (provider === 'mysql')
          return { chain: '.default(sql`CURRENT_TIMESTAMP(3)`)', imports: [SQL_IMPORT] }
        return { chain: '.defaultNow()', imports: [] }
      case 'uuid':
        return { chain: '.$defaultFn(() => crypto.randomUUID())', imports: [] }
      case 'cuid':
        return dflt.args[0] === 2
          ? {
              chain: '.$defaultFn(() => createId())',
              imports: [{ pkg: '@paralleldrive/cuid2', kind: 'named', name: 'createId' }],
            }
          : {
              chain: '.$defaultFn(() => cuid())',
              imports: [{ pkg: 'cuid', kind: 'default', name: 'cuid' }],
            }
      case 'nanoid':
        return {
          chain: '.$defaultFn(() => nanoid())',
          imports: [{ pkg: 'nanoid', kind: 'named', name: 'nanoid' }],
        }
      case 'ulid':
        return {
          chain: '.$defaultFn(() => ulid())',
          imports: [{ pkg: 'ulidx', kind: 'named', name: 'ulid' }],
        }
      case 'dbgenerated':
        if (typeof dflt.args[0] === 'string')
          return { chain: `.default(sql\`${dflt.args[0]}\`)`, imports: [SQL_IMPORT] }
        return { chain: '', imports: [] }
      default:
        return { chain: '', imports: [] }
    }
  }
  if (typeof dflt === 'string') return { chain: `.default('${dflt}')`, imports: [] }
  if (typeof dflt === 'number') {
    const chain = fieldType === 'Decimal' ? `.default('${dflt}')` : `.default(${dflt})`
    return { chain, imports: [] }
  }
  if (typeof dflt === 'boolean') return { chain: `.default(${dflt})`, imports: [] }
  return { chain: '', imports: [] }
}

function resolveUpdatedAtDefault(provider: DbProvider): {
  chain: string
  needsSql: boolean
} {
  if (provider === 'sqlite') return { chain: '.default(sql`(unixepoch() * 1000)`)', needsSql: true }
  if (provider === 'mysql') return { chain: '.default(sql`CURRENT_TIMESTAMP(3)`)', needsSql: true }
  return { chain: '.defaultNow()', needsSql: false }
}

function makeDefaultChain(
  dflt: DMMF.Field['default'],
  fieldType: string,
  provider: DbProvider,
  imports: DrizzleImports,
): string {
  const result = resolveDefaultValue(dflt, fieldType, provider)
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

function makeFkReference(
  field: DMMF.Field,
  model: DMMF.Model,
  models: readonly DMMF.Model[],
): string {
  const relField = model.fields.find(
    (f) => f.kind === 'object' && f.relationFromFields && f.relationFromFields.includes(field.name),
  )
  if (!(relField?.relationFromFields && relField.relationToFields)) return ''

  // Skip inline .references() for self-referencing FKs to avoid TypeScript circular inference error
  if (relField.type === model.name) return ''

  const targetVar = resolveVarNameByType(relField.type, models)
  const toCol = relField.relationToFields[0] ?? 'id'
  const onDelete = relField.relationOnDelete
  const drizzleAction = onDelete ? PRISMA_ACTION_MAP[onDelete] : undefined
  const opts = drizzleAction ? `, { onDelete: '${drizzleAction}' }` : ''
  return `.references(() => ${targetVar}.${toCol}${opts})`
}

function makeColumn(
  field: DMMF.Field,
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  provider: DbProvider,
  imports: DrizzleImports,
  enums: readonly DMMF.DatamodelEnum[],
): string | null {
  if (field.kind === 'object') return null
  if (field.kind === 'unsupported') return `// unsupported type: ${field.name}`

  const isAutoincrement = isFieldDefault(field.default) && field.default.name === 'autoincrement'
  const hasCompositePK = model.primaryKey !== null
  const colExpr = makeColumnExpr(field, provider, imports, enums)

  const chain = [
    field.isId && !hasCompositePK
      ? isAutoincrement && provider === 'sqlite'
        ? '.primaryKey({ autoIncrement: true })'
        : '.primaryKey()'
      : '',
    field.isRequired && !field.isId && !(isAutoincrement && provider === 'postgresql')
      ? '.notNull()'
      : '',
    field.isUnique ? '.unique()' : '',
    makeFkReference(field, model, models),
    isAutoincrement
      ? provider === 'mysql'
        ? '.autoincrement()'
        : ''
      : field.isUpdatedAt && (field.default === undefined || field.default === null)
        ? (() => {
            const r = resolveUpdatedAtDefault(provider)
            if (r.needsSql) imports.orm.add('sql')
            return r.chain
          })()
        : makeDefaultChain(field.default, field.type, provider, imports),
    field.isUpdatedAt ? '.$onUpdate(() => new Date())' : '',
    field.isList && field.kind === 'scalar' && provider === 'postgresql' ? '.array()' : '',
  ].join('')

  return `${field.name}: ${colExpr}${chain}`
}

// ============================================================================
// Composite Constraints
// ============================================================================

function makeCompositeConstraints(
  model: DMMF.Model,
  imports: DrizzleImports,
  indexes: readonly DMMF.Index[],
  tableName: string,
): string | null {
  const pkLine = model.primaryKey
    ? (() => {
        imports.core.add('primaryKey')
        return `primaryKey({ columns: [${model.primaryKey.fields.map((f) => `table.${f}`).join(', ')}] })`
      })()
    : null

  const uniqueLines = model.uniqueFields
    .filter((fields) => fields.length > 1)
    .map((fields) => {
      imports.core.add('unique')
      return `unique().on(${fields.map((f) => `table.${f}`).join(', ')})`
    })

  const indexLines = indexes
    .filter((idx) => idx.model === model.name && (idx.type === 'normal' || idx.type === 'fulltext'))
    .map((idx) => {
      imports.core.add('index')
      const idxName =
        idx.dbName ?? idx.name ?? `idx_${tableName}_${idx.fields.map((f) => f.name).join('_')}`
      return `index('${idxName}').on(${idx.fields.map((f) => `table.${f.name}`).join(', ')})`
    })

  const all = [pkLine, ...uniqueLines, ...indexLines].filter((l) => l !== null)
  return all.length > 0 ? all.join(', ') : null
}

// ============================================================================
// Table
// ============================================================================

export function makeTable(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  provider: DbProvider,
  imports: DrizzleImports,
  enums: readonly DMMF.DatamodelEnum[],
  indexes: readonly DMMF.Index[],
): string {
  const tableFunc =
    provider === 'postgresql' ? 'pgTable' : provider === 'mysql' ? 'mysqlTable' : 'sqliteTable'
  imports.core.add(tableFunc)

  const varName = resolveVarName(model)
  const tableName = resolveTableName(model)
  const columns = model.fields
    .map((field) => makeColumn(field, model, models, provider, imports, enums))
    .filter((c) => c !== null)
    .join(', ')
  const constraints = makeCompositeConstraints(model, imports, indexes, tableName)

  return constraints
    ? `export const ${varName} = ${tableFunc}('${tableName}', { ${columns} }, (table) => [${constraints}])`
    : `export const ${varName} = ${tableFunc}('${tableName}', { ${columns} })`
}

// ============================================================================
// Relations
// ============================================================================

function makeRelationField(
  field: DMMF.Field,
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  relFields: readonly DMMF.Field[],
): string {
  const targetVar = resolveVarNameByType(field.type, models)
  const modelVar = resolveVarName(model)
  const needsAlias = relFields.filter((f) => f.type === field.type).length > 1 && field.relationName

  if (field.relationFromFields && field.relationFromFields.length > 0) {
    const fromCol = field.relationFromFields[0]
    const toCol = field.relationToFields?.[0] ?? 'id'
    const configParts = [
      `fields: [${modelVar}.${fromCol}]`,
      `references: [${targetVar}.${toCol}]`,
      needsAlias ? `relationName: '${field.relationName}'` : '',
    ].filter(Boolean)
    return `${field.name}: one(${targetVar}, { ${configParts.join(', ')} })`
  }

  if (field.isList) {
    return needsAlias
      ? `${field.name}: many(${targetVar}, { relationName: '${field.relationName}' })`
      : `${field.name}: many(${targetVar})`
  }

  return `${field.name}: one(${targetVar})`
}

export function makeRelations(
  models: readonly DMMF.Model[],
  imports: DrizzleImports,
): readonly string[] {
  const modelsWithRels = models.filter((model) => model.fields.some((f) => f.kind === 'object'))
  if (modelsWithRels.length === 0) return []

  imports.orm.add('relations')

  return modelsWithRels.map((model) => {
    const relFields = model.fields.filter((f) => f.kind === 'object')
    const fieldLines = relFields
      .map((field) => makeRelationField(field, model, models, relFields))
      .join(', ')
    const modelVar = resolveVarName(model)
    const needsOne = relFields.some(
      (f) => (f.relationFromFields && f.relationFromFields.length > 0) || !f.isList,
    )
    const needsMany = relFields.some(
      (f) => f.isList && !(f.relationFromFields && f.relationFromFields.length > 0),
    )
    const destructured = [needsOne ? 'one' : '', needsMany ? 'many' : ''].filter(Boolean).join(', ')
    return `export const ${modelVar}Relations = relations(${modelVar}, ({ ${destructured} }) => ({ ${fieldLines} }))`
  })
}

// ============================================================================
// Main
// ============================================================================
