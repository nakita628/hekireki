import type { DMMF } from '@prisma/generator-helper'

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

// Generated Kotlin names a class through a placeholder: `\0T|java.time.Instant\0` where a type is
// expected, `\0E|...\0` where a class is the receiver of a call (`Instant.now()`), `\0F|...\0` for a
// top-level or extension function. Which simple names a file may use is only known once the file
// is assembled — a model or enum of the package, a class nested in Exposed's Table or a property of
// the class being written can take a name — so the placeholders are resolved last: to the simple
// name plus an import, or to the qualified name where the simple one would bind to something else.
// NUL never survives into emitted text otherwise (string literals escape it). A name that starts
// with a dot is one of the package being written.
const REF = '\u0000'

function typeRef(fullName: string) {
  return `${REF}T|${fullName}${REF}`
}

function exprRef(fullName: string) {
  return `${REF}E|${fullName}${REF}`
}

function funRef(fullName: string) {
  return `${REF}F|${fullName}${REF}`
}

function local(name: string) {
  return `.${name}`
}

const PLACEHOLDER = /\0([EFT])\|([^\0]+)\0/gu

const EXPOSED = 'org.jetbrains.exposed.v1'

const KT = {
  Any: 'kotlin.Any',
  Array: 'kotlin.Array',
  Boolean: 'kotlin.Boolean',
  ByteArray: 'kotlin.ByteArray',
  CharArray: 'kotlin.CharArray',
  Double: 'kotlin.Double',
  Enum: 'kotlin.Enum',
  Float: 'kotlin.Float',
  Int: 'kotlin.Int',
  List: 'kotlin.collections.List',
  Long: 'kotlin.Long',
  Number: 'kotlin.Number',
  Short: 'kotlin.Short',
  String: 'kotlin.String',
  Class: 'java.lang.Class',
  System: 'java.lang.System',
  BigDecimal: 'java.math.BigDecimal',
  SecureRandom: 'java.security.SecureRandom',
  SqlArray: 'java.sql.Array',
  ResultSet: 'java.sql.ResultSet',
  Instant: 'java.time.Instant',
  LocalDate: 'java.time.LocalDate',
  LocalDateTime: 'java.time.LocalDateTime',
  LocalTime: 'java.time.LocalTime',
  OffsetDateTime: 'java.time.OffsetDateTime',
  OffsetTime: 'java.time.OffsetTime',
  ZoneOffset: 'java.time.ZoneOffset',
  ChronoUnit: 'java.time.temporal.ChronoUnit',
  Base64: 'java.util.Base64',
  UUID: 'java.util.UUID',
  ArrayColumnType: `${EXPOSED}.core.ArrayColumnType`,
  BasicBinaryColumnType: `${EXPOSED}.core.BasicBinaryColumnType`,
  BooleanColumnType: `${EXPOSED}.core.BooleanColumnType`,
  CharColumnType: `${EXPOSED}.core.CharColumnType`,
  Column: `${EXPOSED}.core.Column`,
  ColumnType: `${EXPOSED}.core.ColumnType`,
  DecimalColumnType: `${EXPOSED}.core.DecimalColumnType`,
  DoubleColumnType: `${EXPOSED}.core.DoubleColumnType`,
  FloatColumnType: `${EXPOSED}.core.FloatColumnType`,
  Function: `${EXPOSED}.core.Function`,
  IColumnType: `${EXPOSED}.core.IColumnType`,
  IntegerColumnType: `${EXPOSED}.core.IntegerColumnType`,
  LongColumnType: `${EXPOSED}.core.LongColumnType`,
  Op: `${EXPOSED}.core.Op`,
  QueryBuilder: `${EXPOSED}.core.QueryBuilder`,
  ReferenceOption: `${EXPOSED}.core.ReferenceOption`,
  Schema: `${EXPOSED}.core.Schema`,
  ShortColumnType: `${EXPOSED}.core.ShortColumnType`,
  Table: `${EXPOSED}.core.Table`,
  TextColumnType: `${EXPOSED}.core.TextColumnType`,
  VarCharColumnType: `${EXPOSED}.core.VarCharColumnType`,
  CompositeID: `${EXPOSED}.core.dao.id.CompositeID`,
  CompositeIdTable: `${EXPOSED}.core.dao.id.CompositeIdTable`,
  EntityID: `${EXPOSED}.core.dao.id.EntityID`,
  IdTable: `${EXPOSED}.core.dao.id.IdTable`,
  UUIDColumnType: `${EXPOSED}.core.java.UUIDColumnType`,
  javaUUID: `${EXPOSED}.core.java.javaUUID`,
  PreparedStatementApi: `${EXPOSED}.core.statements.api.PreparedStatementApi`,
  RowApi: `${EXPOSED}.core.statements.api.RowApi`,
  CompositeEntity: `${EXPOSED}.dao.CompositeEntity`,
  CompositeEntityClass: `${EXPOSED}.dao.CompositeEntityClass`,
  Entity: `${EXPOSED}.dao.Entity`,
  EntityBatchUpdate: `${EXPOSED}.dao.EntityBatchUpdate`,
  EntityClass: `${EXPOSED}.dao.EntityClass`,
  JsonBColumnType: `${EXPOSED}.json.JsonBColumnType`,
  JsonColumnType: `${EXPOSED}.json.JsonColumnType`,
  json: `${EXPOSED}.json.json`,
  jsonb: `${EXPOSED}.json.jsonb`,
  UlidCreator: 'com.github.f4b6a3.ulid.UlidCreator',
  CUID: 'io.github.thibaultmeyer.cuid.CUID',
  buildList: 'kotlin.collections.buildList',
  emptyList: 'kotlin.collections.emptyList',
  error: 'kotlin.error',
  listOf: 'kotlin.collections.listOf',
  use: 'kotlin.use',
} as const

// Kotlin's hard keywords, which cannot name a declaration unless quoted in backticks. Soft and
// modifier keywords (`value`, `data`, `open`, ...) are identifiers everywhere a property is.
const KOTLIN_KEYWORDS = new Set([
  'as',
  'break',
  'class',
  'continue',
  'do',
  'else',
  'false',
  'for',
  'fun',
  'if',
  'in',
  'interface',
  'is',
  'null',
  'object',
  'package',
  'return',
  'super',
  'this',
  'throw',
  'true',
  'try',
  'typealias',
  'typeof',
  'val',
  'var',
  'when',
  'while',
])

/**
 * Checks a name written in the generator block — one segment of a package.
 *
 * @param name - The name as written.
 * @returns Whether it is an ASCII Kotlin identifier that is not a hard keyword.
 */
export function isKotlinIdentifier(name: string) {
  return /^[A-Z_a-z]\w*$/u.test(name) && !KOTLIN_KEYWORDS.has(name)
}

// A declaration's name as it stands in source: a hard keyword needs backticks.
function kotlinName(name: string) {
  return KOTLIN_KEYWORDS.has(name) ? `\`${name}\`` : name
}

/**
 * A Kotlin string literal of the value. `$` starts a template in Kotlin, so it is escaped along
 * with the quote, the backslash and the characters that cannot stand raw in a string.
 *
 * @param value - The text.
 * @returns The literal, quotes included.
 */
export function kotlinString(value: string) {
  const escaped = Array.from({ length: value.length }, (_, index) => value.charAt(index))
    .map((char) => {
      const code = char.codePointAt(0) ?? 0
      if (char === '\\') return '\\\\'
      if (char === '"') return '\\"'
      if (char === '$') return '\\$'
      if (char === '\n') return '\\n'
      if (char === '\r') return '\\r'
      if (char === '\t') return '\\t'
      if (char === '\b') return '\\b'
      if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x20_28 || code === 0x20_29) {
        return `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
      }
      return char
    })
    .join('')
  return `"${escaped}"`
}

/**
 * An enum constant's name as Kotlin writes one: a name already in upper case with underscores or
 * in upper camel case is kept, any other is put in upper case with underscores between its words
 * (`low` → `LOW`, `link_only` → `LINK_ONLY`, `fooBar` → `FOO_BAR`).
 *
 * @param name - A Prisma enum value.
 * @returns The constant's name.
 */
export function enumEntryName(name: string) {
  if (/^\p{Lu}[\p{Lu}\p{N}_]*$/u.test(name) || /^\p{Lu}[\p{L}\p{N}]*$/u.test(name)) return name
  const screaming = name.replaceAll(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1_$2').toUpperCase()
  return /^\p{Lu}/u.test(screaming) ? screaming : `E_${screaming}`
}

/**
 * A type name made of any text: each run of letters and digits is a word, as `pascalCase` joins
 * words split at underscores (`friends-of` → `FriendsOf`).
 *
 * @param name - A Prisma model, enum or relation name.
 * @returns A PascalCase identifier.
 */
export function typeName(name: string) {
  return pascalCase(name.replaceAll(/[^\p{L}\p{N}]+/gu, '_'))
}

/**
 * A property name made of a Prisma field name, in the lower camel case Kotlin names properties in:
 * a name in lower camel case already is kept (`iOS`), any other is converted (`sku_code` →
 * `skuCode`, `UserId` → `userId`, `URL` → `url`, `XMLHttp` → `xmlHttp`).
 *
 * @param name - A Prisma field name.
 * @returns A lowerCamelCase identifier.
 */
export function propertyName(name: string) {
  if (/^\p{Ll}[\p{L}\p{N}]*$/u.test(name)) return name
  return typeName(name).replace(/^\p{Lu}+(?=\p{Lu}\p{Ll})|^\p{Lu}+/u, (capitals) =>
    capitals.toLowerCase(),
  )
}

const PRISMA_ESCAPES: { readonly [char: string]: string } = {
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

// A Prisma string literal's value: Prisma takes JSON's escapes, and only those.
function prismaString(literal: string) {
  return literal
    .slice(1, -1)
    .replaceAll(/\\(?:u([\dA-Fa-f]{4})|(.))/gu, (_, hex: string | undefined, char: string) =>
      hex === undefined
        ? (PRISMA_ESCAPES[char] ?? char)
        : String.fromCodePoint(Number.parseInt(hex, 16)),
    )
}

// The blocks of a Prisma schema with their lines, comments cut. The schema is line-based: a block
// opens with `keyword Name {` on a line of its own and closes with `}` on one, and blocks do not
// nest; a field or an attribute, arguments and all, stands on one line.
function prismaBlocks(source: string) {
  const lines = source
    .split(/\r?\n/u)
    .map((line) => (/^(?:"(?:[^"\\]|\\.)*"|[^"/]|\/(?!\/))*/u.exec(line)?.[0] ?? line).trim())
  return lines.flatMap((line, index) => {
    const opening = /^(\w+)\s+([^\s{]+)\s*\{$/u.exec(line)
    if (!opening) return []
    const end = lines.indexOf('}', index + 1)
    return [
      {
        keyword: opening[1],
        name: opening[2],
        lines: lines.slice(index + 1, end === -1 ? lines.length : end),
      },
    ]
  })
}

const PRISMA_STRING = String.raw`"(?:[^"\\]|\\.)*"`

/**
 * The `@@schema` each enum is declared in. DMMF carries a model's schema but not an enum's, so it
 * is read off the schema's text.
 *
 * @param source - The Prisma schema as written (all of its files, merged).
 * @returns The schema of each enum that names one.
 */
export function enumSchemas(source: string) {
  const attribute = new RegExp(
    String.raw`^@@schema\s*\(\s*(?:map\s*:\s*)?(${PRISMA_STRING})\s*\)$`,
    'u',
  )
  return new Map(
    prismaBlocks(source)
      .filter((block) => block.keyword === 'enum')
      .flatMap((block) =>
        block.lines.flatMap((line) => {
          const match = attribute.exec(line)
          return match ? [{ name: block.name, schema: prismaString(match[1]) }] : []
        }),
      )
      .map(({ name, schema }) => [name, schema]),
  )
}

/**
 * The name each foreign key is given with `@relation(map: "...")`, by `Model.field`. DMMF drops it,
 * so it is read off the schema's text.
 *
 * @param source - The Prisma schema as written (all of its files, merged).
 * @returns The constraint name of each relation field that names one.
 */
export function relationMaps(source: string) {
  const string = new RegExp(PRISMA_STRING, 'gu')
  return new Map(
    prismaBlocks(source)
      .filter((block) => block.keyword === 'model')
      .flatMap((block) =>
        block.lines.flatMap((line) => {
          // With each string stood in for by where it starts, @relation's arguments hold no
          // parenthesis.
          const strings = new Map([...line.matchAll(string)].map((m) => [String(m.index), m[0]]))
          const bare = line.replaceAll(string, (_, offset: number) => `"${offset}"`)
          const field = /^([^\s@]\S*)\s/u.exec(bare)?.[1]
          const args = /@relation\s*\(([^)]*)\)/u.exec(bare)?.[1]
          const map =
            args === undefined ? undefined : /(?:^|,)\s*map\s*:\s*"(\d+)"/u.exec(args)?.[1]
          return field === undefined || map === undefined
            ? []
            : [{ key: `${block.name}.${field}`, name: prismaString(strings.get(map) ?? '""') }]
        }),
      )
      .map(({ key, name }) => [key, name]),
  )
}

/**
 * The names of the `view` blocks. DMMF lists a view among the models, with nothing to tell it
 * apart; Prisma Migrate creates no table for it.
 *
 * @param source - The Prisma schema as written (all of its files, merged).
 * @returns The name of each view.
 */
export function viewNames(source: string) {
  return new Set(
    prismaBlocks(source)
      .filter((block) => block.keyword === 'view')
      .map((block) => block.name),
  )
}

/**
 * The datasource's `relationMode`: with `"prisma"`, Prisma Migrate creates no foreign keys.
 *
 * @param source - The Prisma schema as written (all of its files, merged).
 * @returns The relation mode, `foreignKeys` unless the datasource names another.
 */
export function relationMode(source: string) {
  const setting = prismaBlocks(source)
    .filter((block) => block.keyword === 'datasource')
    .flatMap((block) => block.lines)
    .flatMap((line) => {
      const match = new RegExp(String.raw`^relationMode\s*=\s*(${PRISMA_STRING})$`, 'u').exec(line)
      return match ? [prismaString(match[1])] : []
    })
  return setting[0] ?? 'foreignKeys'
}

const ATTRIBUTE_TOKEN = new RegExp(String.raw`${PRISMA_STRING}|[()[\]{}:,]|[^\s()[\]{}:,"]+`, 'gu')

const OPENING = new Set(['(', '[', '{'])

const CLOSING = new Set([')', ']', '}'])

function nesting(tokens: readonly string[]) {
  return (
    tokens.filter((token) => OPENING.has(token)).length -
    tokens.filter((token) => CLOSING.has(token)).length
  )
}

// The tokens between the bracket at `open` and the one that closes it.
function enclosed(tokens: readonly string[], open: number) {
  const close = tokens.findIndex(
    (_, index) => index > open && nesting(tokens.slice(open, index + 1)) === 0,
  )
  return tokens.slice(open + 1, close === -1 ? tokens.length : close)
}

// Tokens split at the commas outside any bracket.
function commaSeparated(tokens: readonly string[]) {
  const commas = tokens.flatMap((token, index) =>
    token === ',' && nesting(tokens.slice(0, index)) === 0 ? [index] : [],
  )
  return [-1, ...commas]
    .map((comma, position) => tokens.slice(comma + 1, commas[position] ?? tokens.length))
    .filter((part) => part.length > 0)
}

// An attribute's arguments: `name: value` by name, a positional one under ''.
function attributeArguments(tokens: readonly string[]) {
  return new Map(
    commaSeparated(tokens).map((part) => (part[1] === ':' ? [part[0], part.slice(2)] : ['', part])),
  )
}

/** What a partial index's `where` says: raw SQL, or equalities of fields to values. */
export type IndexCondition =
  | { readonly kind: 'raw'; readonly sql: string }
  | {
      readonly kind: 'fields'
      readonly terms: readonly {
        readonly field: string
        readonly not: boolean
        readonly value: string
      }[]
    }

function indexCondition(tokens: readonly string[]): IndexCondition | null {
  if (tokens[0] === 'raw' && tokens[1] === '(' && tokens[2]?.startsWith('"')) {
    return { kind: 'raw', sql: prismaString(tokens[2]) }
  }
  if (tokens[0] !== '{') return null
  const terms = commaSeparated(enclosed(tokens, 0)).map((entry) => {
    const [field, , ...value] = entry
    const negated = value[0] === '{' ? attributeArguments(enclosed(value, 0)).get('not') : undefined
    return negated === undefined
      ? { field, not: false, value: value[0] }
      : { field, not: true, value: negated[0] }
  })
  return { kind: 'fields', terms }
}

/**
 * The `where` of each partial index (the `partialIndexes` preview feature), with what tells the
 * index apart: its model, whether it is unique, its fields and its `map`. DMMF drops it, so it is
 * read off the schema's text.
 *
 * @param source - The Prisma schema as written (all of its files, merged).
 * @returns Each index that has a `where`.
 */
export function indexConditions(source: string) {
  return prismaBlocks(source)
    .filter((block) => block.keyword === 'model')
    .flatMap((block) =>
      block.lines.flatMap((line) => {
        const tokens = line.match(ATTRIBUTE_TOKEN) ?? []
        const blockLevel = tokens[0] === '@@index' || tokens[0] === '@@unique'
        const fieldLevel = tokens.findIndex(
          (token, index) => index > 0 && token === '@unique' && tokens[index + 1] === '(',
        )
        const open = blockLevel ? 1 : fieldLevel + 1
        if ((!blockLevel && fieldLevel === -1) || tokens[open] !== '(') return []
        const args = attributeArguments(enclosed(tokens, open))
        const where = args.get('where')
        const condition = where === undefined ? null : indexCondition(where)
        if (condition === null) return []
        const list = args.get('fields') ?? args.get('') ?? []
        const fields = blockLevel
          ? commaSeparated(list[0] === '[' ? enclosed(list, 0) : list).flatMap((part) =>
              part[0] === undefined ? [] : [part[0]],
            )
          : [tokens[0] ?? '']
        const map = args.get('map')?.[0]
        return [
          {
            model: block.name,
            unique: tokens[0] !== '@@index',
            fields,
            dbName: map === undefined ? undefined : prismaString(map),
            condition,
          },
        ]
      }),
    )
}

/**
 * The text of each numeric `@default`, by `Model.field`. DMMF carries one as a JavaScript number,
 * which holds no more digits than a double; a Decimal default is taken as written.
 *
 * @param source - The Prisma schema as written (all of its files, merged).
 * @returns The literal of each field whose default is a number.
 */
export function numericDefaults(source: string) {
  return new Map(
    prismaBlocks(source)
      .filter((block) => block.keyword === 'model')
      .flatMap((block) =>
        block.lines.flatMap((line) => {
          const tokens = line.match(ATTRIBUTE_TOKEN) ?? []
          const at = tokens.findIndex(
            (token, index) => index > 0 && token === '@default' && tokens[index + 1] === '(',
          )
          const literal = at === -1 ? undefined : tokens[at + 2]
          return literal !== undefined &&
            tokens[at + 3] === ')' &&
            /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/iu.test(literal)
            ? [{ key: `${block.name}.${tokens[0]}`, literal }]
            : []
        }),
      )
      .map(({ key, literal }) => [key, literal]),
  )
}

function sqlQuoted(name: string) {
  return `"${name.replaceAll('"', '""')}"`
}

// Exposed lower-cases a table or constraint name it is handed unquoted, as PostgreSQL folds one,
// and splits it at a dot; a name in any other case is handed over quoted, which Exposed keeps.
function isFolded(name: string) {
  return name !== name.toLowerCase() || /["'.`]/u.test(name)
}

function exposedTableName(model: DMMF.Model) {
  const table = tableName(model)
  if (!model.schema) return isFolded(table) ? sqlQuoted(table) : table
  // `schema."Table"` is lower-cased whole, so a schema-qualified name is quoted throughout or not at all.
  return isFolded(model.schema) || isFolded(table)
    ? `${sqlQuoted(model.schema)}.${sqlQuoted(table)}`
    : `${model.schema}.${table}`
}

// Exposed quotes a column name in mixed case itself, but reads one in capitals throughout as
// case-insensitive, and splits one at a dot.
function exposedColumnName(name: string) {
  const isCapitals = name === name.toUpperCase() && name !== name.toLowerCase()
  return isCapitals || /["'.`]/u.test(name) ? sqlQuoted(name) : name
}

// Exposed cuts a constraint name to PostgreSQL's 63 characters, quotes included: a quoted name
// longer than that would lose its closing quote, so it is handed over unquoted instead.
function exposedConstraintName(name: string) {
  if (!isFolded(name)) return name
  const quoted = sqlQuoted(name)
  return quoted.length > 63 ? name : quoted
}

// The properties an object inherits from Exposed's Table and IdTable: a column cannot take one of
// these names ("hides member of supertype"), and `id` is the key of an IdTable.
const TABLE_MEMBERS = [
  'autoIncColumn',
  'columns',
  'ddl',
  'fields',
  'foreignKeys',
  'id',
  'idColumns',
  'indices',
  'options',
  'primaryKey',
  'realFields',
  'schemaName',
  'sequences',
  'source',
  'storageParameters',
  'tableName',
  'tableNameWithoutScheme',
  'tableNameWithoutSchemeSanitized',
]

// The classes nested in Table: inside a table object their simple names bind to these.
const TABLE_NESTED_TYPES = [
  'AutovacuumEnabledParameter',
  'CharsetOption',
  'Dual',
  'EngineOption',
  'FillFactorParameter',
  'PrimaryKey',
  'RawTableOption',
  'RawTableStorageParameter',
  'TableEngine',
  'TableOption',
  'TableStorageParameter',
  'ToastTupleTargetParameter',
  'UuidVersion',
]

// The properties an entity inherits from Exposed's Entity, and the name of its companion object.
const ENTITY_MEMBERS = [
  'Companion',
  '_readValues',
  'db',
  'id',
  'klass',
  'readValues',
  'writeValues',
]

// What the support file declares in the package, each written only when a table needs it.
const SUPPORT_FILE = 'ColumnTypes'

const SUPPORT_TYPES = [
  'PgDateColumnType',
  'PgEnumColumnType',
  'PgListColumnType',
  'PgMoneyColumnType',
  'PgNumericColumnType',
  'PgOidColumnType',
  'PgSmallserialColumnType',
  'PgStringColumnType',
  'PgTimeColumnType',
  'PgTimestampColumnType',
  'PgTimestamptzColumnType',
  'PgTimetzColumnType',
  'SqlCondition',
  'SqlExpression',
]

const SCHEMA_OBJECT = 'PrismaSchema'

type Key =
  | { readonly kind: 'single'; readonly field: DMMF.Field; readonly index: IndexInfo }
  | {
      readonly kind: 'composite'
      readonly fields: readonly DMMF.Field[]
      readonly index: IndexInfo
    }
  | { readonly kind: 'none' }

// The key an entity is tracked by — the primary key, or the first unique criterion whose fields are
// all required — as one column (an IdTable), several (a CompositeIdTable) or none (a plain Table).
function modelKey(model: DMMF.Model, indexes: readonly IndexInfo[]): Key {
  const index = entityKey(model, indexes)
  if (!index) return { kind: 'none' }
  const fields = fieldNames(index).flatMap((name) => model.fields.filter((f) => f.name === name))
  if (fields.length !== index.fields.length || fields.length === 0) return { kind: 'none' }
  const [first] = fields
  return fields.length === 1
    ? { kind: 'single', field: first, index }
    : { kind: 'composite', fields, index }
}

function keyFieldNames(key: Key) {
  if (key.kind === 'single') return [key.field.name]
  if (key.kind === 'composite') return key.fields.map((f) => f.name)
  return []
}

/**
 * How a foreign key is written:
 * - `id`: one column referencing the key of an IdTable — a `reference()` column;
 * - `column`: one column referencing any other unique column — `.references()`;
 * - `composite-id`: columns referencing the key of a CompositeIdTable — `foreignKey()`;
 * - `composite`: columns referencing a unique criterion other than the key — `foreignKey()`.
 */
type ForeignKeyKind = 'id' | 'column' | 'composite-id' | 'composite'

type ForeignKey = {
  readonly dependent: DMMF.Model
  readonly navigation: DMMF.Field
  readonly principal: DMMF.Model
  readonly inverse: DMMF.Field | undefined
  /** The dependent's fields, in the order `fields` lists them. */
  readonly from: readonly string[]
  /** The principal's fields, paired with `from`. */
  readonly to: readonly string[]
  readonly kind: ForeignKeyKind
  /** Declared on its column rather than in the table's `init` block. */
  readonly inline: boolean
  /** Whether each column has the type of the one it references, as a `reference()` column has. */
  readonly sameType: boolean
  readonly name: string
  readonly onDelete: string
  readonly onUpdate: string
  readonly isRequired: boolean
}

const REFERENCE_OPTIONS: { readonly [action: string]: string } = {
  Cascade: 'CASCADE',
  Restrict: 'RESTRICT',
  NoAction: 'NO_ACTION',
  SetNull: 'SET_NULL',
  SetDefault: 'SET_DEFAULT',
}

/**
 * Prisma's referential action as Exposed's ReferenceOption. Without `onDelete` Prisma restricts the
 * delete of a required relation and sets an optional one to null, and without `onUpdate` it
 * cascades; Exposed would write RESTRICT for an action left out, so the action is always given.
 *
 * @param action - The action as DMMF carries it, if any.
 * @param fallback - Prisma's default action for the relation.
 * @returns A member of ReferenceOption.
 */
export function referenceOption(action: string | undefined, fallback: string) {
  return REFERENCE_OPTIONS[action ?? fallback] ?? REFERENCE_OPTIONS[fallback] ?? 'NO_ACTION'
}

// The column type Prisma Migrate gives a field: its native type, or its scalar type's default.
const DEFAULT_NATIVE_TYPES: { readonly [type: string]: string } = {
  String: 'Text()',
  Int: 'Integer()',
  BigInt: 'BigInt()',
  Float: 'DoublePrecision()',
  Decimal: 'Decimal(65,30)',
  Boolean: 'Boolean()',
  DateTime: 'Timestamp(3)',
  Json: 'JsonB()',
  Bytes: 'ByteA()',
}

function storedType(field: DMMF.Field | undefined) {
  if (!field) return ''
  const [name, args] = field.nativeType ?? []
  const native =
    name === undefined ? DEFAULT_NATIVE_TYPES[field.type] : `${name}(${args?.join(',') ?? ''})`
  return `${field.kind}:${field.type}:${native ?? ''}:${field.isList}`
}

// The Kotlin type of a field's column.
function kotlinType(field: DMMF.Field | undefined) {
  if (!field) return ''
  if (field.kind === 'enum') return `enum:${field.type}`
  const map =
    (field.nativeType ? nativeMapping(...field.nativeType) : null) ?? scalarMapping(field.type)
  return `${map.kotlin}:${field.isList}`
}

function foreignKeys(
  models: readonly DMMF.Model[],
  keyOf: (model: DMMF.Model) => Key,
  maps: ReadonlyMap<string, string>,
) {
  return models.flatMap((dependent) => {
    const relations = dependent.fields.filter(
      (f) => f.kind === 'object' && (f.relationFromFields ?? []).length > 0,
    )
    return relations.flatMap((navigation, position): ForeignKey[] => {
      const principal = models.find((m) => m.name === navigation.type)
      const from = navigation.relationFromFields ?? []
      const to = navigation.relationToFields ?? []
      if (!principal || from.length !== to.length) return []
      const principalKey = keyOf(principal)
      const kind: ForeignKeyKind =
        from.length === 1
          ? principalKey.kind === 'single' && principalKey.field.name === to[0]
            ? 'id'
            : 'column'
          : principalKey.kind === 'composite' && isSameFieldSet(keyFieldNames(principalKey), to)
            ? 'composite-id'
            : 'composite'
      const fromFields = from.map((name) => dependent.fields.find((f) => f.name === name))
      const toFields = to.map((name) => principal.fields.find((f) => f.name === name))
      const sameType = fromFields.every(
        (field, index) => storedType(field) === storedType(toFields[index]),
      )
      // A column holds one foreign key of its own, which `.references()` types to the column it
      // references; a second one on it, or one to a column of another Kotlin type, is a table-level
      // foreignKey().
      const inline =
        from.length === 1 &&
        kotlinType(fromFields[0]) === kotlinType(toFields[0]) &&
        !relations.slice(0, position).some((earlier) => {
          const earlierFrom = earlier.relationFromFields ?? []
          return earlierFrom.length === 1 && earlierFrom[0] === from[0]
        })
      const isRequired = fromFields.every((field) => field?.isRequired === true)
      // Prisma restricts the delete of a row a required column references, even when others in the
      // key are optional.
      const isOptional = fromFields.every((field) => field?.isRequired === false)
      // Prisma names the constraint after the columns in the order `fields` lists them.
      const name =
        maps.get(`${dependent.name}.${navigation.name}`) ??
        prismaConstraintName(
          [
            tableName(dependent),
            ...from.map((field) => {
              const found = dependent.fields.find((f) => f.name === field)
              return found ? columnName(found) : field
            }),
          ].join('_'),
          '_fkey',
        )
      return [
        {
          dependent,
          navigation,
          principal,
          inverse: backRelation(navigation, dependent, models),
          from,
          to,
          kind,
          inline,
          sameType,
          name,
          onDelete: referenceOption(
            navigation.relationOnDelete,
            isOptional ? 'SetNull' : 'Restrict',
          ),
          onUpdate: referenceOption(navigation.relationOnUpdate, 'Cascade'),
          isRequired,
        },
      ]
    })
  })
}

type Names = {
  readonly package: string
  readonly dao: boolean
  readonly tables: ReadonlyMap<string, string>
  readonly entities: ReadonlyMap<string, string>
  readonly enums: ReadonlyMap<string, string>
  readonly joins: ReadonlyMap<string, string>
  /** Per model, the table object's property of each scalar field. */
  readonly columns: ReadonlyMap<string, ReadonlyMap<string, string>>
  /** Per model, the entity's property of each scalar field and each relation it can follow. */
  readonly properties: ReadonlyMap<string, ReadonlyMap<string, string>>
  readonly entries: ReadonlyMap<string, ReadonlyMap<string, string>>
}

function lowerCase(name: string) {
  return name.toLowerCase()
}

function asIs(name: string) {
  return name
}

function scalarFields(model: DMMF.Model) {
  return model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum')
}

/** Everything the files are written from: the schema, what it implies, and the Kotlin names. */
export type ExposedPlan = {
  readonly names: Names
  readonly dao: boolean
  readonly models: readonly DMMF.Model[]
  readonly enums: readonly DMMF.DatamodelEnum[]
  readonly enumSchemas: ReadonlyMap<string, string>
  readonly indexesOf: (model: DMMF.Model) => readonly PlannedIndex[]
  readonly keyOf: (model: DMMF.Model) => Key
  readonly foreignKeys: readonly ForeignKey[]
  /** False with `relationMode = "prisma"`, which leaves the join tables without foreign keys too. */
  readonly foreignKeysInDatabase: boolean
  readonly manyToMany: readonly ManyToMany[]
  /** The text of each numeric `@default`, by `Model.field`. */
  readonly numericDefaults: ReadonlyMap<string, string>
}

/** An index, and the condition of a partial one as SQL. */
type PlannedIndex = IndexInfo & { readonly where?: string }

function isSameList(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((name, index) => right[index] === name)
}

// A partial index's condition as Prisma Migrate writes it. Prisma takes true, false, null, a
// string or a number for a field, or `{ not: ... }` of one.
function conditionSql(model: DMMF.Model, condition: IndexCondition) {
  if (condition.kind === 'raw') return `(${condition.sql})`
  const terms = condition.terms.map((term) => {
    const field = model.fields.find((f) => f.name === term.field)
    const column = sqlQuoted(field ? columnName(field) : term.field)
    if (term.value === 'null') return `${column} IS ${term.not ? 'NOT ' : ''}NULL`
    const value = term.value.startsWith('"') ? sqlString(prismaString(term.value)) : term.value
    return `${column} ${term.not ? '!=' : '='} ${value}`
  })
  return `(${terms.join(' AND ')})`
}

type SchemaInfo = Omit<ExposedPlan, 'names'>

function hasEntity(schema: Pick<SchemaInfo, 'dao' | 'keyOf'>, model: DMMF.Model) {
  return schema.dao && schema.keyOf(model).kind !== 'none'
}

function isKeyField(schema: Pick<SchemaInfo, 'keyOf'>, model: DMMF.Model, field: string) {
  return keyFieldNames(schema.keyOf(model)).includes(field)
}

function isSmallserial(field: DMMF.Field) {
  return (
    isFunctionDefault(field.default) &&
    field.default.name === 'autoincrement' &&
    field.nativeType?.[0] === 'SmallInt'
  )
}

/**
 * How the DAO follows a foreign key: through its column (`referencedOn`, `referrersOn`), through
 * the table's composite foreign key — which Exposed matches against the key of a CompositeIdTable,
 * so one per pair of tables — or not at all.
 *
 * @param schema - The schema.
 * @param fk - The foreign key.
 * @returns `column`, `table` or null.
 */
function navigationKind(schema: SchemaInfo, fk: ForeignKey) {
  if (!hasEntity(schema, fk.dependent) || !hasEntity(schema, fk.principal)) return null
  if (fk.kind === 'composite') return null
  if (fk.kind === 'composite-id') {
    const siblings = schema.foreignKeys.filter(
      (other) =>
        other.dependent === fk.dependent &&
        other.principal === fk.principal &&
        other.kind === 'composite-id',
    )
    return siblings.length === 1 ? 'table' : null
  }
  if (!fk.inline) return null
  const principalField = fk.principal.fields.find((f) => f.name === fk.to[0])
  // A reference column copies the type of the key it references, which for a smallserial would be
  // another smallserial, and a column of another type cannot copy it: such a key is referenced by a
  // plain column, whose setter the DAO cannot use — unless the column is its table's key.
  const dependentKey = schema.keyOf(fk.dependent)
  const isOwnKey = dependentKey.kind === 'single' && dependentKey.field.name === fk.from[0]
  if (
    fk.kind === 'id' &&
    ((principalField && isSmallserial(principalField)) || (!fk.sameType && !isOwnKey))
  ) {
    return null
  }
  // A column that references a reference column holds a plain value the DAO would compare with an
  // EntityID.
  const target = schema.foreignKeys.find(
    (other) => other.dependent === fk.principal && other.inline && other.from[0] === fk.to[0],
  )
  if (fk.kind === 'column' && target && isReferenceColumn(schema, target)) return null
  // A plain column that is part of a key holds an EntityID, and one referencing part of a
  // composite key references an EntityID: the DAO compares the two as different types.
  if (
    fk.kind === 'column' &&
    (isKeyField(schema, fk.dependent, fk.from[0]) || isKeyField(schema, fk.principal, fk.to[0]))
  ) {
    return null
  }
  return 'column'
}

// The DAO follows a join table through its foreign keys, from EntityID columns.
function isJoinNavigable(schema: SchemaInfo, m2m: ManyToMany) {
  return (
    schema.foreignKeysInDatabase &&
    [m2m.a.model, m2m.b.model].every((model) => {
      const key = schema.keyOf(model)
      return key.kind === 'single' && !isSmallserial(key.field)
    })
  )
}

function relationFields(schema: SchemaInfo, model: DMMF.Model) {
  const fromForeignKeys = schema.foreignKeys.flatMap((fk) =>
    navigationKind(schema, fk) === null
      ? []
      : [
          ...(fk.dependent === model ? [fk.navigation.name] : []),
          ...(fk.principal === model && fk.inverse ? [fk.inverse.name] : []),
        ],
  )
  const fromJoins = hasEntity(schema, model)
    ? schema.manyToMany
        .filter((m2m) => isJoinNavigable(schema, m2m))
        .flatMap((m2m) =>
          [m2m.a, m2m.b].filter((side) => side.model === model).map((side) => side.field.name),
        )
    : []
  return new Set([...fromForeignKeys, ...fromJoins])
}

function planNames(schema: SchemaInfo, packageName: string) {
  // Each declaration is written to `<Name>.kt` beside the others, so names are unique regardless
  // of case: two files that differ only in case are one file on macOS and Windows.
  const types = allocate(
    [
      ...schema.enums.map((e) => ({ key: `enum:${e.name}`, candidate: typeName(e.name) })),
      ...schema.models.flatMap((m) => [
        { key: `table:${m.name}`, candidate: `${typeName(m.name)}Table` },
        ...(hasEntity(schema, m)
          ? [{ key: `entity:${m.name}`, candidate: `${typeName(m.name)}Entity` }]
          : []),
      ]),
      ...schema.manyToMany.map((m2m) => ({
        key: `join:${m2m.relationName}`,
        candidate: `${typeName(m2m.relationName)}Table`,
      })),
    ],
    // ColumnTypes.kt's top-level functions compile into the class ColumnTypesKt.
    [SCHEMA_OBJECT, SUPPORT_FILE, `${SUPPORT_FILE}Kt`, ...SUPPORT_TYPES],
    lowerCase,
  )
  const typeOf = (key: string) => types.get(key) ?? key
  return {
    package: packageName,
    dao: schema.dao,
    tables: new Map(schema.models.map((m) => [m.name, typeOf(`table:${m.name}`)])),
    entities: new Map(
      schema.models
        .filter((m) => hasEntity(schema, m))
        .map((m) => [m.name, typeOf(`entity:${m.name}`)]),
    ),
    enums: new Map(schema.enums.map((e) => [e.name, typeOf(`enum:${e.name}`)])),
    joins: new Map(
      schema.manyToMany.map((m2m) => [m2m.relationName, typeOf(`join:${m2m.relationName}`)]),
    ),
    columns: new Map(
      schema.models.map((model) => {
        const key = schema.keyOf(model)
        const keyField = key.kind === 'single' ? key.field.name : null
        const reserved =
          key.kind === 'none'
            ? [
                ...TABLE_MEMBERS.filter((m) => m !== 'id' && m !== 'idColumns'),
                ...TABLE_NESTED_TYPES,
              ]
            : [...TABLE_MEMBERS, ...TABLE_NESTED_TYPES]
        const allocated = allocate(
          scalarFields(model)
            .filter((f) => f.name !== keyField)
            .map((f) => ({ key: f.name, candidate: propertyName(f.name) })),
          reserved,
          asIs,
        )
        return [
          model.name,
          keyField === null ? allocated : new Map([...allocated, [keyField, 'id']]),
        ]
      }),
    ),
    properties: new Map(
      schema.models
        .filter((m) => hasEntity(schema, m))
        .map((model) => {
          const key = schema.keyOf(model)
          const keyField = key.kind === 'single' ? key.field.name : null
          const relations = relationFields(schema, model)
          return [
            model.name,
            allocate(
              model.fields
                .filter(
                  (f) =>
                    ((f.kind === 'scalar' || f.kind === 'enum') && f.name !== keyField) ||
                    (f.kind === 'object' && relations.has(f.name)),
                )
                .map((f) => ({ key: f.name, candidate: propertyName(f.name) })),
              ENTITY_MEMBERS,
              asIs,
            ),
          ]
        }),
    ),
    entries: new Map(
      schema.enums.map((e) => [
        e.name,
        allocate(
          e.values.map((v) => ({ key: v.name, candidate: enumEntryName(v.name) })),
          [],
          asIs,
        ),
      ]),
    ),
  }
}

/**
 * Reads the schema into what the files are written from.
 *
 * @param datamodel - The DMMF datamodel.
 * @param options - The package, whether to write DAO entities, and the schema of each enum.
 * @returns The plan the file writers take.
 */
export function planExposed(
  datamodel: {
    readonly models: readonly DMMF.Model[]
    readonly enums: readonly DMMF.DatamodelEnum[]
    readonly indexes?: readonly DMMF.Index[]
  },
  options: {
    readonly package: string
    readonly dao: boolean
    /** The schema's text, which carries what DMMF drops: each enum's schema and each `map` of a relation. */
    readonly source?: string
  },
) {
  const source = options.source ?? ''
  const views = viewNames(source)
  const models = datamodel.models.filter((m) => !views.has(m.name))
  const conditions = indexConditions(source)
  // Computed once per model: the indexes are told apart by identity, and a DMMF without `indexes`
  // has them made up afresh from each model.
  const indexes = new Map(
    models.map((m) => [
      m.name,
      modelIndexes(m, datamodel.indexes ?? []).map((index): PlannedIndex => {
        const condition = conditions.find(
          (c) =>
            c.model === m.name &&
            c.unique === (index.type === 'unique') &&
            c.dbName === index.dbName &&
            isSameList(c.fields, fieldNames(index)),
        )
        return condition
          ? {
              type: index.type,
              fields: index.fields,
              dbName: index.dbName,
              algorithm: index.algorithm,
              where: conditionSql(m, condition.condition),
            }
          : index
      }),
    ]),
  )
  const indexesOf = (model: DMMF.Model) => indexes.get(model.name) ?? []
  // A partial unique index holds only some rows unique, so it keys none.
  const keys = new Map(
    models.map((m) => [
      m.name,
      modelKey(
        m,
        indexesOf(m).filter((index) => !index.where),
      ),
    ]),
  )
  const keyOf = (model: DMMF.Model): Key => keys.get(model.name) ?? { kind: 'none' }
  // Prisma requires both ends of an implicit many-to-many relation to have a single-field key; the
  // join table references each one.
  const manyToMany = manyToManyRelations(models).filter(
    (m2m) => keyOf(m2m.a.model).kind === 'single' && keyOf(m2m.b.model).kind === 'single',
  )
  const inDatabase = relationMode(source) !== 'prisma'
  const schema: SchemaInfo = {
    dao: options.dao,
    models,
    enums: datamodel.enums,
    enumSchemas: enumSchemas(source),
    indexesOf,
    keyOf,
    // With `relationMode = "prisma"` the relations live in Prisma Client alone: no foreign key,
    // and nothing for the DAO to follow, as Exposed follows a relation by its foreign key.
    foreignKeys: inDatabase ? foreignKeys(models, keyOf, relationMaps(source)) : [],
    foreignKeysInDatabase: inDatabase,
    manyToMany,
    numericDefaults: numericDefaults(source),
  }
  return { ...schema, names: planNames(schema, options.package) }
}

function tableRef(plan: ExposedPlan, model: DMMF.Model) {
  return exprRef(local(plan.names.tables.get(model.name) ?? model.name))
}

function columnProperty(plan: ExposedPlan, model: DMMF.Model, field: string) {
  return plan.names.columns.get(model.name)?.get(field) ?? field
}

function entityProperty(plan: ExposedPlan, model: DMMF.Model, field: string) {
  return plan.names.properties.get(model.name)?.get(field) ?? field
}

function enumName(plan: ExposedPlan, name: string) {
  return plan.names.enums.get(name) ?? name
}

/**
 * The PostgreSQL type of an enum, as its columns name it: `"Status"`, or `"audit"."Status"` for one
 * declared in a schema.
 *
 * @param plan - The plan.
 * @param e - The enum.
 * @returns The type's name, quoted.
 */
function enumSqlType(plan: Pick<ExposedPlan, 'enumSchemas'>, e: DMMF.DatamodelEnum) {
  const dbName = e.dbName ?? e.name
  const schema = plan.enumSchemas.get(e.name)
  return schema ? `${sqlQuoted(schema)}.${sqlQuoted(dbName)}` : sqlQuoted(dbName)
}

type TemporalKind = 'timestamp' | 'timestamptz' | 'date' | 'time' | 'timetz'

type LiteralKind =
  | 'string'
  | 'int'
  | 'short'
  | 'long'
  | 'float'
  | 'double'
  | 'decimal'
  | 'boolean'
  | 'uuid'
  | 'bytes'
  | 'enum'
  | 'temporal'

type Mapping = {
  /** The Kotlin type of a value — of each element, for a list. */
  readonly kotlin: string
  /** The call that registers the column of a scalar, given the column's name as a literal. */
  readonly factory: (name: string) => Call
  /** The column type of one element, which a list column is built from. */
  readonly element: string
  /** For a list read element by element, the class each element is read as. */
  readonly listReadAs: string | null
  readonly temporal: TemporalKind | null
  /** One of Exposed's string columns, whose literals Exposed escapes — CR and LF wrongly. */
  readonly exposedString: boolean
  /** A JSON column, whose literals Exposed does not escape at all. */
  readonly json: boolean
  readonly literal: LiteralKind
}

function callText(name: string, args: readonly string[]) {
  return `${name}(${args.join(', ')})`
}

function lengthArg(args: readonly string[]) {
  const [length] = args
  return length !== undefined && /^\d+$/u.test(length) ? length : null
}

function mapping(
  kotlin: string,
  factory: (name: string) => Call,
  element: string,
  literal: LiteralKind,
  extra: {
    readonly listReadAs?: string
    readonly temporal?: TemporalKind
    readonly exposedString?: boolean
    readonly json?: boolean
  } = {},
) {
  return {
    kotlin,
    factory,
    element,
    literal,
    listReadAs: extra.listReadAs ?? null,
    temporal: extra.temporal ?? null,
    exposedString: extra.exposedString ?? false,
    json: extra.json ?? false,
  }
}

function exposedColumn(factory: string, args: readonly string[]) {
  return (name: string): Call => ({ name: factory, args: [name, ...args] })
}

function supportColumn(factory: string, args: readonly string[]) {
  return (name: string): Call => ({ name: funRef(local(factory)), args: [name, ...args] })
}

const STRING = typeRef(KT.String)

function exposedString(factory: string, args: readonly string[], columnType: string) {
  return mapping(
    STRING,
    exposedColumn(factory, args),
    callText(exprRef(columnType), args),
    'string',
    {
      exposedString: true,
    },
  )
}

// A string column of a type Exposed has no column for: bound with a cast to the type, as Exposed
// binds a jsonb, and read as the text PostgreSQL writes — a list of it too, element by element,
// since the JDBC driver reads a bit[] as booleans.
function pgString(factory: string, args: readonly string[], sqlType: string, cast: string) {
  return mapping(
    STRING,
    supportColumn(factory, args),
    callText(exprRef(local('PgStringColumnType')), [kotlinString(sqlType), kotlinString(cast)]),
    'string',
    { listReadAs: `${exprRef(KT.String)}::class.java` },
  )
}

function temporalMapping(
  kind: TemporalKind,
  kotlin: string,
  precision: string | null,
  readAs: string,
) {
  const [factory, columnType] = {
    timestamp: ['pgTimestamp', 'PgTimestampColumnType'],
    timestamptz: ['pgTimestamptz', 'PgTimestamptzColumnType'],
    date: ['pgDate', 'PgDateColumnType'],
    time: ['pgTime', 'PgTimeColumnType'],
    timetz: ['pgTimetz', 'PgTimetzColumnType'],
  }[kind]
  const args = precision === null ? [] : [precision]
  return mapping(
    typeRef(kotlin),
    supportColumn(factory, args),
    callText(exprRef(local(columnType)), args),
    'temporal',
    { temporal: kind, listReadAs: `${exprRef(readAs)}::class.java` },
  )
}

// JSON is kept as its text: Prisma's Json holds any JSON value, whose shape the schema does not
// say. A list of it is read element by element, as text.
function jsonMapping(kind: 'json' | 'jsonb') {
  const codec = ['{ it }', '{ it }']
  return mapping(
    STRING,
    (name) => ({
      name: `${funRef(kind === 'json' ? KT.json : KT.jsonb)}<${STRING}>`,
      args: [name, ...codec],
    }),
    callText(
      `${exprRef(kind === 'json' ? KT.JsonColumnType : KT.JsonBColumnType)}<${STRING}>`,
      codec,
    ),
    'string',
    { listReadAs: `${exprRef(KT.String)}::class.java`, json: true },
  )
}

function simple(
  kotlin: string,
  factory: string,
  columnType: string,
  literal: LiteralKind,
  args: readonly string[] = [],
) {
  return mapping(
    typeRef(kotlin),
    exposedColumn(factory, args),
    callText(exprRef(columnType), args),
    literal,
  )
}

// The column of each Prisma type as Prisma Migrate creates it on PostgreSQL: Exposed's own column
// where its SQL type is the one Prisma writes, a column type of the support file where it is not —
// a precision Exposed does not write, a type Exposed has no column for, a value Exposed would
// convert through the JVM's time zone.
function postgresMapping(plan: ExposedPlan, field: DMMF.Field) {
  if (field.kind === 'enum') {
    const e = plan.enums.find((candidate) => candidate.name === field.type)
    const name = enumName(plan, field.type)
    const args = [
      kotlinString(e ? enumSqlType(plan, e) : sqlQuoted(field.type)),
      `${exprRef(local(name))}.entries`,
      `${exprRef(local(name))}::dbName`,
    ]
    return mapping(
      typeRef(local(name)),
      supportColumn('pgEnum', args),
      callText(exprRef(local('PgEnumColumnType')), args),
      'enum',
    )
  }
  return (field.nativeType ? nativeMapping(...field.nativeType) : null) ?? scalarMapping(field.type)
}

function nativeMapping(nativeName: string, args: readonly string[]) {
  const length = lengthArg(args)
  switch (nativeName) {
    case 'Text':
      return exposedString('text', [], KT.TextColumnType)
    case 'VarChar':
      return length
        ? exposedString('varchar', [length], KT.VarCharColumnType)
        : pgString('pgVarchar', [], 'VARCHAR', 'varchar')
    // Before 1.2, Exposed binds a list of char(n) as char[], which PostgreSQL cuts to one character
    // an element; unsized, bpchar keeps them whole for the column to pad.
    case 'Char': {
      const size = length ?? '1'
      return {
        ...exposedString('char', [size], KT.CharColumnType),
        element: callText(exprRef(local('PgStringColumnType')), [
          kotlinString(`BPCHAR(${size})`),
          kotlinString('bpchar'),
        ]),
      }
    }
    case 'Citext':
      return pgString('pgCitext', [], 'CITEXT', 'citext')
    case 'Xml':
      return pgString('pgXml', [], 'XML', 'xml')
    case 'Inet':
      return pgString('pgInet', [], 'INET', 'inet')
    // An explicit cast to bit(n) pads or cuts the string to n bits; the column's own type checks
    // the length of a varbit assigned to it instead.
    case 'Bit':
      return pgString('pgBit', [length ?? '1'], `BIT(${length ?? '1'})`, 'varbit')
    case 'VarBit':
      return length
        ? pgString('pgVarbit', [length], `VARBIT(${length})`, 'varbit')
        : pgString('pgVarbit', [], 'VARBIT', 'varbit')
    case 'Uuid':
      return mapping(
        typeRef(KT.UUID),
        (name) => ({ name: funRef(KT.javaUUID), args: [name] }),
        callText(exprRef(KT.UUIDColumnType), []),
        'uuid',
      )
    case 'SmallInt':
      return simple(KT.Short, 'short', KT.ShortColumnType, 'short')
    case 'Integer':
      return simple(KT.Int, 'integer', KT.IntegerColumnType, 'int')
    case 'Oid':
      return mapping(
        typeRef(KT.Long),
        supportColumn('pgOid', []),
        callText(exprRef(local('PgOidColumnType')), []),
        'long',
      )
    case 'BigInt':
      return simple(KT.Long, 'long', KT.LongColumnType, 'long')
    case 'Real':
      return simple(KT.Float, 'float', KT.FloatColumnType, 'float')
    case 'DoublePrecision':
      return simple(KT.Double, 'double', KT.DoubleColumnType, 'double')
    case 'Money':
      return mapping(
        typeRef(KT.BigDecimal),
        supportColumn('pgMoney', []),
        callText(exprRef(local('PgMoneyColumnType')), []),
        'decimal',
        { listReadAs: `${exprRef(KT.String)}::class.java` },
      )
    case 'Decimal': {
      const [precision, scale] = args
      return precision !== undefined && scale !== undefined
        ? simple(KT.BigDecimal, 'decimal', KT.DecimalColumnType, 'decimal', [precision, scale])
        : mapping(
            typeRef(KT.BigDecimal),
            supportColumn('pgNumeric', []),
            callText(exprRef(local('PgNumericColumnType')), []),
            'decimal',
          )
    }
    case 'Timestamp':
      return temporalMapping('timestamp', KT.Instant, length, KT.LocalDateTime)
    case 'Timestamptz':
      return temporalMapping('timestamptz', KT.Instant, length, KT.OffsetDateTime)
    case 'Date':
      return temporalMapping('date', KT.LocalDate, null, KT.LocalDate)
    case 'Time':
      return temporalMapping('time', KT.LocalTime, length, KT.LocalTime)
    case 'Timetz':
      return temporalMapping('timetz', KT.OffsetTime, length, KT.OffsetTime)
    case 'Json':
      return jsonMapping('json')
    case 'JsonB':
      return jsonMapping('jsonb')
    case 'ByteA':
      return simple(KT.ByteArray, 'binary', KT.BasicBinaryColumnType, 'bytes')
    case 'Boolean':
      return simple(KT.Boolean, 'bool', KT.BooleanColumnType, 'boolean')
    default:
      return null
  }
}

function scalarMapping(type: string) {
  switch (type) {
    case 'Int':
      return simple(KT.Int, 'integer', KT.IntegerColumnType, 'int')
    case 'BigInt':
      return simple(KT.Long, 'long', KT.LongColumnType, 'long')
    case 'Float':
      return simple(KT.Double, 'double', KT.DoubleColumnType, 'double')
    case 'Decimal':
      return simple(KT.BigDecimal, 'decimal', KT.DecimalColumnType, 'decimal', ['65', '30'])
    case 'Boolean':
      return simple(KT.Boolean, 'bool', KT.BooleanColumnType, 'boolean')
    case 'DateTime':
      return temporalMapping('timestamp', KT.Instant, '3', KT.LocalDateTime)
    case 'Json':
      return jsonMapping('jsonb')
    case 'Bytes':
      return simple(KT.ByteArray, 'binary', KT.BasicBinaryColumnType, 'bytes')
    default:
      return exposedString('text', [], KT.TextColumnType)
  }
}

// An integer in the range of a type whose values are -limit to limit - 1.
function integerLiteral(value: string | number | boolean, limit: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= -limit && value < limit
    ? String(value)
    : null
}

const LONG_MIN = -(2n ** 63n)
const LONG_MAX = 2n ** 63n - 1n

// Kotlin reads `-9223372036854775808L` as the negation of a literal out of range.
function longLiteral(value: string | number | boolean) {
  const text = String(value)
  if (!/^-?\d+$/u.test(text)) return null
  const number = BigInt(text)
  if (number === LONG_MIN) return `${exprRef(KT.Long)}.MIN_VALUE`
  return number > LONG_MIN && number <= LONG_MAX ? `${text}L` : null
}

// A double as Kotlin reads it: a whole number needs a fraction to be a Double literal.
function doubleText(value: number) {
  const text = String(value)
  return /^-?\d+$/u.test(text) ? `${text}.0` : text
}

function pad(value: number, width = 2) {
  return String(value).padStart(width, '0')
}

// A timestamp default as the value Prisma Client writes for it: the instant the literal names, in
// UTC — the UTC clock in a column without a time zone, the UTC date in a date column. (The DEFAULT
// Prisma Migrate writes is the literal itself, which PostgreSQL reads with the offset dropped for
// those columns; see `defaultPlan`.)
function temporalLiteral(value: string, kind: TemporalKind) {
  const parsed = parseDateTimeDefault(value)
  if (!parsed || kind === 'timetz') return null
  const moment = shift(parsed, parsed.offsetMinutes)
  if (moment.year > 9999) return null
  const date = `${pad(moment.year, 4)}-${pad(moment.month)}-${pad(moment.day)}`
  const fraction =
    moment.microsecond === 0 ? '' : `.${pad(moment.microsecond, 6).replace(/0+$/u, '')}`
  const time = `${pad(moment.hour)}:${pad(moment.minute)}:${pad(moment.second)}${fraction}`
  if (kind === 'date') return `${exprRef(KT.LocalDate)}.parse(${kotlinString(date)})`
  if (kind === 'time') return `${exprRef(KT.LocalTime)}.parse(${kotlinString(time)})`
  return `${exprRef(KT.Instant)}.parse(${kotlinString(`${date}T${time}Z`)})`
}

// A default as a Kotlin expression of the column's type, or null when the value has no spelling
// here that is sure to mean what the column's default means.
function kotlinLiteral(
  plan: ExposedPlan,
  value: string | number | boolean,
  field: DMMF.Field,
  map: Mapping,
) {
  switch (map.literal) {
    case 'enum': {
      const isKnown = plan.enums
        .find((e) => e.name === field.type)
        ?.values.some((v) => v.name === value)
      const entry = plan.names.entries.get(field.type)?.get(String(value))
      return isKnown && entry ? `${exprRef(local(enumName(plan, field.type)))}.${entry}` : null
    }
    case 'temporal':
      return typeof value === 'string' && map.temporal !== null
        ? temporalLiteral(value, map.temporal)
        : null
    case 'string':
      return typeof value === 'string' ? kotlinString(value) : null
    case 'boolean':
      return typeof value === 'boolean' ? String(value) : null
    case 'int':
      return integerLiteral(value, 2 ** 31)
    case 'short':
      return integerLiteral(value, 2 ** 15)
    // DMMF carries a BigInt default as a string of digits when it is past 2^53.
    case 'long':
      return longLiteral(value)
    case 'float':
      return typeof value === 'number' && Number.isFinite(value) ? `${value}f` : null
    case 'double':
      return typeof value === 'number' && Number.isFinite(value) ? doubleText(value) : null
    case 'decimal':
      return /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/iu.test(String(value))
        ? `${exprRef(KT.BigDecimal)}(${kotlinString(String(value))})`
        : null
    case 'uuid':
      return typeof value === 'string'
        ? `${exprRef(KT.UUID)}.fromString(${kotlinString(value)})`
        : null
    // A Bytes default is the base64 of the bytes.
    case 'bytes':
      return typeof value === 'string'
        ? `${exprRef(KT.Base64)}.getDecoder().decode(${kotlinString(value)})`
        : null
    default:
      return null
  }
}

function hexOfBase64(value: string) {
  return Buffer.from(value, 'base64').toString('hex')
}

// A default as the SQL Prisma Migrate means by it: an enum's label, a timestamp as Prisma writes
// it (which PostgreSQL reads, for a column without a time zone, with the offset dropped).
function sqlValue(
  plan: ExposedPlan,
  value: string | number | boolean,
  field: DMMF.Field,
  map: Mapping,
) {
  if (map.literal === 'enum') {
    const label = plan.enums
      .find((e) => e.name === field.type)
      ?.values.find((v) => v.name === value)
    return sqlString(label?.dbName ?? String(value))
  }
  if (map.literal === 'bytes' && typeof value === 'string') {
    return sqlString(`\\x${hexOfBase64(value)}`)
  }
  if (map.temporal !== null) return sqlString(sqlTimestamp(value))
  return typeof value === 'string' ? sqlString(value) : String(value)
}

type DefaultPlan =
  /** `.default(expr)`: the column's DEFAULT and what an insert that leaves the column out writes. */
  | { readonly kind: 'literal'; readonly expr: string }
  /** The DEFAULT clause is `sql`; an insert writes `client` when there is one. */
  | { readonly kind: 'database'; readonly sql: string; readonly client: Expr | null }
  /** A value generated in the client for an insert that leaves the column out. */
  | { readonly kind: 'client'; readonly expr: string }
  /** Filled in by the database, with no DEFAULT Hekireki can write (a trigger, say). */
  | { readonly kind: 'generated' }
  | { readonly kind: 'autoincrement' }

// Prisma Client stamps now() and @updatedAt with its own clock, a JavaScript Date: an instant to
// the millisecond, the UTC date in a date column, the UTC time of day in a time column.
function nowExpr(kind: TemporalKind) {
  const millis = `truncatedTo(${exprRef(KT.ChronoUnit)}.MILLIS)`
  const utc = `${exprRef(KT.ZoneOffset)}.UTC`
  const instant = `${exprRef(KT.Instant)}.now().${millis}`
  const expressions = {
    timestamp: instant,
    timestamptz: instant,
    date: `${exprRef(KT.LocalDate)}.now(${utc})`,
    time: `${exprRef(KT.LocalTime)}.now(${utc}).${millis}`,
    timetz: `${exprRef(KT.OffsetTime)}.now(${utc}).${millis}`,
  }
  return expressions[kind]
}

function generatorExpr(
  def: { readonly name: string; readonly args: readonly (string | number)[] },
  map: Mapping,
) {
  const [arg] = def.args
  const isUuid = map.kotlin === typeRef(KT.UUID)
  const isString = map.kotlin === STRING
  switch (def.name) {
    case 'uuid': {
      const uuid =
        arg === 7 ? callText(funRef(local('uuidV7')), []) : `${exprRef(KT.UUID)}.randomUUID()`
      return isUuid ? uuid : isString ? `${uuid}.toString()` : null
    }
    case 'ulid':
      return isString ? `${exprRef(KT.UlidCreator)}.getUlid().toString()` : null
    case 'cuid':
      return isString
        ? `${exprRef(KT.CUID)}.${arg === 2 ? 'randomCUID2' : 'randomCUID1'}().toString()`
        : null
    case 'nanoid':
      return isString
        ? callText(funRef(local('nanoid')), [String(typeof arg === 'number' && arg > 0 ? arg : 21)])
        : null
    default:
      return null
  }
}

function defaultPlan(
  plan: ExposedPlan,
  model: DMMF.Model,
  field: DMMF.Field,
  map: Mapping,
): DefaultPlan | null {
  const def =
    map.literal === 'decimal' && typeof field.default === 'number'
      ? (plan.numericDefaults.get(`${model.name}.${field.name}`) ?? field.default)
      : field.default
  const updatedAt =
    field.isUpdatedAt === true && map.temporal !== null && !field.isList
      ? { kind: 'client' as const, expr: nowExpr(map.temporal) }
      : null
  if (def === undefined || def === null) return updatedAt
  if (isFunctionDefault(def)) {
    const [arg] = def.args
    // Prisma Migrate gives an oid column no sequence.
    if (def.name === 'autoincrement') {
      return field.nativeType?.[0] === 'Oid' ? null : { kind: 'autoincrement' }
    }
    if (def.name === 'now') {
      return {
        kind: 'database',
        sql: 'CURRENT_TIMESTAMP',
        client: map.temporal ? nowExpr(map.temporal) : null,
      }
    }
    if (def.name === 'dbgenerated') {
      return typeof arg === 'string' && arg.length > 0
        ? { kind: 'database', sql: arg, client: null }
        : { kind: 'generated' }
    }
    const generated = field.isList ? null : generatorExpr(def, map)
    return generated === null ? updatedAt : { kind: 'client', expr: generated }
  }
  if (isListDefault(def)) {
    const elements = def.map((value) => kotlinLiteral(plan, value, field, map))
    const labels = def.map((value) => {
      if (map.literal === 'enum') {
        return (
          plan.enums.find((e) => e.name === field.type)?.values.find((v) => v.name === value)
            ?.dbName ?? String(value)
        )
      }
      if (map.literal === 'bytes' && typeof value === 'string') return `\\x${hexOfBase64(value)}`
      return map.temporal !== null ? sqlTimestamp(value) : String(value)
    })
    const client = elements.every((element) => element !== null)
      ? {
          name: funRef(elements.length === 0 ? KT.emptyList : KT.listOf),
          args: elements.filter((element) => element !== null),
        }
      : null
    return { kind: 'database', sql: sqlArray(labels), client }
  }
  const expr = kotlinLiteral(plan, def, field, map)
  const sql = sqlValue(plan, def, field, map)
  if (expr === null) return { kind: 'database', sql, client: null }
  // A timestamp with an offset is one instant to Prisma Client and another to the DEFAULT clause of
  // a column without a time zone, Exposed writes CR and LF into a string literal as `\r` `\n`, and
  // an apostrophe into a JSON one as it is: the DEFAULT is then Prisma's, the value an insert
  // starts from Prisma Client's.
  const parsed = typeof def === 'string' ? parseDateTimeDefault(def) : null
  const isShifted =
    map.temporal !== null &&
    map.temporal !== 'timestamptz' &&
    parsed !== null &&
    parsed.offsetMinutes !== 0
  const isMisquoted =
    typeof def === 'string' &&
    ((map.exposedString && /[\n\r]/u.test(def)) || (map.json && def.includes("'")))
  return isShifted || isMisquoted
    ? { kind: 'database', sql, client: expr }
    : { kind: 'literal', expr }
}

/** An expression laid out by the layout below: text it never breaks, a call, or a named argument. */
type Expr = string | Call | Named

type Call = {
  readonly name: string
  readonly args: readonly Expr[]
  /** A trailing lambda's body. */
  readonly lambda?: Expr
}

type Named = { readonly label: string; readonly value: Expr }

function referenceOptionRef(option: string) {
  return `${exprRef(KT.ReferenceOption)}.${option}`
}

function foreignKeyArgs(fk: ForeignKey, nameArg: 'fkName' | 'name') {
  return [
    `onDelete = ${referenceOptionRef(fk.onDelete)}`,
    `onUpdate = ${referenceOptionRef(fk.onUpdate)}`,
    `${nameArg} = ${kotlinString(exposedConstraintName(fk.name))}`,
  ]
}

function fieldMapping(plan: ExposedPlan, field: DMMF.Field) {
  return postgresMapping(plan, field)
}

// The indexes of a model that Exposed can declare: DMMF leaves out an `Unsupported` field, and so
// the table has no column for an index over one.
function modelIndexesOf(plan: ExposedPlan, model: DMMF.Model) {
  return plan
    .indexesOf(model)
    .filter((index) =>
      index.fields.every((f) => scalarFields(model).some((field) => field.name === f.name)),
    )
}

// The unique criteria of a model that a column declares with `.uniqueIndex()`: one field, which is
// not the key, in its own order and operator class, over the whole table.
function inlineUniques(plan: ExposedPlan, model: DMMF.Model) {
  return modelIndexesOf(plan, model).filter(
    (index) =>
      index.type === 'unique' &&
      index.fields.length === 1 &&
      index.where === undefined &&
      index.fields.every((f) => f.sortOrder !== 'desc' && f.operatorClass === undefined) &&
      !isKeyField(plan, model, index.fields[0].name),
  )
}

function inlineForeignKey(plan: ExposedPlan, model: DMMF.Model, field: DMMF.Field) {
  return plan.foreignKeys.find(
    (fk) => fk.dependent === model && fk.inline && fk.from[0] === field.name,
  )
}

// Whether a foreign key's column is a `reference()`, typed EntityID: one referencing an IdTable's
// key with the key's own type, except a smallserial one (whose type a reference would copy) and a
// key of its own table.
function isReferenceColumn(schema: Pick<SchemaInfo, 'keyOf'>, fk: ForeignKey | undefined) {
  if (fk?.kind !== 'id' || !fk.inline || !fk.sameType) return false
  const key = schema.keyOf(fk.dependent)
  if (key.kind === 'single' && key.field.name === fk.from[0]) return false
  const target = fk.principal.fields.find((f) => f.name === fk.to[0])
  return !(target && isSmallserial(target))
}

function columnCalls(plan: ExposedPlan, model: DMMF.Model, field: DMMF.Field) {
  const map = fieldMapping(plan, field)
  const key = plan.keyOf(model)
  const isSingleKey = key.kind === 'single' && key.field.name === field.name
  const fk = inlineForeignKey(plan, model, field)
  const isReference = isReferenceColumn(plan, fk)
  const name = kotlinString(exposedColumnName(columnName(field)))
  const def = defaultPlan(plan, model, field, map)
  const smallserial = def?.kind === 'autoincrement' && !field.isList && isSmallserial(field)
  const principal = fk ? tableRef(plan, fk.principal) : ''
  const wrap = (expr: Expr) =>
    isReference ? { name: exprRef(KT.EntityID), args: [expr, principal] } : expr
  const head: Call =
    isReference && fk
      ? {
          name: field.isRequired ? 'reference' : 'optReference',
          args: [name, principal, ...foreignKeyArgs(fk, 'fkName')],
        }
      : field.isList
        ? map.listReadAs
          ? { name: funRef(local('pgList')), args: [name, map.element, map.listReadAs] }
          : { name: 'array', args: [name, map.element] }
        : smallserial
          ? { name: funRef(local('pgSmallserial')), args: [name] }
          : map.factory(name)
  const references: readonly Call[] =
    fk && !isReference
      ? [
          {
            name: 'references',
            args: [
              `${principal}.${kotlinName(columnProperty(plan, fk.principal, fk.to[0]))}`,
              ...foreignKeyArgs(fk, 'fkName'),
            ],
          },
        ]
      : []
  const nullable: readonly Call[] =
    (!field.isRequired || field.isList) && !(isReference && !field.isRequired)
      ? [{ name: 'nullable', args: [] }]
      : []
  const defaults: readonly Call[] =
    def === null
      ? []
      : def.kind === 'literal'
        ? [{ name: 'default', args: [wrap(def.expr)] }]
        : def.kind === 'database'
          ? [
              def.client === null
                ? { name: funRef(local('databaseDefault')), args: [kotlinString(def.sql)] }
                : {
                    name: funRef(local('databaseDefault')),
                    args: [kotlinString(def.sql)],
                    lambda: wrap(def.client),
                  },
            ]
          : def.kind === 'client'
            ? [{ name: 'clientDefault', args: [], lambda: wrap(def.expr) }]
            : def.kind === 'generated' || smallserial
              ? [{ name: 'databaseGenerated', args: [] }]
              : [{ name: 'autoIncrement', args: [] }]
  const unique = inlineUniques(plan, model).find((index) => index.fields[0].name === field.name)
  return [
    head,
    ...(def?.kind === 'autoincrement' ? defaults : []),
    ...references,
    ...nullable,
    ...(def?.kind === 'autoincrement' ? [] : defaults),
    ...(unique
      ? [
          {
            name: 'uniqueIndex',
            args: [kotlinString(exposedConstraintName(indexName(model, unique)))],
          },
        ]
      : []),
    ...(isSingleKey ? [{ name: 'entityId', args: [] }] : []),
  ]
}

// ktlint's layout: its default style takes lines of up to 140 characters. A property that does not
// fit on its line starts again on the next one; a call that still does not fit takes its trailing
// lambda onto lines of its own or else its arguments, one to a line; a chain of calls that does not
// fit keeps all but its last call on the first line when only the last is too long, and otherwise
// puts each call on a line of its own, save that a call following one broken over lines stays on
// that one's closing line (ktlint's chain-method-continuation). Text is never broken: ktlint lets a
// string literal run past the limit on a line of its own.
const MAX_LINE = 140

// ktlint puts each call of a chain with this many calls after its first on a line of its own.
const CHAIN_OPERATOR_LIMIT = 4

function fits(line: string) {
  return line.length <= MAX_LINE
}

function render(expr: Expr): string {
  if (typeof expr === 'string') return expr
  if ('label' in expr) return `${expr.label} = ${render(expr.value)}`
  const lambda = expr.lambda === undefined ? '' : ` { ${render(expr.lambda)} }`
  return expr.args.length === 0 && expr.lambda !== undefined
    ? `${expr.name}${lambda}`
    : `${expr.name}(${expr.args.map(render).join(', ')})${lambda}`
}

function renderChain(calls: readonly Call[]) {
  return calls.map(render).join('.')
}

// `expr` on lines starting with `start` (the line's indent and any text before it), each line after
// the first indented by `indent`, the last ending in `end`.
function exprLines(start: string, indent: string, expr: Expr, end: string): readonly string[] {
  const whole = `${start}${render(expr)}${end}`
  if (fits(whole) || typeof expr === 'string') return [whole]
  if ('label' in expr) {
    // ktlint starts a named argument's value on a line of its own when it spans lines.
    const inner = `${indent}    `
    return [`${start}${expr.label} =`, ...exprLines(inner, inner, expr.value, end)]
  }
  return callLines(start, indent, expr, end)
}

function callLines(start: string, indent: string, call: Call, end: string) {
  const whole = `${start}${render(call)}${end}`
  if (fits(whole)) return [whole]
  const inner = `${indent}    `
  const opening =
    call.args.length === 0 ? call.name : `${call.name}(${call.args.map(render).join(', ')})`
  if (call.lambda !== undefined && (call.args.length === 0 || fits(`${start}${opening} {`))) {
    return [`${start}${opening} {`, ...exprLines(inner, inner, call.lambda, ''), `${indent}}${end}`]
  }
  if (call.args.length === 0) return [whole]
  const args = call.args.flatMap((arg) => exprLines(inner, inner, arg, ','))
  if (call.lambda === undefined) return [`${start}${call.name}(`, ...args, `${indent})${end}`]
  const closing = `${indent}) { ${render(call.lambda)} }${end}`
  return [
    `${start}${call.name}(`,
    ...args,
    ...(fits(closing)
      ? [closing]
      : [`${indent}) {`, ...exprLines(inner, inner, call.lambda, ''), `${indent}}${end}`]),
  ]
}

// The calls of a chain after the first, each on a line of its own, save that the call after one
// broken over lines goes on that one's closing line, whose indent is `closing`.
function alignedLines(
  indent: string,
  lines: readonly string[],
  closing: string | null,
  calls: readonly Call[],
): readonly string[] {
  const [call, ...rest] = calls
  if (call === undefined) return lines
  const inner = `${indent}    `
  const laid =
    closing === null
      ? callLines(`${inner}.`, inner, call, '')
      : callLines(`${lines.at(-1) ?? ''}.`, closing, call, '')
  const next = closing === null ? [...lines, ...laid] : [...lines.slice(0, -1), ...laid]
  return alignedLines(indent, next, laid.length > 1 ? (closing ?? inner) : null, rest)
}

function chainLines(indent: string, calls: readonly Call[]) {
  const [head, ...rest] = calls
  const single = `${indent}${renderChain(calls)}`
  if (rest.length < CHAIN_OPERATOR_LIMIT && fits(single)) return [single]
  if (rest.length === 0) return callLines(indent, indent, head, '')
  const first = `${indent}${render(head)}`
  if (!fits(first)) {
    // The first call broken over lines, the others follow on its closing line.
    const headLines = callLines(indent, indent, head, '')
    const tail = `${headLines.at(-1) ?? ''}.${renderChain(rest)}`
    return fits(tail)
      ? [...headLines.slice(0, -1), tail]
      : alignedLines(indent, headLines, indent, rest)
  }
  const [last] = rest
  if (rest.length === 1 && (last.args.length > 0 || last.lambda !== undefined)) {
    const tail = callLines(`${first}.`, indent, last, '')
    if (tail.every(fits)) return tail
  }
  return alignedLines(indent, [first], null, rest)
}

function propertyLines(indent: string, head: string, calls: readonly Call[]) {
  const single = `${indent}${head} = ${renderChain(calls)}`
  if (calls.length <= CHAIN_OPERATOR_LIMIT && fits(single)) return [single]
  return [`${indent}${head} =`, ...chainLines(`${indent}    `, calls)]
}

/** Lines of Kotlin, laid out once the names in them are resolved. */
type Lines = (resolve: (text: string) => string) => readonly string[]

function resolveExpr(expr: Expr, resolve: (text: string) => string): Expr {
  if (typeof expr === 'string') return resolve(expr)
  if ('label' in expr) return { label: expr.label, value: resolveExpr(expr.value, resolve) }
  return resolveCall(expr, resolve)
}

function resolveCall(call: Call, resolve: (text: string) => string): Call {
  const args = call.args.map((arg) => resolveExpr(arg, resolve))
  return call.lambda === undefined
    ? { name: resolve(call.name), args }
    : { name: resolve(call.name), args, lambda: resolveExpr(call.lambda, resolve) }
}

function resolveCalls(calls: readonly Call[], resolve: (text: string) => string) {
  return calls.map((call) => resolveCall(call, resolve))
}

function textLines(lines: readonly string[]): Lines {
  return (resolve) => lines.map(resolve)
}

function property(indent: string, head: string, calls: readonly Call[]): Lines {
  return (resolve) => propertyLines(indent, resolve(head), resolveCalls(calls, resolve))
}

function statement(indent: string, calls: readonly Call[]): Lines {
  return (resolve) => chainLines(indent, resolveCalls(calls, resolve))
}

// `head left operator right`, broken after the operator when it does not fit.
function delegate(
  indent: string,
  head: string,
  left: string,
  operator: string,
  right: string,
): Lines {
  return (resolve) => {
    const single = `${indent}${head} ${resolve(left)} ${operator} ${resolve(right)}`
    return fits(single)
      ? [single]
      : [`${indent}${head} ${resolve(left)} ${operator}`, `${indent}    ${resolve(right)}`]
  }
}

// `head(args)tail`, the arguments wrapped when the line does not fit.
function headerLines(indent: string, head: string, args: readonly string[], tail: string): Lines {
  return (resolve) => {
    const resolved = args.map(resolve)
    const single = `${indent}${resolve(head)}(${resolved.join(', ')})${tail}`
    return fits(single)
      ? [single]
      : [
          `${indent}${resolve(head)}(`,
          ...resolved.map((arg) => `${indent}    ${arg},`),
          `${indent})${tail}`,
        ]
  }
}

function joinLines(...parts: readonly Lines[]): Lines {
  return (resolve) => parts.flatMap((part) => part(resolve))
}

type Scope = {
  /** The names a class receiver could be read as instead: properties of the class being written. */
  readonly members: ReadonlySet<string>
  /** The classes nested in a supertype, whose simple names shadow any other. */
  readonly nestedTypes: ReadonlySet<string>
}

const FILE_SCOPE: Scope = { members: new Set(), nestedTypes: new Set() }

type Block = { readonly scope: Scope; readonly lines: Lines }

function fileBlock(content: Lines, scope: Scope = FILE_SCOPE) {
  return { scope, lines: content }
}

const DEFAULT_IMPORTS = new Set([
  'java.lang',
  'kotlin',
  'kotlin.annotation',
  'kotlin.collections',
  'kotlin.comparisons',
  'kotlin.io',
  'kotlin.jvm',
  'kotlin.ranges',
  'kotlin.sequences',
  'kotlin.text',
])

function packageOf(fullName: string) {
  return fullName.slice(0, fullName.lastIndexOf('.'))
}

function simpleName(fullName: string) {
  return fullName.slice(fullName.lastIndexOf('.') + 1)
}

function isDefaultImport(fullName: string) {
  return DEFAULT_IMPORTS.has(packageOf(fullName))
}

function isShadowed(kind: string, name: string, scope: Scope) {
  return (kind === 'E' && scope.members.has(name)) || scope.nestedTypes.has(name)
}

// ktlint's import order: lexicographic, with java, javax and kotlin last.
function importRank(fullName: string) {
  if (fullName.startsWith('java.')) return 1
  if (fullName.startsWith('javax.')) return 2
  if (fullName.startsWith('kotlin.')) return 3
  return 0
}

function compareImports(left: string, right: string) {
  const rank = importRank(left) - importRank(right)
  if (rank !== 0) return rank
  return left < right ? -1 : left > right ? 1 : 0
}

function placeholders(blocks: readonly Block[]) {
  return blocks.flatMap((b) =>
    b
      .lines((line) => line)
      .flatMap((line) =>
        [...line.matchAll(PLACEHOLDER)].map(([, kind, fullName]) => ({
          kind,
          fullName,
          scope: b.scope,
        })),
      ),
  )
}

// The name a class is imported under where its simple name is taken: its package's last segment
// before it (`java.time.Instant` as `TimeInstant`, a model's `PrimaryKey` as `ModelsPrimaryKey`).
function aliasCandidate(fullName: string, packageName: string) {
  const owner = fullName.startsWith('.') ? packageName : packageOf(fullName)
  const segment = owner.slice(owner.lastIndexOf('.') + 1)
  return `${segment.charAt(0).toUpperCase()}${segment.slice(1)}${simpleName(fullName)}`
}

/**
 * Resolves the placeholders of a file's blocks, lays the blocks out and puts the package and the
 * imports on. A class whose simple name is taken where it is used — by a declaration of the package,
 * another class, or a class nested in the supertype — is imported under an alias instead.
 *
 * @param packageName - The package.
 * @param types - The simple names of the package's own declarations.
 * @param blocks - The file's blocks, in order, each with the names that shadow a class inside it.
 * @returns The finished file.
 */
function renderFile(packageName: string, types: ReadonlySet<string>, blocks: readonly Block[]) {
  const refs = placeholders(blocks)
  const classes = [
    ...new Set(
      refs.filter((r) => r.kind !== 'F' && !r.fullName.startsWith('.')).map((r) => r.fullName),
    ),
  ]
  // One class per simple name is written simply: a class Kotlin imports by default before any
  // other, and none whose name a declaration of the package takes.
  const simpleClasses = new Set(
    classes.filter((fullName) => {
      const name = simpleName(fullName)
      if (types.has(name)) return false
      const rivals = classes.filter((other) => simpleName(other) === name)
      return (rivals.find(isDefaultImport) ?? rivals[0]) === fullName
    }),
  )
  const isSimple = (kind: string, fullName: string, scope: Scope) => {
    if (kind === 'F') return true
    const name = simpleName(fullName)
    if (isShadowed(kind, name, scope)) return false
    return fullName.startsWith('.') || simpleClasses.has(fullName)
  }
  const aliased = [
    ...new Set(refs.filter((r) => !isSimple(r.kind, r.fullName, r.scope)).map((r) => r.fullName)),
  ]
  const taken = [
    ...types,
    ...refs.map((r) => simpleName(r.fullName)),
    ...blocks.flatMap((b) => [...b.scope.members, ...b.scope.nestedTypes]),
  ]
  const aliases = allocate(
    aliased.map((fullName) => ({
      key: fullName,
      candidate: aliasCandidate(fullName, packageName),
    })),
    taken,
    asIs,
  )
  const resolve = (kind: string, fullName: string, scope: Scope) =>
    isSimple(kind, fullName, scope) ? simpleName(fullName) : (aliases.get(fullName) ?? fullName)
  const imports = [
    ...new Set(
      refs.flatMap((r) =>
        r.fullName.startsWith('.') ||
        isDefaultImport(r.fullName) ||
        !isSimple(r.kind, r.fullName, r.scope)
          ? []
          : [r.fullName],
      ),
    ),
  ].toSorted(compareImports)
  // ktlint puts the imports under an alias after the others.
  const aliasImports = aliased
    .map((fullName) => {
      const path = fullName.startsWith('.') ? `${packageName}${fullName}` : fullName
      return `${path} as ${aliases.get(fullName) ?? simpleName(fullName)}`
    })
    .toSorted()
  const body = blocks.flatMap((b) =>
    b.lines((line) =>
      line.replaceAll(PLACEHOLDER, (_, kind: string, fullName: string) =>
        resolve(kind, fullName, b.scope),
      ),
    ),
  )
  const allImports = [...imports, ...aliasImports]
  return [
    `package ${packageName}`,
    '',
    ...(allImports.length > 0 ? [...allImports.map((i) => `import ${i}`), ''] : []),
    ...body,
    '',
  ].join('\n')
}

function generatedTypes(plan: ExposedPlan) {
  return new Set([
    SCHEMA_OBJECT,
    ...SUPPORT_TYPES,
    ...plan.names.tables.values(),
    ...plan.names.entities.values(),
    ...plan.names.enums.values(),
    ...plan.names.joins.values(),
  ])
}

/**
 * The Kotlin enum of a Prisma enum. Each constant carries its PostgreSQL label — the value's
 * `@map`, or its name — which is what the column reads and writes.
 *
 * @param plan - The plan.
 * @param e - The enum.
 * @returns The file, as `{ fileName, code }`.
 */
export function enumFile(plan: ExposedPlan, e: DMMF.DatamodelEnum) {
  const name = enumName(plan, e.name)
  const entries = e.values.map((value) =>
    headerLines(
      '    ',
      plan.names.entries.get(e.name)?.get(value.name) ?? value.name,
      [kotlinString(value.dbName ?? value.name)],
      ',',
    ),
  )
  const content = joinLines(
    textLines([`enum class ${name}(`, `    val dbName: ${typeRef(KT.String)},`, ') {']),
    ...entries,
    textLines(['}']),
  )
  return {
    fileName: `${name}.kt`,
    code: renderFile(plan.names.package, generatedTypes(plan), [fileBlock(content)]),
  }
}

function tableKeyArgs(plan: ExposedPlan, model: DMMF.Model) {
  return keyFieldNames(plan.keyOf(model)).map((field) =>
    kotlinName(columnProperty(plan, model, field)),
  )
}

// Whether a chain of foreign keys leads from one model to another: each one makes its table
// object initialize the one it references.
function reaches(
  plan: ExposedPlan,
  from: DMMF.Model,
  to: DMMF.Model,
  seen: ReadonlySet<DMMF.Model> = new Set(),
): boolean {
  const next = plan.foreignKeys
    .filter((fk) => fk.dependent === from && !seen.has(fk.principal))
    .map((fk) => fk.principal)
  return next.some(
    (model) => model === to || reaches(plan, model, to, new Set([...seen, from, ...next])),
  )
}

// A table object that refers to another one initializes it on the spot, and in a cycle of
// references that other object can only see the columns declared above the one that started it:
// in a table on such a cycle, the columns the cycle references are declared first. (A table's own
// init block runs once its columns are all declared.)
function columnOrder(plan: ExposedPlan, model: DMMF.Model) {
  const referenced = new Set(
    plan.foreignKeys
      .filter(
        (fk) =>
          fk.principal === model &&
          (fk.dependent === model
            ? fk.inline
            : reaches(plan, fk.dependent, model) && reaches(plan, model, fk.dependent)),
      )
      .flatMap((fk) => fk.to),
  )
  const fields = scalarFields(model)
  return [
    ...fields.filter((f) => referenced.has(f.name)),
    ...fields.filter((f) => !referenced.has(f.name)),
  ]
}

function indexCalls(plan: ExposedPlan, model: DMMF.Model) {
  const inline = new Set(inlineUniques(plan, model))
  return modelIndexesOf(plan, model)
    .filter((index) => (index.type === 'unique' || index.type === 'normal') && !inline.has(index))
    .map((index) => {
      const name = kotlinString(exposedConstraintName(indexName(model, index)))
      // A sort order or an operator class is written into the column list itself, which Exposed
      // takes from `functions` as it is.
      const expressions = index.fields.some(
        (f) => f.sortOrder === 'desc' || (f.operatorClass !== undefined && f.operatorClass !== ''),
      )
      const columns = expressions
        ? [
            {
              label: 'functions',
              value: {
                name: funRef(KT.listOf),
                args: index.fields.map((f) => {
                  const field = model.fields.find((mf) => mf.name === f.name)
                  const operator =
                    f.operatorClass === undefined || f.operatorClass === ''
                      ? ''
                      : ` ${operatorClassName(f.operatorClass, field?.nativeType?.[0])}`
                  const order = f.sortOrder === 'desc' ? ' DESC' : ''
                  const sql = `${sqlQuoted(field ? columnName(field) : f.name)}${operator}${order}`
                  return { name: funRef(local('indexExpression')), args: [kotlinString(sql)] }
                }),
              },
            },
          ]
        : index.fields.map((f) => kotlinName(columnProperty(plan, model, f.name)))
      const method = index.algorithm === undefined ? undefined : INDEX_METHODS[index.algorithm]
      const type = method === undefined ? [] : [`indexType = ${kotlinString(method)}`]
      const filter: readonly Expr[] =
        index.where === undefined
          ? []
          : [
              {
                label: 'filterCondition',
                value: { name: funRef(local('sqlCondition')), args: [kotlinString(index.where)] },
              },
            ]
      return index.type === 'unique'
        ? { name: 'uniqueIndex', args: [name, ...columns, ...filter] }
        : { name: 'index', args: [name, 'false', ...columns, ...type, ...filter] }
    })
}

function foreignKeyCalls(plan: ExposedPlan, model: DMMF.Model) {
  return plan.foreignKeys
    .filter((fk) => fk.dependent === model && !fk.inline)
    .map((fk) => ({
      name: 'foreignKey',
      args: [
        ...fk.from.map((from, position) => {
          const target = kotlinName(columnProperty(plan, fk.principal, fk.to[position]))
          return `${kotlinName(columnProperty(plan, model, from))} to ${tableRef(plan, fk.principal)}.${target}`
        }),
        ...foreignKeyArgs(fk, 'name'),
      ],
    }))
}

// The parts of a composite key that are reference columns, which join the key with addIdColumn;
// the others are declared with `.entityId()`.
function addedIdColumns(plan: ExposedPlan, model: DMMF.Model) {
  const key = plan.keyOf(model)
  if (key.kind !== 'composite') return []
  return key.fields.filter((field) => isReferenceColumn(plan, inlineForeignKey(plan, model, field)))
}

function keyPartCalls(plan: ExposedPlan, model: DMMF.Model, field: DMMF.Field) {
  const calls = columnCalls(plan, model, field)
  const key = plan.keyOf(model)
  const isPart = key.kind === 'composite' && key.fields.includes(field)
  return isPart && !addedIdColumns(plan, model).includes(field)
    ? [...calls, { name: 'entityId', args: [] }]
    : calls
}

/**
 * The table object of a model: its columns with their types, defaults and foreign keys, its key,
 * unique criteria and indexes, as Prisma Migrate names them.
 *
 * @param plan - The plan.
 * @param model - The model.
 * @returns The file, as `{ fileName, code }`.
 */
export function tableFile(plan: ExposedPlan, model: DMMF.Model) {
  const name = plan.names.tables.get(model.name) ?? model.name
  return {
    fileName: `${name}.kt`,
    code: renderFile(plan.names.package, generatedTypes(plan), tableBlocks(plan, model)),
  }
}

function tableBlocks(plan: ExposedPlan, model: DMMF.Model) {
  const name = plan.names.tables.get(model.name) ?? model.name
  const key = plan.keyOf(model)
  const base =
    key.kind === 'single'
      ? `${typeRef(KT.IdTable)}<${fieldMapping(plan, key.field).kotlin}>`
      : key.kind === 'composite'
        ? typeRef(KT.CompositeIdTable)
        : typeRef(KT.Table)
  const fields = columnOrder(plan, model)
  const columns = fields.map((field) => {
    const isKey = key.kind === 'single' && key.field === field
    const head = isKey
      ? 'override val id'
      : `val ${kotlinName(columnProperty(plan, model, field.name))}`
    return property('    ', head, keyPartCalls(plan, model, field))
  })
  const primaryKey =
    key.kind !== 'none' && key.index.type === 'id'
      ? [
          property('    ', 'override val primaryKey', [
            {
              name: 'PrimaryKey',
              args: [
                ...tableKeyArgs(plan, model),
                `name = ${kotlinString(exposedConstraintName(indexName(model, key.index)))}`,
              ],
            },
          ]),
        ]
      : []
  const init = [
    ...addedIdColumns(plan, model).map((field): Call => ({
      name: 'addIdColumn',
      args: [kotlinName(columnProperty(plan, model, field.name))],
    })),
    ...indexCalls(plan, model),
    ...foreignKeyCalls(plan, model),
  ]
  const body = joinLines(
    ...columns,
    ...primaryKey,
    ...(init.length > 0
      ? [
          textLines(['', '    init {']),
          ...init.map((c) => statement('        ', [c])),
          textLines(['    }']),
        ]
      : []),
  )
  const scope: Scope = {
    members: new Set([...TABLE_MEMBERS, ...fields.map((f) => columnProperty(plan, model, f.name))]),
    nestedTypes: new Set(TABLE_NESTED_TYPES),
  }
  return [
    fileBlock(
      headerLines('', `object ${name} : ${base}`, [kotlinString(exposedTableName(model))], ' {'),
    ),
    fileBlock(body, scope),
    fileBlock(textLines(['}'])),
  ]
}

function entityRef(plan: ExposedPlan, model: DMMF.Model) {
  return exprRef(local(plan.names.entities.get(model.name) ?? model.name))
}

function columnRef(plan: ExposedPlan, model: DMMF.Model, field: string) {
  return `${tableRef(plan, model)}.${kotlinName(columnProperty(plan, model, field))}`
}

function relationLines(plan: ExposedPlan, model: DMMF.Model, field: DMMF.Field) {
  const name = kotlinName(entityProperty(plan, model, field.name))
  const outgoing = plan.foreignKeys.find((fk) => fk.dependent === model && fk.navigation === field)
  if (outgoing) {
    const target =
      navigationKind(plan, outgoing) === 'table'
        ? tableRef(plan, model)
        : columnRef(plan, model, outgoing.from[0])
    const isKey = outgoing.from.some((from) => isKeyField(plan, model, from))
    return delegate(
      '    ',
      `${isKey ? 'val' : 'var'} ${name} by`,
      entityRef(plan, outgoing.principal),
      outgoing.isRequired ? 'referencedOn' : 'optionalReferencedOn',
      target,
    )
  }
  const incoming = plan.foreignKeys.find((fk) => fk.principal === model && fk.inverse === field)
  if (incoming) {
    const target =
      navigationKind(plan, incoming) === 'table'
        ? tableRef(plan, incoming.dependent)
        : columnRef(plan, incoming.dependent, incoming.from[0])
    const operator = field.isList
      ? incoming.isRequired
        ? 'referrersOn'
        : 'optionalReferrersOn'
      : 'optionalBackReferencedOn'
    return delegate('    ', `val ${name} by`, entityRef(plan, incoming.dependent), operator, target)
  }
  const m2m = plan.manyToMany.find(
    (r) =>
      (r.a.model === model && r.a.field === field) || (r.b.model === model && r.b.field === field),
  )
  if (!m2m) return textLines([])
  const join = exprRef(local(plan.names.joins.get(m2m.relationName) ?? m2m.relationName))
  const isA = m2m.a.model === model && m2m.a.field === field
  if (m2m.a.model !== m2m.b.model) {
    return delegate(
      '    ',
      `var ${name} by`,
      entityRef(plan, isA ? m2m.b.model : m2m.a.model),
      'via',
      join,
    )
  }
  // Both columns of a join table from a model to itself reference that model, so the DAO is told
  // which one holds this row's id: the field whose name sorts first lists the `B` of the rows whose
  // `A` is this row.
  const [source, target] = isA ? ['a', 'b'] : ['b', 'a']
  return headerLines(
    '    ',
    `var ${name} by ${entityRef(plan, model)}.via`,
    [`${join}.${source}`, `${join}.${target}`],
    '',
  )
}

// Prisma sets an @updatedAt field on every write of the row unless the write sets it. The DAO
// inserts an entity straight from its values, the column's client default among them, and updates
// one through `flush`.
function flushLines(plan: ExposedPlan, model: DMMF.Model) {
  // A key cannot change, and the DAO sets no key it has read.
  const stamps = scalarFields(model).filter(
    (f) => f.isUpdatedAt === true && !f.isList && !isKeyField(plan, model, f.name),
  )
  if (stamps.length === 0) return textLines([])
  return joinLines(
    textLines([
      '',
      `    override fun flush(batch: ${typeRef(KT.EntityBatchUpdate)}?): ${typeRef(KT.Boolean)} {`,
      '        if (writeValues.isNotEmpty()) {',
    ]),
    ...stamps.map((field): Lines => {
      const map = fieldMapping(plan, field)
      const now = map.temporal === null ? '' : nowExpr(map.temporal)
      const member = kotlinName(entityProperty(plan, model, field.name))
      // flush's parameter is `batch`.
      const name = member === 'batch' ? `this.${member}` : member
      return (resolve) => {
        const assignment = `                ${name} = ${resolve(now)}`
        return [
          resolve(
            `            if (!${funRef(local('isWritten'))}(${columnRef(plan, model, field.name)})) {`,
          ),
          ...(fits(assignment)
            ? [assignment]
            : [`                ${name} =`, `                    ${resolve(now)}`]),
          '            }',
        ]
      }
    }),
    textLines(['        }', '        return super.flush(batch)', '    }']),
  )
}

/**
 * The DAO entity of a model: a property per column and per relation the DAO can follow.
 *
 * @param plan - The plan.
 * @param model - The model, which has a key.
 * @returns The file, as `{ fileName, code }`.
 */
export function entityFile(plan: ExposedPlan, model: DMMF.Model) {
  const name = plan.names.entities.get(model.name) ?? model.name
  return {
    fileName: `${name}.kt`,
    code: renderFile(plan.names.package, generatedTypes(plan), entityBlocks(plan, model)),
  }
}

function entityBlocks(plan: ExposedPlan, model: DMMF.Model) {
  const name = plan.names.entities.get(model.name) ?? model.name
  const key = plan.keyOf(model)
  const isComposite = key.kind === 'composite'
  const keyType =
    key.kind === 'single' ? fieldMapping(plan, key.field).kotlin : typeRef(KT.CompositeID)
  const heading = textLines([
    `class ${name}(`,
    `    id: ${typeRef(KT.EntityID)}<${keyType}>,`,
    isComposite
      ? `) : ${typeRef(KT.CompositeEntity)}(id) {`
      : `) : ${typeRef(KT.Entity)}<${keyType}>(id) {`,
  ])
  const companion = headerLines(
    '    ',
    isComposite
      ? `companion object : ${typeRef(KT.CompositeEntityClass)}<${typeRef(local(name))}>`
      : `companion object : ${typeRef(KT.EntityClass)}<${keyType}, ${typeRef(local(name))}>`,
    [tableRef(plan, model)],
    '',
  )
  const relations = relationFields(plan, model)
  const members = model.fields.flatMap((field): Lines[] => {
    if (field.kind === 'object') {
      return relations.has(field.name) ? [relationLines(plan, model, field)] : []
    }
    if (field.kind !== 'scalar' && field.kind !== 'enum') return []
    if (key.kind === 'single' && key.field === field) return []
    const keyword = isKeyField(plan, model, field.name) ? 'val' : 'var'
    const member = kotlinName(entityProperty(plan, model, field.name))
    const column = columnRef(plan, model, field.name)
    return [
      (resolve: (line: string) => string) => {
        const single = `    ${keyword} ${member} by ${resolve(column)}`
        return fits(single)
          ? [single]
          : [`    ${keyword} ${member} by`, `        ${resolve(column)}`]
      },
    ]
  })
  const scope: Scope = {
    members: new Set([
      ...ENTITY_MEMBERS,
      ...(plan.names.properties.get(model.name)?.values() ?? []),
    ]),
    nestedTypes: new Set(),
  }
  return [
    fileBlock(heading),
    fileBlock(companion),
    fileBlock(
      joinLines(
        ...(members.length === 0 ? [] : [textLines([''])]),
        ...members,
        flushLines(plan, model),
      ),
      scope,
    ),
    fileBlock(textLines(['}'])),
  ]
}

/**
 * The join table Prisma keeps an implicit many-to-many relation in: `_<relation>`, with the key of
 * the model whose name sorts first in `A`, the other's in `B`.
 *
 * @param plan - The plan.
 * @param m2m - The relation.
 * @returns The file, as `{ fileName, code }`.
 */
export function joinTableFile(plan: ExposedPlan, m2m: ManyToMany) {
  const name = plan.names.joins.get(m2m.relationName) ?? m2m.relationName
  return {
    fileName: `${name}.kt`,
    code: renderFile(plan.names.package, generatedTypes(plan), joinTableBlocks(plan, m2m)),
  }
}

function joinTableBlocks(plan: ExposedPlan, m2m: ManyToMany) {
  const name = plan.names.joins.get(m2m.relationName) ?? m2m.relationName
  const table = prismaConstraintName(`_${m2m.relationName}`, '')
  const constraint = (suffix: string) =>
    kotlinString(exposedConstraintName(prismaConstraintName(table, suffix)))
  const cascade = referenceOptionRef('CASCADE')
  // A reference copies the type of the key, which for a smallserial would be another one.
  const column = (member: string, label: string, model: DMMF.Model) => {
    const key = plan.keyOf(model)
    const labelName = kotlinString(sqlQuoted(label))
    const target = tableRef(plan, model)
    const actions = [
      `onDelete = ${cascade}`,
      `onUpdate = ${cascade}`,
      `fkName = ${constraint(`_${label}_fkey`)}`,
    ]
    const calls: readonly Call[] =
      key.kind === 'single' && isSmallserial(key.field)
        ? [
            { name: 'short', args: [labelName] },
            ...(plan.foreignKeysInDatabase
              ? [{ name: 'references', args: [`${target}.id`, ...actions] }]
              : []),
          ]
        : plan.foreignKeysInDatabase
          ? [{ name: 'reference', args: [labelName, target, ...actions] }]
          : [{ name: 'entityId', args: [labelName, target] }]
    return property('    ', `val ${member}`, calls)
  }
  const schema = m2m.a.model.schema
  const fullName = !schema
    ? isFolded(table)
      ? sqlQuoted(table)
      : table
    : isFolded(schema) || isFolded(table)
      ? `${sqlQuoted(schema)}.${sqlQuoted(table)}`
      : `${schema}.${table}`
  const body = joinLines(
    column('a', 'A', m2m.a.model),
    column('b', 'B', m2m.b.model),
    property('    ', 'override val primaryKey', [
      { name: 'PrimaryKey', args: ['a', 'b', `name = ${constraint('_AB_pkey')}`] },
    ]),
    textLines(['', '    init {']),
    statement('        ', [{ name: 'index', args: [constraint('_B_index'), 'false', 'b'] }]),
    textLines(['    }']),
  )
  const scope: Scope = {
    members: new Set([...TABLE_MEMBERS, 'a', 'b']),
    nestedTypes: new Set(TABLE_NESTED_TYPES),
  }
  return [
    fileBlock(
      headerLines('', `object ${name} : ${typeRef(KT.Table)}`, [kotlinString(fullName)], ' {'),
    ),
    fileBlock(body, scope),
    fileBlock(textLines(['}'])),
  ]
}

/**
 * The tables of the schema, and what `SchemaUtils.create` needs before them: the schemas and the
 * enum types, which Exposed does not create.
 *
 * @param plan - The plan.
 * @returns The file, as `{ fileName, code }`.
 */
export function schemaFile(plan: ExposedPlan) {
  const schemas = [
    ...new Set([
      ...plan.models.flatMap((m) => (m.schema ? [m.schema] : [])),
      ...plan.enumSchemas.values(),
    ]),
  ].toSorted()
  const enumTypes = plan.enums.map((e) => {
    const labels = e.values.map((v) => sqlString(v.dbName ?? v.name)).join(', ')
    return kotlinString(`CREATE TYPE ${enumSqlType(plan, e)} AS ENUM (${labels})`)
  })
  const tables = [
    ...plan.models.map((m) => tableRef(plan, m)),
    ...plan.manyToMany.map((m2m) =>
      exprRef(local(plan.names.joins.get(m2m.relationName) ?? m2m.relationName)),
    ),
  ]
  const list = (items: readonly string[]): Call =>
    items.length === 0
      ? { name: funRef(KT.emptyList), args: [] }
      : { name: funRef(KT.listOf), args: items }
  const listOf = (type: string) => `${typeRef(KT.List)}<${typeRef(type)}>`
  const body = joinLines(
    property('    ', `val schemas: ${listOf(KT.Schema)}`, [
      list(
        schemas.map((s) => callText(exprRef(KT.Schema), [kotlinString(exposedConstraintName(s))])),
      ),
    ]),
    property('    ', `val enumTypes: ${listOf(KT.String)}`, [list(enumTypes)]),
    property('    ', `val tables: ${listOf(KT.Table)}`, [list(tables)]),
  )
  return {
    fileName: `${SCHEMA_OBJECT}.kt`,
    code: renderFile(plan.names.package, generatedTypes(plan), [
      fileBlock(textLines([`object ${SCHEMA_OBJECT} {`])),
      fileBlock(body, {
        members: new Set(['enumTypes', 'schemas', 'tables']),
        nestedTypes: new Set(),
      }),
      fileBlock(textLines(['}'])),
    ]),
  }
}

const t = typeRef
const x = exprRef

type Declaration = {
  readonly name: string
  readonly needs: readonly string[]
  readonly lines: readonly string[]
}

function readObjectLines(returns: string) {
  return [
    '    override fun readObject(',
    `        rs: ${t(KT.RowApi)},`,
    `        index: ${t(KT.Int)},`,
    `    ): ${t(KT.Any)}? = ${returns}`,
  ]
}

function unexpected(subject: string) {
  return `${funRef(KT.error)}("Unexpected value of type \${value::class.qualifiedName}${subject}: $value")`
}

// A column type of java.time values, bound and read as the java.time class JDBC 4.2 maps the
// PostgreSQL type to, so that no conversion goes through the JVM's default time zone.
function temporalClass(
  name: string,
  kotlin: string,
  sqlType: string,
  precision: boolean,
  readAs: string,
  fromRead: string,
  toDb: string | null,
) {
  const header = precision
    ? [
        `internal class ${name}(`,
        `    val precision: ${t(KT.Int)}? = null,`,
        `) : ${t(KT.ColumnType)}<${t(kotlin)}>() {`,
      ]
    : [`internal class ${name} : ${t(KT.ColumnType)}<${t(kotlin)}>() {`]
  const sql = precision
    ? `if (precision == null) "${sqlType}" else "${sqlType}($precision)"`
    : `"${sqlType}"`
  return [
    ...header,
    `    override fun sqlType(): ${t(KT.String)} = ${sql}`,
    '',
    `    override fun valueFromDB(value: ${t(KT.Any)}): ${t(kotlin)} =`,
    '        when (value) {',
    `            is ${x(kotlin)} -> value`,
    ...(readAs === kotlin ? [] : [`            is ${x(readAs)} -> ${fromRead}`]),
    `            else -> ${unexpected('')}`,
    '        }',
    '',
    ...readObjectLines(`rs.getObject(index, ${x(readAs)}::class.java)`),
    ...(toDb === null
      ? []
      : ['', `    override fun notNullValueToDB(value: ${t(kotlin)}): ${t(KT.Any)} = ${toDb}`]),
    '',
    `    override fun nonNullValueToString(value: ${t(kotlin)}): ${t(KT.String)} = ${
      toDb === null ? `"'$value'"` : `"'\${notNullValueToDB(value)}'"`
    }`,
    '}',
  ]
}

function temporalFactory(name: string, columnType: string, kotlin: string, precision: boolean) {
  return precision
    ? [
        `internal fun ${t(KT.Table)}.${name}(`,
        `    name: ${t(KT.String)},`,
        `    precision: ${t(KT.Int)}? = null,`,
        `): ${t(KT.Column)}<${t(kotlin)}> = registerColumn(name, ${columnType}(precision))`,
      ]
    : [
        `internal fun ${t(KT.Table)}.${name}(name: ${t(KT.String)}): ${t(KT.Column)}<${t(kotlin)}> = registerColumn(name, ${columnType}())`,
      ]
}

function stringFactory(name: string, sqlType: string, cast: string) {
  return [
    `internal fun ${t(KT.Table)}.${name}(name: ${t(KT.String)}): ${t(KT.Column)}<${t(KT.String)}> = registerColumn(name, PgStringColumnType("${sqlType}", "${cast}"))`,
  ]
}

const utc = `${x(KT.ZoneOffset)}.UTC`

// Each declaration the tables may use, in the order the support file writes them, with the other
// declarations it uses.
const SUPPORT: readonly Declaration[] = [
  {
    name: 'SqlExpression',
    needs: [],
    lines: [
      'internal class SqlExpression<T>(',
      `    private val sql: ${t(KT.String)},`,
      `    columnType: ${t(KT.IColumnType)}<T & ${t(KT.Any)}>,`,
      `) : ${t(KT.Function)}<T>(columnType) {`,
      `    override fun toQueryBuilder(queryBuilder: ${t(KT.QueryBuilder)}) {`,
      '        queryBuilder.append(sql)',
      '    }',
      '}',
    ],
  },
  {
    name: 'databaseDefault',
    needs: ['SqlExpression'],
    lines: [
      `internal fun <T> ${t(KT.Column)}<T>.databaseDefault(`,
      `    sql: ${t(KT.String)},`,
      '    value: (() -> T)? = null,',
      `): ${t(KT.Column)}<T> = with(table) { defaultExpression(SqlExpression(sql, columnType)).also { it.defaultValueFun = value } }`,
    ],
  },
  {
    name: 'SqlCondition',
    needs: [],
    lines: [
      'internal class SqlCondition(',
      `    private val sql: ${t(KT.String)},`,
      `) : ${t(KT.Op)}<${t(KT.Boolean)}>() {`,
      `    override fun toQueryBuilder(queryBuilder: ${t(KT.QueryBuilder)}) {`,
      '        queryBuilder.append(sql)',
      '    }',
      '}',
    ],
  },
  {
    name: 'sqlCondition',
    needs: ['SqlCondition'],
    lines: [
      `internal fun sqlCondition(sql: ${t(KT.String)}): () -> ${t(KT.Op)}<${t(KT.Boolean)}> = { SqlCondition(sql) }`,
    ],
  },
  {
    name: 'indexExpression',
    needs: ['SqlExpression'],
    lines: [
      `internal fun indexExpression(sql: ${t(KT.String)}): ${t(KT.Function)}<${t(KT.String)}> = SqlExpression(sql, ${x(KT.TextColumnType)}())`,
    ],
  },
  {
    name: 'PgTimestampColumnType',
    needs: [],
    lines: temporalClass(
      'PgTimestampColumnType',
      KT.Instant,
      'TIMESTAMP',
      true,
      KT.LocalDateTime,
      `value.toInstant(${utc})`,
      `${x(KT.LocalDateTime)}.ofInstant(value, ${utc})`,
    ),
  },
  {
    name: 'pgTimestamp',
    needs: ['PgTimestampColumnType'],
    lines: temporalFactory('pgTimestamp', 'PgTimestampColumnType', KT.Instant, true),
  },
  {
    name: 'PgTimestamptzColumnType',
    needs: [],
    lines: temporalClass(
      'PgTimestamptzColumnType',
      KT.Instant,
      'TIMESTAMPTZ',
      true,
      KT.OffsetDateTime,
      'value.toInstant()',
      `value.atOffset(${utc})`,
    ),
  },
  {
    name: 'pgTimestamptz',
    needs: ['PgTimestamptzColumnType'],
    lines: temporalFactory('pgTimestamptz', 'PgTimestamptzColumnType', KT.Instant, true),
  },
  {
    name: 'PgDateColumnType',
    needs: [],
    lines: temporalClass('PgDateColumnType', KT.LocalDate, 'DATE', false, KT.LocalDate, '', null),
  },
  {
    name: 'pgDate',
    needs: ['PgDateColumnType'],
    lines: temporalFactory('pgDate', 'PgDateColumnType', KT.LocalDate, false),
  },
  {
    name: 'PgTimeColumnType',
    needs: [],
    lines: temporalClass('PgTimeColumnType', KT.LocalTime, 'TIME', true, KT.LocalTime, '', null),
  },
  {
    name: 'pgTime',
    needs: ['PgTimeColumnType'],
    lines: temporalFactory('pgTime', 'PgTimeColumnType', KT.LocalTime, true),
  },
  {
    name: 'PgTimetzColumnType',
    needs: [],
    lines: temporalClass(
      'PgTimetzColumnType',
      KT.OffsetTime,
      'TIMETZ',
      true,
      KT.OffsetTime,
      '',
      null,
    ),
  },
  {
    name: 'pgTimetz',
    needs: ['PgTimetzColumnType'],
    lines: temporalFactory('pgTimetz', 'PgTimetzColumnType', KT.OffsetTime, true),
  },
  {
    name: 'PgEnumColumnType',
    needs: [],
    lines: [
      `internal class PgEnumColumnType<E : ${t(KT.Enum)}<E>>(`,
      `    val typeName: ${t(KT.String)},`,
      `    val entries: ${t(KT.List)}<E>,`,
      `    val dbName: (E) -> ${t(KT.String)},`,
      `) : ${t(KT.ColumnType)}<E>() {`,
      `    override fun sqlType(): ${t(KT.String)} = typeName`,
      '',
      `    override fun valueFromDB(value: ${t(KT.Any)}): E =`,
      '        entries.firstOrNull { it == value }',
      '            ?: entries.firstOrNull { dbName(it) == value.toString() }',
      `            ?: ${funRef(KT.error)}("Unexpected value of $typeName: $value")`,
      '',
      ...readObjectLines('rs.getString(index)'),
      '',
      `    override fun notNullValueToDB(value: E): ${t(KT.Any)} = dbName(value)`,
      '',
      `    override fun nonNullValueToString(value: E): ${t(KT.String)} = "'\${dbName(value).replace("'", "''")}'"`,
      '',
      `    override fun parameterMarker(value: E?): ${t(KT.String)} = "?::$typeName"`,
      '}',
    ],
  },
  {
    name: 'pgEnum',
    needs: ['PgEnumColumnType'],
    lines: [
      `internal fun <E : ${t(KT.Enum)}<E>> ${t(KT.Table)}.pgEnum(`,
      `    name: ${t(KT.String)},`,
      `    typeName: ${t(KT.String)},`,
      `    entries: ${t(KT.List)}<E>,`,
      `    dbName: (E) -> ${t(KT.String)},`,
      `): ${t(KT.Column)}<E> = registerColumn(name, PgEnumColumnType(typeName, entries, dbName))`,
    ],
  },
  {
    name: 'PgStringColumnType',
    needs: [],
    lines: [
      'internal class PgStringColumnType(',
      `    val typeName: ${t(KT.String)},`,
      `    val castName: ${t(KT.String)},`,
      `) : ${t(KT.TextColumnType)}() {`,
      `    override fun sqlType(): ${t(KT.String)} = typeName`,
      '',
      `    override fun valueFromDB(value: ${t(KT.Any)}): ${t(KT.String)} =`,
      '        when (value) {',
      `            is ${x(KT.Boolean)} -> if (value) "1" else "0"`,
      '            else -> value.toString()',
      '        }',
      '',
      ...readObjectLines('rs.getString(index)'),
      '',
      `    override fun nonNullValueToString(value: ${t(KT.String)}): ${t(KT.String)} = "'\${value.replace("'", "''")}'"`,
      '',
      `    override fun parameterMarker(value: ${t(KT.String)}?): ${t(KT.String)} = "?::$castName"`,
      '}',
    ],
  },
  {
    name: 'pgVarchar',
    needs: ['PgStringColumnType'],
    lines: stringFactory('pgVarchar', 'VARCHAR', 'varchar'),
  },
  {
    name: 'pgCitext',
    needs: ['PgStringColumnType'],
    lines: stringFactory('pgCitext', 'CITEXT', 'citext'),
  },
  { name: 'pgInet', needs: ['PgStringColumnType'], lines: stringFactory('pgInet', 'INET', 'inet') },
  { name: 'pgXml', needs: ['PgStringColumnType'], lines: stringFactory('pgXml', 'XML', 'xml') },
  {
    name: 'pgBit',
    needs: ['PgStringColumnType'],
    lines: [
      `internal fun ${t(KT.Table)}.pgBit(`,
      `    name: ${t(KT.String)},`,
      `    length: ${t(KT.Int)},`,
      `): ${t(KT.Column)}<${t(KT.String)}> = registerColumn(name, PgStringColumnType("BIT($length)", "varbit"))`,
    ],
  },
  {
    name: 'pgVarbit',
    needs: ['PgStringColumnType'],
    lines: [
      `internal fun ${t(KT.Table)}.pgVarbit(`,
      `    name: ${t(KT.String)},`,
      `    length: ${t(KT.Int)}? = null,`,
      `): ${t(KT.Column)}<${t(KT.String)}> = registerColumn(name, PgStringColumnType(if (length == null) "VARBIT" else "VARBIT($length)", "varbit"))`,
    ],
  },
  {
    name: 'PgNumericColumnType',
    needs: [],
    lines: [
      `internal class PgNumericColumnType : ${t(KT.ColumnType)}<${t(KT.BigDecimal)}>() {`,
      `    override fun sqlType(): ${t(KT.String)} = "DECIMAL"`,
      '',
      `    override fun valueFromDB(value: ${t(KT.Any)}): ${t(KT.BigDecimal)} =`,
      '        when (value) {',
      `            is ${x(KT.BigDecimal)} -> value`,
      `            else -> ${x(KT.BigDecimal)}(value.toString())`,
      '        }',
      '}',
    ],
  },
  {
    name: 'pgNumeric',
    needs: ['PgNumericColumnType'],
    lines: [
      `internal fun ${t(KT.Table)}.pgNumeric(name: ${t(KT.String)}): ${t(KT.Column)}<${t(KT.BigDecimal)}> = registerColumn(name, PgNumericColumnType())`,
    ],
  },
  {
    name: 'PgMoneyColumnType',
    needs: [],
    // PostgreSQL writes a money value in lc_monetary's format ($1,234.56, 1.234,56 €, ￥1,235), which
    // the JDBC driver cannot read as a number; it is read as text, whose last separator is the
    // decimal point when one or two digits follow it, and any other separator groups digits.
    lines: [
      `internal class PgMoneyColumnType : ${t(KT.ColumnType)}<${t(KT.BigDecimal)}>() {`,
      `    override fun sqlType(): ${t(KT.String)} = "MONEY"`,
      '',
      `    override fun valueFromDB(value: ${t(KT.Any)}): ${t(KT.BigDecimal)} =`,
      '        when (value) {',
      `            is ${x(KT.BigDecimal)} -> {`,
      '                value',
      '            }',
      '',
      '            else -> {',
      '                val text = value.toString()',
      "                val number = text.filter { it.isDigit() || it == '.' || it == ',' }",
      "                val point = number.lastIndexOfAny(charArrayOf('.', ','))",
      '                val fraction = if (point >= 0 && number.length - point - 1 in 1..2) number.substring(point + 1) else ""',
      '                val whole = number.substring(0, number.length - fraction.length).filter { it.isDigit() }',
      `                val amount = ${x(KT.BigDecimal)}(if (fraction.isEmpty()) whole else "$whole.$fraction")`,
      "                if ('-' in text || '(' in text) amount.negate() else amount",
      '            }',
      '        }',
      '',
      ...readObjectLines('rs.getString(index)'),
      '',
      `    override fun parameterMarker(value: ${t(KT.BigDecimal)}?): ${t(KT.String)} = "?::numeric::money"`,
      '}',
    ],
  },
  {
    name: 'pgMoney',
    needs: ['PgMoneyColumnType'],
    lines: [
      `internal fun ${t(KT.Table)}.pgMoney(name: ${t(KT.String)}): ${t(KT.Column)}<${t(KT.BigDecimal)}> = registerColumn(name, PgMoneyColumnType())`,
    ],
  },
  {
    name: 'PgOidColumnType',
    needs: [],
    lines: [
      `internal class PgOidColumnType : ${t(KT.ColumnType)}<${t(KT.Long)}>() {`,
      `    override fun sqlType(): ${t(KT.String)} = "OID"`,
      '',
      `    override fun valueFromDB(value: ${t(KT.Any)}): ${t(KT.Long)} =`,
      '        when (value) {',
      `            is ${x(KT.Number)} -> value.toLong()`,
      '            else -> value.toString().toLong()',
      '        }',
      '',
      `    override fun parameterMarker(value: ${t(KT.Long)}?): ${t(KT.String)} = "?::oid"`,
      '}',
    ],
  },
  {
    name: 'pgOid',
    needs: ['PgOidColumnType'],
    lines: [
      `internal fun ${t(KT.Table)}.pgOid(name: ${t(KT.String)}): ${t(KT.Column)}<${t(KT.Long)}> = registerColumn(name, PgOidColumnType())`,
    ],
  },
  {
    name: 'PgSmallserialColumnType',
    needs: [],
    lines: [
      `internal class PgSmallserialColumnType : ${t(KT.ColumnType)}<${t(KT.Short)}>() {`,
      `    override fun sqlType(): ${t(KT.String)} = "SMALLSERIAL"`,
      '',
      `    override fun valueFromDB(value: ${t(KT.Any)}): ${t(KT.Short)} =`,
      '        when (value) {',
      `            is ${x(KT.Number)} -> value.toShort()`,
      '            else -> value.toString().toShort()',
      '        }',
      '}',
    ],
  },
  {
    name: 'pgSmallserial',
    needs: ['PgSmallserialColumnType'],
    lines: [
      `internal fun ${t(KT.Table)}.pgSmallserial(name: ${t(KT.String)}): ${t(KT.Column)}<${t(KT.Short)}> = registerColumn(name, PgSmallserialColumnType())`,
    ],
  },
  {
    name: 'PgListColumnType',
    needs: [],
    // The JDBC driver builds the elements of an array it reads as java.sql values, through the JVM's
    // time zone; each element is read on its own, as the class its element type is read as.
    lines: [
      `internal class PgListColumnType<T : ${t(KT.Any)}>(`,
      `    val element: ${t(KT.ColumnType)}<T>,`,
      `    val elementClass: ${t(KT.Class)}<*>,`,
      `) : ${t(KT.ColumnType)}<${t(KT.List)}<T>>() {`,
      `    private val array = ${x(KT.ArrayColumnType)}<T, ${t(KT.List)}<T>>(element)`,
      '',
      `    override fun sqlType(): ${t(KT.String)} = array.sqlType()`,
      '',
      `    override fun valueFromDB(value: ${t(KT.Any)}): ${t(KT.List)}<T> =`,
      '        when (value) {',
      `            is ${x(KT.SqlArray)} -> {`,
      `                value.resultSet.${funRef(KT.use)} { rows ->`,
      `                    ${funRef(KT.buildList)} {`,
      '                        while (rows.next()) add(elementFromDB(read(rows)))',
      '                    }',
      '                }',
      '            }',
      '',
      `            is ${x(KT.List)}<*> -> {`,
      '                value.map(::elementFromDB)',
      '            }',
      '',
      `            is ${x(KT.Array)}<*> -> {`,
      '                value.map(::elementFromDB)',
      '            }',
      '',
      '            else -> {',
      `                ${unexpected('')}`,
      '            }',
      '        }',
      '',
      `    private fun elementFromDB(value: ${t(KT.Any)}?): T = value?.let(element::valueFromDB) ?: ${funRef(KT.error)}("NULL in a list of \${element.sqlType()}")`,
      '',
      `    private fun read(rows: ${t(KT.ResultSet)}): ${t(KT.Any)}? = if (elementClass == ${x(KT.String)}::class.java) rows.getString(2) else rows.getObject(2, elementClass)`,
      '',
      `    override fun notNullValueToDB(value: ${t(KT.List)}<T>): ${t(KT.Any)} = array.notNullValueToDB(value)`,
      '',
      `    override fun nonNullValueToString(value: ${t(KT.List)}<T>): ${t(KT.String)} = array.nonNullValueToString(value)`,
      '',
      `    override fun nonNullValueAsDefaultString(value: ${t(KT.List)}<T>): ${t(KT.String)} = array.nonNullValueAsDefaultString(value)`,
      '',
      '    override fun setParameter(',
      `        stmt: ${t(KT.PreparedStatementApi)},`,
      `        index: ${t(KT.Int)},`,
      `        value: ${t(KT.Any)}?,`,
      '    ) {',
      '        array.setParameter(stmt, index, value)',
      '    }',
      '}',
    ],
  },
  {
    name: 'pgList',
    needs: ['PgListColumnType'],
    lines: [
      `internal fun <T : ${t(KT.Any)}> ${t(KT.Table)}.pgList(`,
      `    name: ${t(KT.String)},`,
      `    element: ${t(KT.ColumnType)}<T>,`,
      `    elementClass: ${t(KT.Class)}<*>,`,
      `): ${t(KT.Column)}<${t(KT.List)}<T>> = registerColumn(name, PgListColumnType(element, elementClass))`,
    ],
  },
  {
    name: 'random',
    needs: [],
    lines: [`private val random = ${x(KT.SecureRandom)}()`],
  },
  {
    name: 'uuidV7',
    needs: ['random'],
    lines: [
      `internal fun uuidV7(): ${t(KT.UUID)} {`,
      `    val bytes = ${x(KT.ByteArray)}(10).also(random::nextBytes)`,
      '    val randomA = ((bytes[0].toLong() and 0x0f) shl 8) or (bytes[1].toLong() and 0xff)',
      '    val randomB = bytes.drop(2).fold(0L) { acc, byte -> (acc shl 8) or (byte.toLong() and 0xff) }',
      `    return ${x(KT.UUID)}((${x(KT.System)}.currentTimeMillis() shl 16) or 0x7000L or randomA, (randomB and 0x3fffffffffffffffL) or ${x(KT.Long)}.MIN_VALUE)`,
      '}',
    ],
  },
  {
    name: 'nanoid',
    needs: ['random'],
    lines: [
      `internal fun nanoid(size: ${t(KT.Int)}): ${t(KT.String)} {`,
      '    val alphabet = "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"',
      `    return ${x(KT.CharArray)}(size) { alphabet[random.nextInt(alphabet.length)] }.concatToString()`,
      '}',
    ],
  },
  {
    name: 'isWritten',
    needs: [],
    lines: [
      `internal fun ${t(KT.Entity)}<*>.isWritten(column: ${t(KT.Column)}<*>): ${t(KT.Boolean)} = writeValues.keys.any { it == column }`,
    ],
  },
]

function joinDeclarations(declarations: readonly Declaration[]) {
  return declarations.flatMap((declaration, index) =>
    index === 0 ? declaration.lines : ['', ...declaration.lines],
  )
}

function closure(names: ReadonlySet<string>): ReadonlySet<string> {
  const next = new Set([
    ...names,
    ...SUPPORT.filter((declaration) => names.has(declaration.name)).flatMap((d) => d.needs),
  ])
  return next.size === names.size ? names : closure(next)
}

/**
 * The declarations the tables and entities use of the ones Hekireki writes beside them: column types
 * for the PostgreSQL types Exposed has no column for, or none that keeps what Prisma stores, the
 * database defaults, and the id generators of `uuid(7)` and `nanoid()`.
 *
 * @param plan - The plan.
 * @returns The file, as `{ fileName, code }`, or null when nothing uses one.
 */
export function supportFile(plan: ExposedPlan) {
  const blocks = [
    ...plan.models.flatMap((model) => tableBlocks(plan, model)),
    ...plan.models
      .filter((model) => plan.names.entities.has(model.name))
      .flatMap((model) => entityBlocks(plan, model)),
    ...plan.manyToMany.flatMap((m2m) => joinTableBlocks(plan, m2m)),
  ]
  const used = new Set(
    blocks.flatMap((block) =>
      block
        .lines((text) => text)
        .flatMap((line) =>
          [...line.matchAll(PLACEHOLDER)]
            .map((match) => match[2])
            .flatMap((fullName) => (fullName.startsWith('.') ? [fullName.slice(1)] : [])),
        ),
    ),
  )
  const needed = closure(used)
  const declarations = SUPPORT.filter((declaration) => needed.has(declaration.name))
  if (declarations.length === 0) return null
  return {
    fileName: `${SUPPORT_FILE}.kt`,
    code: renderFile(plan.names.package, generatedTypes(plan), [
      fileBlock(textLines(joinDeclarations(declarations))),
    ]),
  }
}
