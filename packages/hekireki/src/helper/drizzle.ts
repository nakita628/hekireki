import type { DMMF } from '@prisma/generator-helper'

import { makeSnakeCase } from '../utils/index.js'

export type DbProvider = 'postgresql' | 'mysql' | 'sqlite'

function resolveDbProvider(
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

export function makeDecimalOpts(args: readonly string[]): string {
  const opts = [
    args[0] ? `precision: ${args[0]}` : null,
    args[1] ? `scale: ${args[1]}` : null,
  ].filter((o): o is string => o !== null)
  return opts.length > 0 ? `{ ${opts.join(', ')} }` : ''
}

export function pgNativeType(name: string, args: readonly string[]): string | null {
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
        (o): o is string => o !== null,
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

export function mysqlNativeType(name: string, args: readonly string[]): string | null {
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

function createImports() {
  return {
    core: new Set<string>(),
    orm: new Set<string>(),
    ext: new Map<string, Set<string>>(),
  }
}

function addExternal(
  imports: { core: Set<string>; orm: Set<string>; ext: Map<string, Set<string>> },
  pkg: string,
  fn: string,
) {
  const fns = imports.ext.get(pkg) ?? new Set<string>()
  fns.add(fn)
  imports.ext.set(pkg, fns)
}

function generateImports(
  imports: { core: Set<string>; orm: Set<string>; ext: Map<string, Set<string>> },
  provider: DbProvider,
) {
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
  const extImports = [...imports.ext.entries()].map(
    ([pkg, fns]) => `import { ${[...fns].sort().join(', ')} } from '${pkg}'`,
  )
  return [coreImport, ormImport, ...extImports].filter(Boolean).join('\n')
}

// ============================================================================
// Helpers
// ============================================================================

export function toCamelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1)
}

function isFieldDefault(v: unknown): v is DMMF.FieldDefault {
  return typeof v === 'object' && v !== null && 'name' in v
}

// ============================================================================
// Column
// ============================================================================

export function resolveScalarType(field: DMMF.Field, provider: DbProvider): string {
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
  imports: { core: Set<string>; orm: Set<string>; ext: Map<string, Set<string>> },
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

export function resolveDefaultValue(
  dflt: DMMF.Field['default'],
  fieldType: string,
  provider: DbProvider,
): { chain: string; needsSql: boolean; needsCuid: boolean } {
  if (dflt === undefined || dflt === null) return { chain: '', needsSql: false, needsCuid: false }
  if (isFieldDefault(dflt)) {
    switch (dflt.name) {
      case 'autoincrement':
        return { chain: '', needsSql: false, needsCuid: false }
      case 'now':
        if (provider === 'sqlite')
          return { chain: '.default(sql`(unixepoch() * 1000)`)', needsSql: true, needsCuid: false }
        if (provider === 'mysql')
          return {
            chain: '.default(sql`CURRENT_TIMESTAMP(3)`)',
            needsSql: true,
            needsCuid: false,
          }
        return { chain: '.defaultNow()', needsSql: false, needsCuid: false }
      case 'uuid':
        return {
          chain: '.$defaultFn(() => crypto.randomUUID())',
          needsSql: false,
          needsCuid: false,
        }
      case 'cuid':
        return { chain: '.$defaultFn(() => createId())', needsSql: false, needsCuid: true }
      case 'dbgenerated':
        if (typeof dflt.args[0] === 'string')
          return {
            chain: `.default(sql\`${dflt.args[0]}\`)`,
            needsSql: true,
            needsCuid: false,
          }
        return { chain: '', needsSql: false, needsCuid: false }
      default:
        return { chain: '', needsSql: false, needsCuid: false }
    }
  }
  if (typeof dflt === 'string')
    return { chain: `.default('${dflt}')`, needsSql: false, needsCuid: false }
  if (typeof dflt === 'number') {
    const chain = fieldType === 'Decimal' ? `.default('${dflt}')` : `.default(${dflt})`
    return { chain, needsSql: false, needsCuid: false }
  }
  if (typeof dflt === 'boolean')
    return { chain: `.default(${dflt})`, needsSql: false, needsCuid: false }
  return { chain: '', needsSql: false, needsCuid: false }
}

export function resolveUpdatedAtDefault(provider: DbProvider): {
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
  imports: { core: Set<string>; orm: Set<string>; ext: Map<string, Set<string>> },
): string {
  const result = resolveDefaultValue(dflt, fieldType, provider)
  if (result.needsSql) imports.orm.add('sql')
  if (result.needsCuid) addExternal(imports, '@paralleldrive/cuid2', 'createId')
  return result.chain
}

export const PRISMA_ACTION_MAP: Record<string, string> = {
  Cascade: 'cascade',
  SetNull: 'set null',
  Restrict: 'restrict',
  NoAction: 'no action',
  SetDefault: 'set default',
}

function makeFkReference(field: DMMF.Field, model: DMMF.Model): string {
  const relField = model.fields.find(
    (f) => f.kind === 'object' && f.relationFromFields && f.relationFromFields.includes(field.name),
  )
  if (!(relField?.relationFromFields && relField.relationToFields)) return ''

  // Skip inline .references() for self-referencing FKs to avoid TypeScript circular inference error
  if (relField.type === model.name) return ''

  const targetVar = toCamelCase(relField.type)
  const toCol = relField.relationToFields[0] ?? 'id'
  const onDelete = relField.relationOnDelete
  const drizzleAction = onDelete ? PRISMA_ACTION_MAP[onDelete] : undefined
  const opts = drizzleAction ? `, { onDelete: '${drizzleAction}' }` : ''
  return `.references(() => ${targetVar}.${toCol}${opts})`
}

function makeColumn(
  field: DMMF.Field,
  model: DMMF.Model,
  provider: DbProvider,
  imports: { core: Set<string>; orm: Set<string>; ext: Map<string, Set<string>> },
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
    makeFkReference(field, model),
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
  imports: { core: Set<string>; orm: Set<string>; ext: Map<string, Set<string>> },
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

  const all = [pkLine, ...uniqueLines, ...indexLines].filter((l): l is string => l !== null)
  return all.length > 0 ? all.join(', ') : null
}

// ============================================================================
// Table
// ============================================================================

function makeTable(
  model: DMMF.Model,
  provider: DbProvider,
  imports: { core: Set<string>; orm: Set<string>; ext: Map<string, Set<string>> },
  enums: readonly DMMF.DatamodelEnum[],
  indexes: readonly DMMF.Index[],
): string {
  const tableFunc =
    provider === 'postgresql' ? 'pgTable' : provider === 'mysql' ? 'mysqlTable' : 'sqliteTable'
  imports.core.add(tableFunc)

  const varName = toCamelCase(model.name)
  const tableName = model.dbName ?? makeSnakeCase(model.name)
  const columns = model.fields
    .map((field) => makeColumn(field, model, provider, imports, enums))
    .filter((c): c is string => c !== null)
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
  _models: readonly DMMF.Model[],
  relFields: readonly DMMF.Field[],
): string {
  const targetVar = toCamelCase(field.type)
  const modelVar = toCamelCase(model.name)
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

function makeRelations(
  models: readonly DMMF.Model[],
  imports: { core: Set<string>; orm: Set<string>; ext: Map<string, Set<string>> },
): readonly string[] {
  const modelsWithRels = models.filter((model) => model.fields.some((f) => f.kind === 'object'))
  if (modelsWithRels.length === 0) return []

  imports.orm.add('relations')

  return modelsWithRels.map((model) => {
    const relFields = model.fields.filter((f) => f.kind === 'object')
    const fieldLines = relFields
      .map((field) => makeRelationField(field, model, models, relFields))
      .join(', ')
    const modelVar = toCamelCase(model.name)
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

export function drizzleSchema(
  datamodel: DMMF.Datamodel,
  provider: 'postgresql' | 'cockroachdb' | 'mysql' | 'sqlite',
  indexes: readonly DMMF.Index[],
): string {
  const db = resolveDbProvider(provider)
  const imports = createImports()

  const tableLines = datamodel.models.map((model) =>
    makeTable(model, db, imports, datamodel.enums, indexes),
  )
  const relationsLines = makeRelations(datamodel.models, imports)

  const tableLinesWithGap = tableLines.flatMap((line, i) =>
    i < tableLines.length - 1 ? [line, ''] : [line],
  )
  const relationsLinesWithGap = relationsLines.flatMap((line, i) =>
    i < relationsLines.length - 1 ? [line, ''] : [line],
  )

  return [
    generateImports(imports, db),
    '',
    ...tableLinesWithGap,
    ...(relationsLinesWithGap.length > 0 ? ['', ...relationsLinesWithGap] : []),
  ].join('\n')
}
