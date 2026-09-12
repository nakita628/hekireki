import type { DMMF } from '@prisma/generator-helper'

import { pluralize } from './humanizer.js'
import { allocate, pascalCase } from './naming.js'
import {
  backRelation,
  columnName,
  entityKey,
  fieldNames,
  INDEX_METHODS,
  indexName,
  isFunctionDefault,
  isListDefault,
  isSameFieldSet,
  manyToManyRelations,
  modelIndexes,
  operatorClassName,
  parseDateTimeDefault,
  prismaConstraintName,
  shift,
  sqlArray,
  sqlString,
  sqlTimestamp,
  tableName,
} from './prisma-postgres.js'
import type { IndexInfo, ManyToMany } from './prisma-postgres.js'

// Generated C# names a framework type through a placeholder, `\0T|System.DateTime\0` in a type
// position or `\0E|...\0` in an expression. Only once a whole file is assembled is it known which
// simple names that file's own types and members take, so the placeholders are resolved last: to
// the simple name plus a `using`, or to a `global::` name where the simple one would bind to a
// model, an enum or a member instead. NUL never survives into emitted text otherwise — string
// literals escape it — so a placeholder cannot collide with user data.
const REF = '\u0000'

function typeRef(fullName: string) {
  return `${REF}T|${fullName}${REF}`
}

function exprRef(fullName: string) {
  return `${REF}E|${fullName}${REF}`
}

const CS = {
  BitArray: 'System.Collections.BitArray',
  CancellationToken: 'System.Threading.CancellationToken',
  Convert: 'System.Convert',
  Cuid: 'Visus.Cuid.Cuid',
  Cuid2: 'Visus.Cuid.Cuid2',
  DateOnly: 'System.DateOnly',
  DateTime: 'System.DateTime',
  DateTimeKind: 'System.DateTimeKind',
  DateTimeOffset: 'System.DateTimeOffset',
  DbContext: 'Microsoft.EntityFrameworkCore.DbContext',
  DbContextOptions: 'Microsoft.EntityFrameworkCore.DbContextOptions',
  DbSet: 'Microsoft.EntityFrameworkCore.DbSet',
  DeleteBehavior: 'Microsoft.EntityFrameworkCore.DeleteBehavior',
  Dictionary: 'System.Collections.Generic.Dictionary',
  EntityEntry: 'Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry',
  EntityState: 'Microsoft.EntityFrameworkCore.EntityState',
  ForeignKeyIndexConvention:
    'Microsoft.EntityFrameworkCore.Metadata.Conventions.ForeignKeyIndexConvention',
  Guid: 'System.Guid',
  ICollection: 'System.Collections.Generic.ICollection',
  List: 'System.Collections.Generic.List',
  ModelBuilder: 'Microsoft.EntityFrameworkCore.ModelBuilder',
  ModelConfigurationBuilder: 'Microsoft.EntityFrameworkCore.ModelConfigurationBuilder',
  NpgsqlDataSourceBuilder: 'Npgsql.NpgsqlDataSourceBuilder',
  NpgsqlDbContextOptionsBuilder:
    'Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure.NpgsqlDbContextOptionsBuilder',
  NpgsqlInet: 'NpgsqlTypes.NpgsqlInet',
  NpgsqlValueGenerationStrategy:
    'Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy',
  PgName: 'NpgsqlTypes.PgName',
  RandomNumberGenerator: 'System.Security.Cryptography.RandomNumberGenerator',
  Task: 'System.Threading.Tasks.Task',
  TimeOnly: 'System.TimeOnly',
  Ulid: 'System.Ulid',
  ValueGenerator: 'Microsoft.EntityFrameworkCore.ValueGeneration.ValueGenerator',
} as const

const CSHARP_KEYWORDS = new Set([
  'abstract',
  'as',
  'base',
  'bool',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'checked',
  'class',
  'const',
  'continue',
  'decimal',
  'default',
  'delegate',
  'do',
  'double',
  'else',
  'enum',
  'event',
  'explicit',
  'extern',
  'false',
  'finally',
  'fixed',
  'float',
  'for',
  'foreach',
  'goto',
  'if',
  'implicit',
  'in',
  'int',
  'interface',
  'internal',
  'is',
  'lock',
  'long',
  'namespace',
  'new',
  'null',
  'object',
  'operator',
  'out',
  'override',
  'params',
  'private',
  'protected',
  'public',
  'readonly',
  'ref',
  'return',
  'sbyte',
  'sealed',
  'short',
  'sizeof',
  'stackalloc',
  'static',
  'string',
  'struct',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'uint',
  'ulong',
  'unchecked',
  'unsafe',
  'ushort',
  'using',
  'virtual',
  'void',
  'volatile',
  'while',
])

/**
 * Checks a name written in the generator block — one segment of a namespace, or a class name.
 *
 * @param name - The name as written.
 * @returns Whether it is an ASCII C# identifier that is not a keyword.
 */
export function isCSharpIdentifier(name: string) {
  return /^[A-Z_a-z]\w*$/u.test(name) && !CSHARP_KEYWORDS.has(name)
}

/**
 * Checks a class name written in the generator block: an identifier C# accepts as the name of a
 * type without a warning — it warns on one in lower-case letters only (CS8981), which also covers
 * the contextual keywords it forbids as type names (`record`, `file`, `required`, `scoped`).
 *
 * @param name - The name as written.
 * @returns Whether it can name the DbContext.
 */
export function isCSharpTypeName(name: string) {
  return isCSharpIdentifier(name) && !/^[a-z]+$/u.test(name)
}

// The UTF-16 code units of a string; a surrogate pair passes through as its two halves.
function codeUnits(value: string) {
  return Array.from({ length: value.length }, (_, index) => value.charAt(index))
}

function csharpString(value: string) {
  const escaped = codeUnits(value)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0
      if (char === '\\') return '\\\\'
      if (char === '"') return '\\"'
      if (char === '\n') return '\\n'
      if (char === '\r') return '\\r'
      if (char === '\t') return '\\t'
      if (char === '\0') return '\\0'
      // C0 and C1 controls and the Unicode line terminators cannot stand raw in a string literal.
      if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x20_28 || code === 0x20_29) {
        return `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
      }
      return char
    })
    .join('')
  return `"${escaped}"`
}

type ForeignKey = {
  readonly dependent: DMMF.Model
  readonly navigation: DMMF.Field
  readonly principal: DMMF.Model
  readonly inverse: DMMF.Field | undefined
  /** FK columns paired with the columns they reference, in the order of the referenced key. */
  readonly pairs: readonly { readonly from: string; readonly to: string }[]
  /** The unique criterion the FK references, when that is not the principal's key. */
  readonly alternateKey: IndexInfo | null
}

function foreignKeys(
  models: readonly DMMF.Model[],
  indexesOf: (model: DMMF.Model) => readonly IndexInfo[],
) {
  return models.flatMap((dependent) =>
    dependent.fields
      .filter((f) => f.kind === 'object' && (f.relationFromFields ?? []).length > 0)
      .flatMap((navigation): ForeignKey[] => {
        const principal = models.find((m) => m.name === navigation.type)
        if (!principal) return []
        const from = navigation.relationFromFields ?? []
        const to = navigation.relationToFields ?? []
        const principalIndexes = indexesOf(principal)
        const referenced = principalIndexes.find(
          (index) =>
            (index.type === 'id' || index.type === 'unique') &&
            isSameFieldSet(fieldNames(index), to),
        )
        // EF Core matches a foreign key to a key by position, so the pairs follow the order of the
        // key they reference rather than the order `references` lists them in.
        const pairs = (referenced ? fieldNames(referenced) : to).flatMap((target) => {
          const position = to.indexOf(target)
          return position === -1 ? [] : [{ from: from[position], to: target }]
        })
        const isKey =
          referenced !== undefined && referenced === entityKey(principal, principalIndexes)
        return [
          {
            dependent,
            navigation,
            principal,
            inverse: backRelation(navigation, dependent, models),
            pairs,
            alternateKey: isKey
              ? null
              : (referenced ?? { type: 'unique', fields: to.map((name) => ({ name })) }),
          },
        ]
      }),
  )
}

const OBJECT_MEMBERS = [
  'Equals',
  'Finalize',
  'GetHashCode',
  'GetType',
  'MemberwiseClone',
  'ReferenceEquals',
  'ToString',
]

const DB_CONTEXT_MEMBERS = [
  ...OBJECT_MEMBERS,
  'Add',
  'AddAsync',
  'AddRange',
  'AddRangeAsync',
  'Attach',
  'AttachRange',
  'ChangeTracker',
  'ConfigureConventions',
  'ContextId',
  'Database',
  'Dispose',
  'DisposeAsync',
  'Entry',
  'Find',
  'FindAsync',
  'FromExpression',
  'Model',
  'OnConfiguring',
  'OnModelCreating',
  'Remove',
  'RemoveRange',
  'SaveChanges',
  'SaveChangesAsync',
  'SaveChangesFailed',
  'SavedChanges',
  'SavingChanges',
  'Set',
  'Update',
  'UpdateRange',
]

const GENERATED_CONTEXT_MEMBERS = [
  'ConfigureConventionsPartial',
  'MapEnums',
  'OnModelCreatingPartial',
  'StampUpdatedAt',
]

type Names = {
  readonly namespace: string
  readonly context: string
  readonly classes: ReadonlyMap<string, string>
  readonly enums: ReadonlyMap<string, string>
  readonly properties: ReadonlyMap<string, ReadonlyMap<string, string>>
  readonly enumMembers: ReadonlyMap<string, ReadonlyMap<string, string>>
  readonly dbSets: ReadonlyMap<string, string>
  readonly generators: ReadonlyMap<string, string>
}

function lowerCase(name: string) {
  return name.toLowerCase()
}

function asIs(name: string) {
  return name
}

function planNames(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
  generatorKeys: readonly string[],
  options: { readonly namespace: string; readonly context: string },
): Names {
  // Each type is written to `<Name>.cs` beside the others, so type names are unique regardless of
  // case: two files that differ only in case are one file on macOS and Windows.
  const types = allocate(
    [
      ...models.map((m) => ({ key: `model:${m.name}`, candidate: pascalCase(m.name) })),
      ...enums.map((e) => ({ key: `enum:${e.name}`, candidate: pascalCase(e.name) })),
      ...generatorKeys.map((key) => ({ key: `generator:${key}`, candidate: key })),
    ],
    [options.context],
    lowerCase,
  )
  const typeName = (key: string) => types.get(key) ?? key
  const classes = new Map(models.map((m) => [m.name, typeName(`model:${m.name}`)]))
  return {
    namespace: options.namespace,
    context: options.context,
    classes,
    enums: new Map(enums.map((e) => [e.name, typeName(`enum:${e.name}`)])),
    generators: new Map(generatorKeys.map((key) => [key, typeName(`generator:${key}`)])),
    // A member cannot share its class's name, and one named like a member of object would hide it.
    properties: new Map(
      models.map((model) => [
        model.name,
        allocate(
          model.fields.map((f) => ({ key: f.name, candidate: pascalCase(f.name) })),
          [classes.get(model.name) ?? model.name, ...OBJECT_MEMBERS],
          asIs,
        ),
      ]),
    ),
    enumMembers: new Map(
      enums.map((e) => [
        e.name,
        allocate(
          e.values.map((v) => ({ key: v.name, candidate: pascalCase(v.name) })),
          [],
          asIs,
        ),
      ]),
    ),
    dbSets: allocate(
      models.map((m) => ({ key: m.name, candidate: pluralize(classes.get(m.name) ?? m.name) })),
      [options.context, ...DB_CONTEXT_MEMBERS, ...GENERATED_CONTEXT_MEMBERS],
      asIs,
    ),
  }
}

function className(names: Names, model: DMMF.Model) {
  return names.classes.get(model.name) ?? model.name
}

function enumName(names: Names, name: string) {
  return names.enums.get(name) ?? name
}

function propertyName(names: Names, model: DMMF.Model, fieldName: string) {
  return names.properties.get(model.name)?.get(fieldName) ?? fieldName
}

function generatedRef(names: Names, name: string) {
  return `${names.namespace}.${name}`
}

function modelType(names: Names, model: DMMF.Model) {
  return typeRef(generatedRef(names, className(names, model)))
}

type TemporalKind = 'timestamp' | 'timestamptz' | 'date' | 'time' | 'timetz'

type ClrMapping = {
  /** The C# type of one value — of each element, for a list. */
  readonly clr: string
  readonly isValueType: boolean
  /** Fluent calls that describe the column of a scalar field. */
  readonly facets: readonly string[]
  /** The element's store type, for a list column that needs `HasColumnType("<type>[]")`. */
  readonly elementStoreType: string | null
  readonly temporal: TemporalKind | null
}

function mapping(
  clr: string,
  isValueType: boolean,
  facets: readonly string[] = [],
  elementStoreType: string | null = null,
  temporal: TemporalKind | null = null,
): ClrMapping {
  return { clr, isValueType, facets, elementStoreType, temporal }
}

function columnType(storeType: string) {
  return `.HasColumnType(${csharpString(storeType)})`
}

function lengthArg(args: readonly string[]) {
  const [length] = args
  return length !== undefined && /^\d+$/u.test(length) ? length : null
}

// The column of each Prisma type, described as `dotnet ef dbcontext scaffold` describes the same
// column with Npgsql: nothing where Npgsql maps the CLR type to that column already, a facet (max
// length, precision) where that is enough, the store type otherwise.
function postgresMapping(field: DMMF.Field, names: Names) {
  if (field.kind === 'enum') {
    return mapping(typeRef(generatedRef(names, enumName(names, field.type))), true)
  }
  return (field.nativeType ? nativeMapping(...field.nativeType) : null) ?? scalarMapping(field.type)
}

function nativeMapping(nativeName: string, args: readonly string[]) {
  const length = lengthArg(args)
  switch (nativeName) {
    case 'Text':
      return mapping('string', false)
    case 'VarChar':
      return length
        ? mapping('string', false, [`.HasMaxLength(${length})`], `character varying(${length})`)
        : mapping('string', false, [columnType('character varying')], 'character varying')
    case 'Char':
      return mapping(
        'string',
        false,
        [`.HasMaxLength(${length ?? '1'})`, '.IsFixedLength()'],
        `character(${length ?? '1'})`,
      )
    case 'Citext':
      return mapping('string', false, [columnType('citext')], 'citext')
    case 'Xml':
      return mapping('string', false, [columnType('xml')], 'xml')
    case 'Uuid':
      return mapping(typeRef(CS.Guid), true)
    // IPAddress would drop the netmask an inet column can hold; NpgsqlInet keeps it.
    case 'Inet':
      return mapping(typeRef(CS.NpgsqlInet), true)
    case 'Bit': {
      const storeType = `bit(${length ?? '1'})`
      return mapping(typeRef(CS.BitArray), false, [columnType(storeType)], storeType)
    }
    case 'VarBit':
      return length
        ? mapping(
            typeRef(CS.BitArray),
            false,
            [`.HasMaxLength(${length})`],
            `bit varying(${length})`,
          )
        : mapping(typeRef(CS.BitArray), false)
    case 'SmallInt':
      return mapping('short', true)
    case 'Integer':
      return mapping('int', true)
    case 'Oid':
      return mapping('uint', true, [columnType('oid')], 'oid')
    case 'BigInt':
      return mapping('long', true)
    case 'Real':
      return mapping('float', true)
    case 'DoublePrecision':
      return mapping('double', true)
    case 'Money':
      return mapping('decimal', true, [columnType('money')], 'money')
    case 'Decimal': {
      const [precision, scale] = args
      return precision !== undefined && scale !== undefined
        ? mapping(
            'decimal',
            true,
            [`.HasPrecision(${precision}, ${scale})`],
            `numeric(${precision},${scale})`,
          )
        : mapping('decimal', true)
    }
    case 'Timestamp': {
      const storeType = length
        ? `timestamp(${length}) without time zone`
        : 'timestamp without time zone'
      return mapping(typeRef(CS.DateTime), true, [columnType(storeType)], storeType, 'timestamp')
    }
    case 'Timestamptz':
      return length
        ? mapping(
            typeRef(CS.DateTime),
            true,
            [`.HasPrecision(${length})`],
            `timestamp(${length}) with time zone`,
            'timestamptz',
          )
        : mapping(typeRef(CS.DateTime), true, [], null, 'timestamptz')
    case 'Date':
      return mapping(typeRef(CS.DateOnly), true, [], null, 'date')
    case 'Time':
      return length
        ? mapping(
            typeRef(CS.TimeOnly),
            true,
            [`.HasPrecision(${length})`],
            `time(${length}) without time zone`,
            'time',
          )
        : mapping(typeRef(CS.TimeOnly), true, [], null, 'time')
    case 'Timetz': {
      const storeType = length ? `time(${length}) with time zone` : 'time with time zone'
      return mapping(typeRef(CS.DateTimeOffset), true, [columnType(storeType)], storeType, 'timetz')
    }
    case 'Json':
      return mapping('string', false, [columnType('json')], 'json')
    case 'JsonB':
      return mapping('string', false, [columnType('jsonb')], 'jsonb')
    case 'ByteA':
      return mapping('byte[]', false)
    case 'Boolean':
      return mapping('bool', true)
    default:
      return null
  }
}

function scalarMapping(type: string) {
  switch (type) {
    case 'Int':
      return mapping('int', true)
    case 'BigInt':
      return mapping('long', true)
    case 'Float':
      return mapping('double', true)
    case 'Decimal':
      return mapping('decimal', true, ['.HasPrecision(65, 30)'], 'numeric(65,30)')
    case 'Boolean':
      return mapping('bool', true)
    case 'DateTime':
      return mapping(
        typeRef(CS.DateTime),
        true,
        [columnType('timestamp(3) without time zone')],
        'timestamp(3) without time zone',
        'timestamp',
      )
    case 'Json':
      return mapping('string', false, [columnType('jsonb')], 'jsonb')
    case 'Bytes':
      return mapping('byte[]', false)
    default:
      return mapping('string', false)
  }
}

type ValueGeneratorKind =
  | { readonly kind: 'uuid'; readonly version: 4 | 7; readonly clr: 'string' | 'Guid' }
  | { readonly kind: 'ulid' }
  | { readonly kind: 'cuid'; readonly version: 1 | 2 }
  | { readonly kind: 'nanoid'; readonly size: number }

function generatorKey(generator: ValueGeneratorKind) {
  if (generator.kind === 'uuid') {
    return `UuidV${generator.version}${generator.clr === 'Guid' ? 'Guid' : 'String'}Generator`
  }
  if (generator.kind === 'ulid') return 'UlidGenerator'
  if (generator.kind === 'cuid') return generator.version === 2 ? 'Cuid2Generator' : 'CuidGenerator'
  return `Nanoid${generator.size}Generator`
}

function valueGeneratorOf(field: DMMF.Field, clr: ClrMapping): ValueGeneratorKind | null {
  if (!isFunctionDefault(field.default) || field.isList) return null
  const isGuid = clr.clr === typeRef(CS.Guid)
  const isString = clr.clr === 'string'
  const [arg] = field.default.args
  switch (field.default.name) {
    case 'uuid':
      return isGuid || isString
        ? { kind: 'uuid', version: arg === 7 ? 7 : 4, clr: isGuid ? 'Guid' : 'string' }
        : null
    case 'ulid':
      return isString ? { kind: 'ulid' } : null
    case 'cuid':
      return isString ? { kind: 'cuid', version: arg === 2 ? 2 : 1 } : null
    case 'nanoid':
      return isString
        ? { kind: 'nanoid', size: typeof arg === 'number' && arg > 0 ? arg : 21 }
        : null
    default:
      return null
  }
}

function integerLiteral(value: string | number | boolean) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null
}

function doubleLiteral(value: number) {
  const text = String(value)
  return /^-?\d+$/u.test(text) ? `${text}.0` : text
}

function clockArgs(moment: ReturnType<typeof shift>) {
  const millisecond = Math.trunc(moment.microsecond / 1000)
  const microsecond = moment.microsecond % 1000
  return [
    moment.hour,
    moment.minute,
    moment.second,
    millisecond,
    ...(microsecond > 0 ? [microsecond] : []),
  ]
}

// A timestamp default as the value Prisma Client writes for it: the instant the literal names, in
// UTC — the UTC clock in a column without a time zone, the UTC date in a date column. (The DEFAULT
// Prisma Migrate writes is the literal itself, which PostgreSQL reads with the offset dropped for
// those columns; see `defaultPlan`.)
function temporalLiteral(value: string, temporal: TemporalKind) {
  const parsed = parseDateTimeDefault(value)
  if (!parsed || temporal === 'timetz') return null
  const moment = shift(parsed, parsed.offsetMinutes)
  if (moment.year > 9999) return null
  if (temporal === 'date') {
    return `new ${typeRef(CS.DateOnly)}(${moment.year}, ${moment.month}, ${moment.day})`
  }
  if (temporal === 'time') return `new ${typeRef(CS.TimeOnly)}(${clockArgs(moment).join(', ')})`
  const kind = temporal === 'timestamptz' ? 'Utc' : 'Unspecified'
  return `new ${typeRef(CS.DateTime)}(${[moment.year, moment.month, moment.day, ...clockArgs(moment)].join(', ')}, ${exprRef(CS.DateTimeKind)}.${kind})`
}

// A default as a C# expression of the property's type, or null when the value has no spelling
// here that is sure to mean what the column's default means.
function literal(
  value: string | number | boolean,
  field: DMMF.Field,
  clr: ClrMapping,
  names: Names,
  enums: readonly DMMF.DatamodelEnum[],
) {
  if (field.kind === 'enum') {
    const isKnown = enums.find((e) => e.name === field.type)?.values.some((v) => v.name === value)
    const member = names.enumMembers.get(field.type)?.get(String(value))
    return isKnown && member
      ? `${exprRef(generatedRef(names, enumName(names, field.type)))}.${member}`
      : null
  }
  if (clr.temporal !== null) {
    return typeof value === 'string' ? temporalLiteral(value, clr.temporal) : null
  }
  switch (clr.clr) {
    case 'string':
      return typeof value === 'string' ? csharpString(value) : null
    case 'bool':
      return typeof value === 'boolean' ? String(value) : null
    case 'int':
      return integerLiteral(value)
    case 'short': {
      const text = integerLiteral(value)
      return text === null ? null : `(short)${text}`
    }
    case 'uint': {
      const text = integerLiteral(value)
      return text === null || text.startsWith('-') ? null : `${text}u`
    }
    // DMMF carries a BigInt default as a string of digits when it is past 2^53.
    case 'long':
      return /^-?\d+$/u.test(String(value)) ? `${value}L` : null
    case 'double':
      return typeof value === 'number' ? doubleLiteral(value) : null
    case 'float':
      return typeof value === 'number' ? `${value}f` : null
    case 'decimal':
      return /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/iu.test(String(value)) ? `${value}m` : null
    // A Bytes default is the base64 of the bytes.
    case 'byte[]':
      return typeof value === 'string'
        ? `${exprRef(CS.Convert)}.FromBase64String(${csharpString(value)})`
        : null
    default:
      break
  }
  if (clr.clr === typeRef(CS.Guid) && typeof value === 'string') {
    return `new ${typeRef(CS.Guid)}(${csharpString(value)})`
  }
  return null
}

type DefaultPlan =
  /** A value the property starts out with; the column's DEFAULT is `sql` when it is given. */
  | { readonly kind: 'literal'; readonly expr: string; readonly sql: string | null }
  | { readonly kind: 'sql'; readonly sql: string }
  | { readonly kind: 'generated' }
  | { readonly kind: 'autoincrement' }
  | { readonly kind: 'generator'; readonly generator: ValueGeneratorKind }
  /** A generated value the property starts out with, the database having no default for it. */
  | { readonly kind: 'initializer'; readonly generator: ValueGeneratorKind }

function defaultPlan(
  field: DMMF.Field,
  clr: ClrMapping,
  names: Names,
  enums: readonly DMMF.DatamodelEnum[],
): DefaultPlan | null {
  const def = field.default
  if (def === undefined || def === null) return null
  if (isFunctionDefault(def)) {
    const [arg] = def.args
    if (def.name === 'autoincrement') return { kind: 'autoincrement' }
    if (def.name === 'now') return { kind: 'sql', sql: 'CURRENT_TIMESTAMP' }
    if (def.name === 'dbgenerated') {
      return typeof arg === 'string' && arg.length > 0
        ? { kind: 'sql', sql: arg }
        : { kind: 'generated' }
    }
    const generator = valueGeneratorOf(field, clr)
    if (!generator) return null
    // A value generator fires for a property left null. That is what leaving a required field out
    // means, but an optional field can be set to null on purpose, which Prisma stores as NULL; so an
    // optional field starts out with its generated value instead, and null stays NULL.
    return field.isRequired ? { kind: 'generator', generator } : { kind: 'initializer', generator }
  }
  // A timestamp literal means one thing to Prisma Client and another to the DEFAULT clause Prisma
  // Migrate writes for it, so the column keeps the literal verbatim while the property holds what
  // Prisma Client would write.
  const isTemporal = clr.temporal !== null
  if (isListDefault(def)) {
    const elements = def.map((value) => literal(value, field, clr, names, enums))
    const sqlValues = def.map((value) => (isTemporal ? sqlTimestamp(value) : String(value)))
    if (!elements.every((element) => element !== null)) {
      return { kind: 'sql', sql: sqlArray(sqlValues) }
    }
    const listType = `${typeRef(CS.List)}<${clr.clr}>`
    return {
      kind: 'literal',
      expr:
        elements.length === 0 ? `new ${listType}()` : `new ${listType} { ${elements.join(', ')} }`,
      sql: isTemporal ? sqlArray(sqlValues) : null,
    }
  }
  const expr = literal(def, field, clr, names, enums)
  if (expr !== null) {
    return { kind: 'literal', expr, sql: isTemporal ? sqlString(sqlTimestamp(def)) : null }
  }
  // A value with no trusted C# spelling (a bit string, a time with a time zone) stays a database
  // default: EF Core then leaves the column out of an INSERT for a new entity.
  const text = isTemporal ? sqlTimestamp(def) : String(def)
  return { kind: 'sql', sql: typeof def === 'string' ? sqlString(text) : text }
}

function isSystemNamespace(name: string) {
  return name === 'System' || name.startsWith('System.')
}

// `dotnet format`'s order: System namespaces first, then the rest, each alphabetically.
function compareUsings(left: string, right: string) {
  if (isSystemNamespace(left) !== isSystemNamespace(right)) return isSystemNamespace(left) ? -1 : 1
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Resolves the type placeholders of an assembled file and puts its header on.
 *
 * @param body - The file below its `namespace` line.
 * @param scope - The namespace, the simple names of the generated types (which a same-named
 *   framework type would lose to) and, per offset, the members an expression there sees.
 * @returns The finished file.
 */
function renderFile(
  body: string,
  scope: {
    readonly namespace: string
    readonly types: ReadonlySet<string>
    readonly usings?: readonly string[]
    readonly membersAt: (offset: number) => ReadonlyMap<string, string | null>
  },
) {
  const matches = [...body.matchAll(/\0([TE])\|([^\0]+)\0/gu)]
  const resolved = matches.map((match) => {
    const [, kind, fullName] = match
    const dot = fullName.lastIndexOf('.')
    const simple = fullName.slice(dot + 1)
    const namespace = fullName.slice(0, dot)
    const isGenerated = namespace === scope.namespace
    const members = scope.membersAt(match.index)
    // A member named like the type binds instead of it in an expression — unless the member is of
    // that very type, where C# lets `Status.Active` still mean the type ("Color Color").
    const isShadowedByMember =
      kind === 'E' && members.has(simple) && members.get(simple) !== fullName
    const isShadowed = isShadowedByMember || (!isGenerated && scope.types.has(simple))
    return {
      text: isShadowed ? `global::${fullName}` : simple,
      using: isShadowed || isGenerated ? null : namespace,
    }
  })
  const assembled = matches.reduce(
    (acc, match, index) => ({
      text: `${acc.text}${body.slice(acc.cursor, match.index)}${resolved[index].text}`,
      cursor: match.index + match[0].length,
    }),
    { text: '', cursor: 0 },
  )
  const usings = [
    ...new Set([
      ...(scope.usings ?? []),
      ...resolved.map((r) => r.using).filter((u) => u !== null),
    ]),
  ].toSorted(compareUsings)
  return [
    '#nullable enable',
    '',
    ...(usings.length > 0 ? [...usings.map((u) => `using ${u};`), ''] : []),
    `namespace ${scope.namespace};`,
    '',
    `${assembled.text}${body.slice(assembled.cursor)}`,
  ].join('\n')
}

function chain(head: string, calls: readonly string[], indent: string) {
  if (calls.length <= 1) return [`${indent}${head}${calls.join('')};`]
  return [
    `${indent}${head}`,
    ...calls.map((call, index) => `${indent}    ${call}${index === calls.length - 1 ? ';' : ''}`),
  ]
}

function keyLambda(parameter: string, properties: readonly string[]) {
  return properties.length === 1
    ? `${parameter} => ${parameter}.${properties[0]}`
    : `${parameter} => new { ${properties.map((p) => `${parameter}.${p}`).join(', ')} }`
}

function joinBlocks(blocks: readonly (readonly string[])[]) {
  return (
    blocks
      .filter((block) => block.length > 0)
      // oxlint-disable-next-line oxc/no-map-spread -- one blank separator per block, not an accumulator
      .flatMap((block, index) => (index === 0 ? block : ['', ...block]))
  )
}

/** Everything the files are written from: the schema, what it implies, and the C# names. */
export type EfCorePlan = {
  readonly names: Names
  readonly models: readonly DMMF.Model[]
  readonly enums: readonly DMMF.DatamodelEnum[]
  readonly indexesOf: (model: DMMF.Model) => readonly IndexInfo[]
  readonly foreignKeys: readonly ForeignKey[]
  readonly manyToMany: readonly ManyToMany[]
}

function scalarFields(model: DMMF.Model) {
  return model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum')
}

function fieldPlan(plan: EfCorePlan, field: DMMF.Field) {
  const clr = postgresMapping(field, plan.names)
  return { clr, def: defaultPlan(field, clr, plan.names, plan.enums) }
}

function valueGenerators(plan: Omit<EfCorePlan, 'names'> & { readonly names: Names }) {
  return [
    ...new Map(
      plan.models.flatMap((model) =>
        scalarFields(model).flatMap((field) => {
          const { def } = fieldPlan(plan, field)
          return def?.kind === 'generator'
            ? [[generatorKey(def.generator), def.generator] as const]
            : []
        }),
      ),
    ).entries(),
  ]
}

/**
 * Reads the schema into what the files are written from.
 *
 * @param datamodel - The DMMF datamodel.
 * @param options - The namespace and the DbContext class name.
 * @returns The plan the file writers take.
 */
export function planEfCore(
  datamodel: {
    readonly models: readonly DMMF.Model[]
    readonly enums: readonly DMMF.DatamodelEnum[]
    readonly indexes?: readonly DMMF.Index[]
  },
  options: { readonly namespace: string; readonly context: string },
): EfCorePlan {
  const indexesOf = (model: DMMF.Model) => modelIndexes(model, datamodel.indexes ?? [])
  const schema = {
    models: datamodel.models,
    enums: datamodel.enums,
    indexesOf,
    foreignKeys: foreignKeys(datamodel.models, indexesOf),
    manyToMany: manyToManyRelations(datamodel.models),
  }
  // The value generators become classes of their own, so their names join the other type names —
  // and which of them the schema needs is only known once its fields have been read.
  const preliminary = {
    ...schema,
    names: planNames(datamodel.models, datamodel.enums, [], options),
  }
  const generatorKeys = valueGenerators(preliminary).map(([key]) => key)
  return { ...schema, names: planNames(datamodel.models, datamodel.enums, generatorKeys, options) }
}

function generatedTypes(plan: EfCorePlan) {
  return new Set([
    plan.names.context,
    ...plan.names.classes.values(),
    ...plan.names.enums.values(),
    ...plan.names.generators.values(),
  ])
}

// The type a property holds when that is exactly one named type: not nullable, not a collection.
function memberType(plan: EfCorePlan, field: DMMF.Field) {
  if (field.isList || !field.isRequired) return null
  if (field.kind === 'object') {
    const target = plan.models.find((m) => m.name === field.type)
    return target ? generatedRef(plan.names, className(plan.names, target)) : null
  }
  const match = /^\0T\|([^\0]+)\0$/u.exec(fieldPlan(plan, field).clr.clr)
  return match ? match[1] : null
}

function entityProperty(plan: EfCorePlan, model: DMMF.Model, field: DMMF.Field) {
  const name = propertyName(plan.names, model, field.name)
  if (field.kind === 'object') {
    const target = plan.models.find((m) => m.name === field.type)
    const targetType = target
      ? modelType(plan.names, target)
      : typeRef(generatedRef(plan.names, field.type))
    if (field.isList) {
      return [
        `    public virtual ${typeRef(CS.ICollection)}<${targetType}> ${name} { get; set; } = new ${typeRef(CS.List)}<${targetType}>();`,
      ]
    }
    return field.isRequired
      ? [`    public virtual ${targetType} ${name} { get; set; } = null!;`]
      : [`    public virtual ${targetType}? ${name} { get; set; }`]
  }
  const { clr, def } = fieldPlan(plan, field)
  const type = field.isList
    ? `${typeRef(CS.List)}<${clr.clr}>?`
    : field.isRequired
      ? clr.clr
      : `${clr.clr}?`
  const initializer =
    def?.kind === 'literal'
      ? ` = ${def.expr};`
      : def?.kind === 'initializer'
        ? ` = ${nextValue(def.generator)};`
        : !field.isList && field.isRequired && !clr.isValueType
          ? ' = null!;'
          : ''
  const line = `    public ${type} ${name} { get; set; }${initializer}`
  return def?.kind === 'initializer' ? withCuidV1(def.generator, [line]) : [line]
}

/**
 * The entity class of a model.
 *
 * @param plan - The plan.
 * @param model - The model.
 * @returns The file, as `{ fileName, code }`.
 */
export function entityFile(plan: EfCorePlan, model: DMMF.Model) {
  const name = className(plan.names, model)
  const fields = model.fields.filter((f) => f.kind !== 'unsupported')
  const body = [
    `public partial class ${name}`,
    '{',
    ...joinBlocks(fields.map((f) => entityProperty(plan, model, f))),
    '}',
    '',
  ].join('\n')
  const members = new Map(
    fields.map((f) => [propertyName(plan.names, model, f.name), memberType(plan, f)]),
  )
  return {
    fileName: `${name}.cs`,
    code: renderFile(body, {
      namespace: plan.names.namespace,
      types: generatedTypes(plan),
      membersAt: () => members,
    }),
  }
}

/**
 * The C# enum of a Prisma enum. Each member names its PostgreSQL label through `[PgName]`, which
 * is how Npgsql maps it — the label is the value's `@map`, or its name.
 *
 * @param plan - The plan.
 * @param e - The enum.
 * @returns The file, as `{ fileName, code }`.
 */
export function enumFile(plan: EfCorePlan, e: DMMF.DatamodelEnum) {
  const name = enumName(plan.names, e.name)
  const members = e.values.map((value) => [
    `    [${typeRef(CS.PgName)}(${csharpString(value.dbName ?? value.name)})]`,
    `    ${plan.names.enumMembers.get(e.name)?.get(value.name) ?? value.name},`,
  ])
  const body = [`public enum ${name}`, '{', ...joinBlocks(members), '}', ''].join('\n')
  return {
    fileName: `${name}.cs`,
    code: renderFile(body, {
      namespace: plan.names.namespace,
      types: generatedTypes(plan),
      membersAt: () => new Map(),
    }),
  }
}

function valueGenerationCalls(
  plan: EfCorePlan,
  def: DefaultPlan | null,
  isConventionallyGenerated: boolean,
) {
  if (def === null) return isConventionallyGenerated ? ['.ValueGeneratedNever()'] : []
  if (def.kind === 'autoincrement') {
    return [...(isConventionallyGenerated ? [] : ['.ValueGeneratedOnAdd()']), '.UseSerialColumn()']
  }
  if (def.kind === 'generated') return ['.ValueGeneratedOnAdd()']
  if (def.kind === 'generator') {
    return [`.HasValueGenerator<${plan.names.generators.get(generatorKey(def.generator))}>()`]
  }
  // The property starts out holding its default, so EF Core writes whatever it holds — an explicit
  // 0 or false included — instead of leaving a CLR default to the database.
  if (def.kind === 'literal') return ['.ValueGeneratedNever()']
  return []
}

function propertyConfig(
  plan: EfCorePlan,
  model: DMMF.Model,
  field: DMMF.Field,
  key: readonly string[],
) {
  const { clr, def } = fieldPlan(plan, field)
  const name = propertyName(plan.names, model, field.name)
  // EF Core generates a value on insert for a lone numeric or Guid key by convention.
  const isConventionallyGenerated =
    key.length === 1 &&
    key[0] === field.name &&
    !field.isList &&
    ['int', 'long', 'short', 'uint', typeRef(CS.Guid)].includes(clr.clr)
  const valueGeneration = valueGenerationCalls(plan, def, isConventionallyGenerated)
  const facets = field.isList
    ? clr.elementStoreType === null
      ? []
      : [columnType(`${clr.elementStoreType}[]`)]
    : clr.facets
  const column = columnName(field)
  // Npgsql makes an integer property that is generated on insert an identity column; one the
  // database fills some other way (a trigger, say) is left as the column Prisma creates.
  const isTriggerFilledInteger =
    def?.kind === 'generated' && !field.isList && ['int', 'long', 'short'].includes(clr.clr)
  const calls = [
    ...valueGeneration,
    ...facets.filter((f) => !f.startsWith('.HasColumnType')),
    ...(def?.kind === 'literal' && def.sql === null ? [`.HasDefaultValue(${def.expr})`] : []),
    ...((def?.kind === 'literal' || def?.kind === 'sql') && def.sql !== null
      ? [`.HasDefaultValueSql(${csharpString(def.sql)})`]
      : []),
    ...facets.filter((f) => f.startsWith('.HasColumnType')),
    ...(column === name ? [] : [`.HasColumnName(${csharpString(column)})`]),
    ...(isTriggerFilledInteger
      ? [`.Metadata.SetValueGenerationStrategy(${exprRef(CS.NpgsqlValueGenerationStrategy)}.None)`]
      : []),
  ]
  return calls.length === 0 ? [] : chain(`entity.Property(e => e.${name})`, calls, '            ')
}

/**
 * Prisma's `onDelete` as the EF Core `DeleteBehavior` that behaves the same.
 *
 * Without `onDelete`, Prisma restricts the delete of a required relation and sets an optional one
 * to null. `Restrict` and `NoAction` keep EF Core's `Restrict` / `NoAction` on a required relation,
 * where EF Core refuses the delete as the database would; on an optional relation those two have EF
 * Core set the foreign keys of the dependents it tracks to null and delete the principal anyway, so
 * `ClientNoAction` leaves the decision to the database instead — as for `SetDefault`, which EF Core
 * cannot express.
 *
 * @param onDelete - The referential action, as DMMF carries it.
 * @param isRequired - Whether the foreign key is required.
 * @returns A member of `DeleteBehavior`.
 */
export function deleteBehavior(onDelete: string | undefined, isRequired: boolean) {
  const action = onDelete ?? (isRequired ? 'Restrict' : 'SetNull')
  if (action === 'Cascade' || action === 'SetNull') return action
  if (isRequired && (action === 'Restrict' || action === 'NoAction')) return action
  return 'ClientNoAction'
}

function relationConfig(plan: EfCorePlan, fk: ForeignKey) {
  const names = plan.names
  const dependentProperty = (field: string) => propertyName(names, fk.dependent, field)
  const isOneToOne = fk.inverse !== undefined && !fk.inverse.isList
  const withCall = `.With${isOneToOne ? 'One' : 'Many'}(${
    fk.inverse ? `p => p.${propertyName(names, fk.principal, fk.inverse.name)}` : ''
  })`
  const isRequired = fk.pairs.every(
    (pair) => fk.dependent.fields.find((f) => f.name === pair.from)?.isRequired === true,
  )
  const principalKey = fk.alternateKey
    ? [
        `.HasPrincipalKey${isOneToOne ? `<${modelType(names, fk.principal)}>` : ''}(${keyLambda(
          'p',
          fk.pairs.map((pair) => propertyName(names, fk.principal, pair.to)),
        )})`,
      ]
    : []
  // Prisma names the constraint after the columns in the order `fields` lists them.
  const constraint = prismaConstraintName(
    [
      tableName(fk.dependent),
      ...(fk.navigation.relationFromFields ?? []).map((from) => {
        const field = fk.dependent.fields.find((f) => f.name === from)
        return field ? columnName(field) : from
      }),
    ].join('_'),
    '_fkey',
  )
  const calls = [
    ...principalKey,
    `.HasForeignKey${isOneToOne ? `<${modelType(names, fk.dependent)}>` : ''}(${keyLambda(
      'd',
      fk.pairs.map((pair) => dependentProperty(pair.from)),
    )})`,
    `.OnDelete(${exprRef(CS.DeleteBehavior)}.${deleteBehavior(fk.navigation.relationOnDelete, isRequired)})`,
    `.HasConstraintName(${csharpString(constraint)})`,
  ]
  return [
    `            entity.HasOne(d => d.${dependentProperty(fk.navigation.name)})${withCall}`,
    ...calls.map(
      (call, index) => `                ${call}${index === calls.length - 1 ? ';' : ''}`,
    ),
  ]
}

function manyToManyConfig(plan: EfCorePlan, m2m: ManyToMany) {
  const names = plan.names
  const table = prismaConstraintName(`_${m2m.relationName}`, '')
  const joinName = (suffix: string) => csharpString(prismaConstraintName(table, suffix))
  const cascade = `${exprRef(CS.DeleteBehavior)}.Cascade`
  const toTable = m2m.a.model.schema
    ? `j.ToTable(${csharpString(table)}, ${csharpString(m2m.a.model.schema)});`
    : `j.ToTable(${csharpString(table)});`
  return [
    `            entity.HasMany(d => d.${propertyName(names, m2m.a.model, m2m.a.field.name)}).WithMany(p => p.${propertyName(names, m2m.b.model, m2m.b.field.name)})`,
    `                .UsingEntity<${typeRef(CS.Dictionary)}<string, object>>(`,
    `                    ${csharpString(table)},`,
    `                    r => r.HasOne<${modelType(names, m2m.b.model)}>().WithMany()`,
    '                        .HasForeignKey("B")',
    `                        .OnDelete(${cascade})`,
    `                        .HasConstraintName(${joinName('_B_fkey')}),`,
    `                    l => l.HasOne<${modelType(names, m2m.a.model)}>().WithMany()`,
    '                        .HasForeignKey("A")',
    `                        .OnDelete(${cascade})`,
    `                        .HasConstraintName(${joinName('_A_fkey')}),`,
    '                    j =>',
    '                    {',
    `                        j.HasKey("A", "B").HasName(${joinName('_AB_pkey')});`,
    `                        ${toTable}`,
    `                        j.HasIndex(new[] { "B" }, ${joinName('_B_index')});`,
    '                    });',
  ]
}

function indexConfig(
  plan: EfCorePlan,
  model: DMMF.Model,
  index: IndexInfo,
  isAlternateKey: boolean,
) {
  const properties = fieldNames(index).map((f) => propertyName(plan.names, model, f))
  const name = csharpString(indexName(model, index))
  if (isAlternateKey) {
    return chain(
      `entity.HasAlternateKey(${keyLambda('e', properties)})`,
      [`.HasName(${name})`],
      '            ',
    )
  }
  const descending = index.fields.map((f) => f.sortOrder === 'desc')
  const method = index.algorithm === undefined ? undefined : INDEX_METHODS[index.algorithm]
  // Npgsql writes no operator class for a column given an empty one: that column keeps the default.
  const operators = index.fields.map((f) =>
    f.operatorClass === undefined
      ? ''
      : operatorClassName(
          f.operatorClass,
          model.fields.find((mf) => mf.name === f.name)?.nativeType?.[0],
        ),
  )
  const calls = [
    ...(index.type === 'unique' ? ['.IsUnique()'] : []),
    ...(descending.includes(true) ? [`.IsDescending(${descending.join(', ')})`] : []),
    ...(method === undefined ? [] : [`.HasMethod(${csharpString(method)})`]),
    ...(operators.some((operator) => operator !== '')
      ? [`.HasOperators(${operators.map(csharpString).join(', ')})`]
      : []),
  ]
  return chain(`entity.HasIndex(${keyLambda('e', properties)}, ${name})`, calls, '            ')
}

function entityConfig(plan: EfCorePlan, model: DMMF.Model) {
  const names = plan.names
  const indexes = plan.indexesOf(model)
  const key = entityKey(model, indexes)
  const keyFields = key ? fieldNames(key) : []
  const keyLine = key
    ? chain(
        `entity.HasKey(${keyLambda(
          'e',
          keyFields.map((f) => propertyName(names, model, f)),
        )})`,
        [`.HasName(${csharpString(indexName(model, key))})`],
        '            ',
      )
    : ['            entity.HasNoKey();']
  const table = model.schema
    ? `            entity.ToTable(${csharpString(tableName(model))}, ${csharpString(model.schema)});`
    : `            entity.ToTable(${csharpString(tableName(model))});`
  // A unique criterion another model's foreign key references is an alternate key to EF Core,
  // which enforces it with a unique constraint of that name in place of the unique index.
  const referencedKeys = plan.foreignKeys.flatMap((fk) =>
    fk.principal === model && fk.alternateKey ? [fieldNames(fk.alternateKey)] : [],
  )
  const indexBlocks = indexes
    .filter((index) => (index.type === 'unique' || index.type === 'normal') && index !== key)
    .map((index) =>
      indexConfig(
        plan,
        model,
        index,
        index.type === 'unique' &&
          referencedKeys.some((fields) => isSameFieldSet(fields, fieldNames(index))),
      ),
    )
  return [
    `        modelBuilder.Entity<${modelType(names, model)}>(entity =>`,
    '        {',
    ...joinBlocks([
      keyLine,
      [table],
      ...indexBlocks,
      scalarFields(model).flatMap((field) => propertyConfig(plan, model, field, keyFields)),
      ...plan.foreignKeys
        .filter((fk) => fk.dependent === model)
        .map((fk) => relationConfig(plan, fk)),
      ...plan.manyToMany
        .filter((m2m) => m2m.a.model === model)
        .map((m2m) => manyToManyConfig(plan, m2m)),
    ]),
    '        });',
  ]
}

function updatedAtValue(clr: ClrMapping) {
  if (clr.temporal === 'timestamptz') return 'now'
  if (clr.temporal === 'date') return `${exprRef(CS.DateOnly)}.FromDateTime(now)`
  if (clr.temporal === 'time') return `${exprRef(CS.TimeOnly)}.FromDateTime(now)`
  if (clr.temporal === 'timetz') return `new ${typeRef(CS.DateTimeOffset)}(now)`
  // Npgsql writes a DateTime to a column without a time zone only when it is not marked UTC; the
  // value is UTC all the same, as Prisma writes it.
  return `${exprRef(CS.DateTime)}.SpecifyKind(now, ${exprRef(CS.DateTimeKind)}.Unspecified)`
}

// Prisma sets an @updatedAt field on every write of the row, unless the write sets it.
function stampUpdatedAt(plan: EfCorePlan) {
  const state = exprRef(CS.EntityState)
  const blocks = plan.models.flatMap((model) => {
    const fields = scalarFields(model).filter((field) => field.isUpdatedAt === true)
    if (fields.length === 0) return []
    const stamps = fields.map((field) => {
      const name = propertyName(plan.names, model, field.name)
      return [
        `            if ((entry.State == ${state}.Added && entry.Entity.${name} == default)`,
        `                || (entry.State == ${state}.Modified && !entry.Property(e => e.${name}).IsModified))`,
        '            {',
        `                entry.Entity.${name} = ${updatedAtValue(fieldPlan(plan, field).clr)};`,
        '            }',
      ]
    })
    return [
      [
        `        foreach (var entry in ChangeTracker.Entries<${modelType(plan.names, model)}>())`,
        '        {',
        ...joinBlocks(stamps),
        '        }',
      ],
    ]
  })
  if (blocks.length === 0) return []
  return [
    '    public override int SaveChanges(bool acceptAllChangesOnSuccess)',
    '    {',
    '        StampUpdatedAt();',
    '        return base.SaveChanges(acceptAllChangesOnSuccess);',
    '    }',
    '',
    `    public override ${typeRef(CS.Task)}<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, ${typeRef(CS.CancellationToken)} cancellationToken = default)`,
    '    {',
    '        StampUpdatedAt();',
    '        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);',
    '    }',
    '',
    '    private void StampUpdatedAt()',
    '    {',
    `        var now = ${exprRef(CS.DateTime)}.UtcNow;`,
    ...joinBlocks(blocks),
    '    }',
  ]
}

function nextValue(generator: ValueGeneratorKind) {
  if (generator.kind === 'uuid') {
    const guid = `${exprRef(CS.Guid)}.${generator.version === 7 ? 'CreateVersion7' : 'NewGuid'}()`
    return generator.clr === 'Guid' ? guid : `${guid}.ToString()`
  }
  if (generator.kind === 'ulid') return `${exprRef(CS.Ulid)}.NewUlid().ToString()`
  if (generator.kind === 'cuid') {
    return generator.version === 2
      ? `new ${typeRef(CS.Cuid2)}().ToString()`
      : `${exprRef(CS.Cuid)}.NewCuid().ToString()`
  }
  // Nano ID's alphabet: the 64 URL-safe characters, drawn from a cryptographic source.
  return `${exprRef(CS.RandomNumberGenerator)}.GetString("_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", ${generator.size})`
}

// Prisma's cuid() is CUID v1, which cuid.net marks obsolete in favour of CUID2.
function withCuidV1(generator: ValueGeneratorKind, lines: readonly string[]) {
  return generator.kind === 'cuid' && generator.version === 1
    ? ['#pragma warning disable VISLIB0001', ...lines, '#pragma warning restore VISLIB0001']
    : lines
}

function generatorClass(name: string, generator: ValueGeneratorKind) {
  const valueType =
    generator.kind === 'uuid' && generator.clr === 'Guid' ? typeRef(CS.Guid) : 'string'
  const next = nextValue(generator)
  const nextLine = `    public override ${valueType} Next(${typeRef(CS.EntityEntry)} entry) => ${next};`
  return [
    `file sealed class ${name} : ${typeRef(CS.ValueGenerator)}<${valueType}>`,
    '{',
    '    public override bool GeneratesTemporaryValues => false;',
    '',
    ...withCuidV1(generator, [nextLine]),
    '}',
  ]
}

/**
 * The DbContext: a DbSet per model, the Fluent API mapping of every model onto the tables Prisma
 * Migrate creates, the enum mappings Npgsql needs, @updatedAt, and the value generators of
 * `uuid()`, `ulid()`, `cuid()` and `nanoid()`.
 *
 * @param plan - The plan.
 * @returns The file, as `{ fileName, code }`.
 */
export function contextFile(plan: EfCorePlan) {
  const names = plan.names
  const context = names.context
  const enumType = (e: DMMF.DatamodelEnum) => typeRef(generatedRef(names, enumName(names, e.name)))
  // EF Core rejects an OnConfiguring that changes the options of a pooled context
  // (AddDbContextPool), so the enum mappings Npgsql needs are handed to the code that configures it.
  const mapEnums = (parameter: string, type: string) => [
    `    public static void MapEnums(${typeRef(type)} ${parameter})`,
    '    {',
    ...plan.enums.map(
      (e) => `        ${parameter}.MapEnum<${enumType(e)}>(${csharpString(e.dbName ?? e.name)});`,
    ),
    '    }',
  ]
  const enumMappings = [
    ...mapEnums('npgsql', CS.NpgsqlDbContextOptionsBuilder),
    '',
    ...mapEnums('dataSource', CS.NpgsqlDataSourceBuilder),
    '',
  ]
  const updatedAt = stampUpdatedAt(plan)
  const classBody = [
    `public partial class ${context} : ${typeRef(CS.DbContext)}`,
    '{',
    `    public ${context}(${typeRef(CS.DbContextOptions)}<${context}> options)`,
    '        : base(options)',
    '    {',
    '    }',
    '',
    ...plan.models.flatMap((model) => [
      `    public virtual ${typeRef(CS.DbSet)}<${modelType(names, model)}> ${names.dbSets.get(model.name) ?? model.name} { get; set; }`,
      '',
    ]),
    ...enumMappings,
    // Prisma creates no index for a foreign key of its own accord; the indexes the schema declares
    // are mapped below.
    `    protected override void ConfigureConventions(${typeRef(CS.ModelConfigurationBuilder)} configurationBuilder)`,
    '    {',
    `        configurationBuilder.Conventions.Remove<${typeRef(CS.ForeignKeyIndexConvention)}>();`,
    '        ConfigureConventionsPartial(configurationBuilder);',
    '    }',
    '',
    `    partial void ConfigureConventionsPartial(${typeRef(CS.ModelConfigurationBuilder)} configurationBuilder);`,
    '',
    `    protected override void OnModelCreating(${typeRef(CS.ModelBuilder)} modelBuilder)`,
    '    {',
    ...joinBlocks([
      // MapEnum alone creates each type with its labels sorted, while PostgreSQL orders enum values
      // as they are declared; this states Prisma's declaration order.
      plan.enums.map(
        (e) =>
          `        modelBuilder.HasPostgresEnum<${enumType(e)}>(name: ${csharpString(e.dbName ?? e.name)});`,
      ),
      ...plan.models.map((model) => entityConfig(plan, model)),
      ['        OnModelCreatingPartial(modelBuilder);'],
    ]),
    '    }',
    '',
    `    partial void OnModelCreatingPartial(${typeRef(CS.ModelBuilder)} modelBuilder);`,
    ...(updatedAt.length > 0 ? ['', ...updatedAt] : []),
    '}',
    '',
  ].join('\n')
  const generators = valueGenerators(plan).map(([key, generator]) =>
    generatorClass(names.generators.get(key) ?? key, generator).join('\n'),
  )
  const body = generators.length > 0 ? `${classBody}\n${generators.join('\n\n')}\n` : classBody
  const contextMembers = new Map(
    [...names.dbSets.values(), ...DB_CONTEXT_MEMBERS, ...GENERATED_CONTEXT_MEMBERS].map(
      (member) => [member, null] as const,
    ),
  )
  return {
    fileName: `${context}.cs`,
    code: renderFile(body, {
      namespace: names.namespace,
      types: generatedTypes(plan),
      // The extension methods — UseNpgsql, HasPostgresEnum, ToTable, HasColumnType, ... — live in
      // this namespace, whether or not a type from it is named here.
      usings: ['Microsoft.EntityFrameworkCore'],
      membersAt: (offset) => (offset < classBody.length ? contextMembers : new Map()),
    }),
  }
}
