import type { Dialect } from '../../database/url.js'
import { quoteIdentifier } from '../../sql/index.js'
import { databaseFamily, prismaFamily } from './types.js'

/** The integer ranges of the database types a Prisma `Int`, `BigInt` or MySQL `Boolean` lands in. */
const RANGES = {
  tinyint: [-128n, 127n],
  smallint: [-32_768n, 32_767n],
  mediumint: [-8_388_608n, 8_388_607n],
  int: [-2_147_483_648n, 2_147_483_647n],
  bigint: [-9_223_372_036_854_775_808n, 9_223_372_036_854_775_807n],
} as const

const UNSIGNED_RANGES = {
  tinyint: [0n, 255n],
  smallint: [0n, 65_535n],
  mediumint: [0n, 16_777_215n],
  int: [0n, 4_294_967_295n],
  bigint: [0n, 18_446_744_073_709_551_615n],
} as const

function integerRange(name: keyof typeof RANGES, unsigned: boolean) {
  const [min, max] = unsigned ? UNSIGNED_RANGES[name] : RANGES[name]
  return { min, max }
}

/** `@db.TinyInt` and the like on MySQL, by the database type each names. */
const MYSQL_INTEGER_NATIVES: Readonly<Record<string, readonly [keyof typeof RANGES, boolean]>> = {
  TinyInt: ['tinyint', false],
  UnsignedTinyInt: ['tinyint', true],
  SmallInt: ['smallint', false],
  UnsignedSmallInt: ['smallint', true],
  MediumInt: ['mediumint', false],
  UnsignedMediumInt: ['mediumint', true],
  Int: ['int', false],
  UnsignedInt: ['int', true],
  BigInt: ['bigint', false],
  UnsignedBigInt: ['bigint', true],
}

/** The range of the column a Prisma integer field is migrated to; null when it holds more than integers. */
function targetRange(
  dialect: Dialect,
  column: {
    readonly type: string
    readonly nativeType: readonly [string, readonly string[]] | null
  },
) {
  const native = column.nativeType?.[0] ?? null
  if (dialect === 'mysql') {
    const named = native === null ? undefined : MYSQL_INTEGER_NATIVES[native]
    if (named !== undefined) return integerRange(named[0], named[1])
    if (column.type === 'Boolean') return integerRange('tinyint', false)
  }
  if (column.type === 'BigInt') return integerRange('bigint', false)
  if (column.type !== 'Int') return null
  // PostgreSQL's `@db.SmallInt`, CockroachDB's `@db.Int2`, `@db.Int4` and `@db.Int8`.
  if (native === 'SmallInt' || native === 'Int2') return integerRange('smallint', false)
  if (native === 'Int8') return integerRange('bigint', false)
  if (native === 'Oid') return integerRange('int', true)
  return integerRange('int', false)
}

const POSTGRES_INTEGERS: Readonly<Record<string, keyof typeof RANGES>> = {
  smallint: 'smallint',
  integer: 'int',
  bigint: 'bigint',
}

/** The range of an integer column as the database has it; null for any other column. */
function sourceRange(
  dialect: Dialect,
  column: { readonly dataType: string; readonly columnType: string | null },
) {
  if (dialect === 'postgresql') {
    const name = POSTGRES_INTEGERS[column.dataType]
    return name === undefined ? null : integerRange(name, false)
  }
  const match = /^(tinyint|smallint|mediumint|int|bigint)\b(?:\(\d+\))?(\s+unsigned)?/iu.exec(
    column.columnType ?? '',
  )
  const name = match?.[1]?.toLowerCase()
  return name === 'tinyint' ||
    name === 'smallint' ||
    name === 'mediumint' ||
    name === 'int' ||
    name === 'bigint'
    ? integerRange(name, match?.[2] !== undefined)
    : null
}

/** The characters a Prisma `String` column holds after the migration; null when unbounded. */
function targetLength(
  dialect: Dialect,
  column: {
    readonly type: string
    readonly nativeType: readonly [string, readonly string[]] | null
  },
) {
  if (column.type !== 'String') return null
  const native = column.nativeType?.[0] ?? null
  const size = Number(column.nativeType?.[1][0])
  // CockroachDB spells a bounded string `@db.String(n)`.
  if (
    (native === 'VarChar' || native === 'Char' || native === 'String') &&
    Number.isInteger(size)
  ) {
    return size
  }
  if (dialect !== 'mysql') return null
  // Prisma Migrate writes a MySQL `String` without `@db.*` as VARCHAR(191).
  if (native === null) return 191
  return native === 'TinyText' ? 255 : null
}

/** PostgreSQL text types a cast to `varchar(n)` accepts; any other type is dropped and re-added. */
const POSTGRES_TEXT = new Set(['text', 'character varying', 'character'])

/** PostgreSQL types a `String` with this `@db.*` is, other than text; a change to one is not cast. */
const POSTGRES_STRING_NATIVES: Readonly<Record<string, string>> = {
  Uuid: 'uuid',
  Citext: 'citext',
  Inet: 'inet',
  Xml: 'xml',
  Bit: 'bit',
  VarBit: 'bit varying',
}

const NUMERIC = new Set(['int', 'bigint', 'float', 'decimal'])

/** Text MySQL reads as a number: digits with a point and an exponent, blanks around them. */
const MYSQL_NUMBER = '^[[:space:]]*[-+]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][-+]?[0-9]+)?[[:space:]]*$'

/** Text MySQL reads as an integer, rounding what has a point: an exponent may even lack its digits. */
const MYSQL_ROUNDED_INTEGER =
  '^[[:space:]]*[-+]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][-+]?[0-9]*)?[[:space:]]*$'

/** Text MariaDB reads as an integer: digits only. */
const MARIADB_INTEGER = '^[[:space:]]*[-+]?[0-9]+[[:space:]]*$'

/** The bounds of a type as SQL literals: the check's own constants, never input. */
function integerBounds(range: { readonly min: bigint; readonly max: bigint }) {
  return { min: String(range.min), max: String(range.max) }
}

/** `Decimal(5, 2)` holds -999.99 to 999.99. */
function decimalBounds(precision: number, scale: number) {
  const whole = '9'.repeat(Math.max(precision - scale, 0)) || '0'
  const max = scale === 0 ? whole : `${whole}.${'9'.repeat(scale)}`
  return { min: `-${max}`, max }
}

/** `@db.Decimal(p, s)`, or the DECIMAL(65, 30) Prisma Migrate writes for a bare `Decimal`. */
function targetDecimal(column: {
  readonly type: string
  readonly nativeType: readonly [string, readonly string[]] | null
}) {
  if (column.type !== 'Decimal') return null
  const [name, args] = column.nativeType ?? ['Decimal', []]
  if (name !== 'Decimal') return null
  const precision = Number(args[0] ?? 65)
  const scale = Number(args[1] ?? (args[0] === undefined ? 30 : 0))
  return Number.isInteger(precision) && Number.isInteger(scale) ? { precision, scale } : null
}

/** The digits before the point a column of this family can hold; null when unbounded. */
function wholeDigits(
  actual: string,
  existing: { readonly precision: number | null; readonly scale: number | null },
  held: { readonly min: bigint; readonly max: bigint } | null,
) {
  if (held !== null) return String(held.max > -held.min ? held.max : -held.min).length
  if (actual === 'decimal' && existing.precision !== null) {
    return existing.precision - (existing.scale ?? 0)
  }
  return null
}

/** `@db.Timestamp(6)` and the like: the fractional seconds a DateTime keeps; 3 when unsaid. */
function targetSeconds(column: {
  readonly type: string
  readonly nativeType: readonly [string, readonly string[]] | null
}) {
  if (column.type !== 'DateTime') return null
  const [name, args] = column.nativeType ?? ['DateTime', []]
  if (name === 'Date') return null
  if (!['DateTime', 'Timestamp', 'Timestamptz'].includes(name)) return null
  const digits = Number(args[0] ?? 3)
  return Number.isInteger(digits) ? digits : null
}

/** PostgreSQL and MySQL types that hold a time of day as well as a date. */
const WITH_TIME = new Set([
  'timestamp without time zone',
  'timestamp with time zone',
  'datetime',
  'timestamp',
])

function describeRange(
  column: {
    readonly type: string
    readonly nativeType: readonly [string, readonly string[]] | null
  },
  bounds: { readonly min: string; readonly max: string },
) {
  const native = column.nativeType === null ? '' : ` @db.${column.nativeType[0]}`
  const args =
    column.nativeType !== null && column.nativeType[1].length > 0
      ? `(${column.nativeType[1].join(', ')})`
      : ''
  return `values outside ${column.type}${native}${args} (${bounds.min} to ${bounds.max})`
}

/** One consequence of a type change, with no bounds or length unless it says. */
function entry(value: {
  readonly kind:
    | 'column-type'
    | 'column-recreated'
    | 'value-too-long'
    | 'value-out-of-range'
    | 'value-not-convertible'
    | 'value-rounded'
    | 'value-truncated'
  readonly severity: 'blocking' | 'warning'
  readonly what: string
  readonly unit: string
  readonly hint: string
  readonly condition: string | null
  readonly bounds?: { readonly min: string; readonly max: string }
  readonly length?: number
}) {
  return { bounds: null, length: null, ...value }
}

/**
 * What changing a column's type does to the values in it, as Prisma Migrate writes the change
 * and the database carries it out: one entry per consequence, none when every value survives.
 *
 * - `column-recreated`: PostgreSQL has no cast for the change (text to a number, an enum, a
 *   `uuid` or a timestamp; a number to a boolean; an enum to text), so Prisma drops the column
 *   and adds it again: every value is lost, and a NOT NULL column without a database default
 *   cannot be added to rows at all.
 * - `value-too-long`, `value-out-of-range`, `value-not-convertible`: the database converts the
 *   values in place (PostgreSQL `SET DATA TYPE`, MySQL `MODIFY`) and refuses the whole change on
 *   the first value that does not fit.
 * - `value-rounded`, `value-truncated`: the conversion goes through and changes the value without
 *   a word: decimals rounded to fewer places or to a whole number, fractional seconds cut to
 *   fewer digits, the time of day dropped from a date.
 * - `column-type`: a change the check does not model, and SQLite, which copies the values into
 *   the new table as they are, whatever they are.
 *
 * `condition` selects the rows each entry is about (null: every row); `bounds` and `length` are
 * what a fix clamps or cuts to.
 *
 * @example
 * ```sql
 * -- the `condition` of each entry: the rows the change refuses or changes. A String column turned Int:
 * -- PostgreSQL has no cast for it and re-creates the column (`column-recreated`): every value goes
 * "views" IS NOT NULL
 * -- MySQL converts in place and fails on what is not a number or out of range (`value-not-convertible`)
 * `views` IS NOT NULL AND (`views` NOT REGEXP '^[[:space:]]*[-+]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][-+]?[0-9]*)?[[:space:]]*$'
 *   OR ROUND(CAST(`views` AS DECIMAL(65, 30))) < -2147483648
 *   OR ROUND(CAST(`views` AS DECIMAL(65, 30))) > 2147483647)
 * -- and rounds what has a fraction (`value-rounded`)
 * `views` REGEXP '...' AND CAST(`views` AS DECIMAL(65, 30)) <> ROUND(CAST(`views` AS DECIMAL(65, 30)))
 * ```
 */
export function makeConversions(input: {
  readonly dialect: Dialect
  /** The MySQL server is MariaDB, which takes only digits as an integer; MySQL takes any number and rounds it. */
  readonly mariadb: boolean
  /**
   * The schema's provider is CockroachDB, which speaks PostgreSQL's protocol but has Prisma drop
   * and add a column again for nearly every type change: only a BIGINT narrowed to INT4 and an
   * INT4 turned into an unbounded STRING are converted in place.
   */
  readonly cockroach?: boolean
  readonly column: {
    readonly column: string
    readonly type: string
    readonly kind: string
    readonly nativeType: readonly [string, readonly string[]] | null
    readonly isList: boolean
    readonly required: boolean
    readonly databaseDefault: boolean
  }
  readonly existing: {
    readonly dataType: string
    readonly columnType: string | null
    readonly maxLength: number | null
    readonly precision: number | null
    readonly scale: number | null
    readonly datetimePrecision: number | null
    readonly enumValues: readonly string[] | null
  }
}) {
  const { dialect, column, existing } = input
  if (column.isList) return []
  const expected = prismaFamily(column)
  const actual = databaseFamily({
    dialect,
    dataType: existing.dataType,
    columnType: existing.columnType,
  })
  if (expected === null || actual === null) return []
  const name = quoteIdentifier(dialect, column.column)
  const from = existing.columnType ?? existing.dataType
  const changed = entry({
    kind: 'column-type',
    severity: 'warning',
    what: `type changes from ${from} to ${column.type}`,
    unit: 'value',
    hint:
      dialect === 'sqlite'
        ? `SQLite copies the values as they are: make sure each one reads back as ${column.type}, or say how each converts on the Migrate page of hekireki studio.`
        : 'The check does not model this change: make sure every value converts.',
    condition: `${name} IS NOT NULL`,
  })
  const recreated =
    column.required && !column.databaseDefault
      ? entry({
          kind: 'column-recreated',
          severity: 'blocking',
          what: `column is dropped and re-added NOT NULL without a default (${from} to ${column.type})`,
          unit: 'row',
          hint: 'Its values are lost and the new column cannot be filled: give the field a @default, or add a new column, fill it, then drop the old one.',
          condition: null,
        })
      : entry({
          kind: 'column-recreated',
          severity: 'warning',
          what: `column is dropped and re-added (${from} to ${column.type})`,
          unit: 'value',
          hint: 'PostgreSQL has no cast for this change: copy the values to a new column first if they matter.',
          condition: `${name} IS NOT NULL`,
        })
  const tooLong = (length: number) =>
    entry({
      kind: 'value-too-long',
      severity: 'blocking',
      what: `values longer than ${length} characters`,
      unit: 'value',
      hint: 'Shorten them, or keep the column wider, before the type changes.',
      condition: `CHAR_LENGTH(${name}) > ${length}`,
      length,
    })
  const outOfRange = (value: string, bounds: { readonly min: string; readonly max: string }) =>
    entry({
      kind: 'value-out-of-range',
      severity: 'blocking',
      what: describeRange(column, bounds),
      unit: 'value',
      hint: 'Move or clamp them, or keep the wider type, before the type changes.',
      condition: `(${value} < ${bounds.min} OR ${value} > ${bounds.max})`,
      bounds,
    })
  const notConvertible = (condition: string) =>
    entry({
      kind: 'value-not-convertible',
      severity: 'blocking',
      what: `values that do not convert to ${column.type}`,
      unit: 'value',
      hint: 'Fix or clear them before the type changes: MySQL refuses the whole ALTER on the first one.',
      condition: `${name} IS NOT NULL AND (${condition})`,
    })
  const rounded = (what: string, condition: string) =>
    entry({
      kind: 'value-rounded',
      severity: 'warning',
      what,
      unit: 'value',
      hint: 'The conversion goes through and the value changes: round them yourself first if the rule matters.',
      condition,
    })
  // The value as the database rounds it: a float by its shortest decimal form, as both
  // PostgreSQL's numeric cast and MySQL's DECIMAL conversion read it.
  const exact =
    dialect === 'postgresql'
      ? `CAST(${name} AS NUMERIC)`
      : actual === 'float'
        ? `CAST(CAST(${name} AS CHAR) AS DECIMAL(65, 30))`
        : name
  const fractional = actual === 'float' || actual === 'decimal'
  const range = targetRange(dialect, column)
  const length = targetLength(dialect, column)
  const decimal = targetDecimal(column)
  const held = sourceRange(dialect, existing)

  /** Integer targets: the rounded value out of range blocks, a fraction rounded away warns. */
  const toInteger = () => {
    if (range === null) return []
    const fits = held !== null && held.min >= range.min && held.max <= range.max
    const bounds = integerBounds(range)
    // A float goes to an integer by rounding half to even, as ROUND does on a float; a decimal
    // rounds half away from zero, as ROUND does on a decimal.
    return [
      ...(fits ? [] : [outOfRange(fractional ? `ROUND(${name})` : name, bounds)]),
      ...(fractional
        ? [rounded('values with a fraction, rounded to whole numbers', `${name} <> ROUND(${name})`)]
        : []),
    ]
  }

  /** Decimal targets: whole digits beyond precision minus scale block once rounded, extra decimals warn. */
  const toDecimal = () => {
    if (decimal === null) return []
    const room = decimal.precision - decimal.scale
    const digits = wholeDigits(actual, existing, held)
    const extraScale =
      actual === 'float' || (actual === 'decimal' && (existing.scale ?? Infinity) > decimal.scale)
    const carries = extraScale && digits !== null && digits >= room
    const fits = digits !== null && digits <= room && !carries
    const bounds = decimalBounds(decimal.precision, decimal.scale)
    return [
      ...(fits ? [] : [outOfRange(`ROUND(${exact}, ${decimal.scale})`, bounds)]),
      ...(extraScale
        ? [
            rounded(
              `values rounded to ${decimal.scale} decimal places`,
              `${exact} <> ROUND(${exact}, ${decimal.scale})`,
            ),
          ]
        : []),
    ]
  }

  /** DateTime targets: a date drops the time of day, fewer fractional digits round or cut them. */
  const toDateTime = () => {
    if (actual !== 'datetime' || !WITH_TIME.has(existing.dataType.toLowerCase())) return []
    if (column.nativeType?.[0] === 'Date') {
      return [
        entry({
          kind: 'value-truncated',
          severity: 'warning',
          what: 'values whose time of day is dropped',
          unit: 'value',
          hint: 'The column keeps the date only: move the time elsewhere first if it matters.',
          // The date compares as its midnight: equal exactly when there is no time of day to drop.
          condition: `${name} <> CAST(${name} AS DATE)`,
        }),
      ]
    }
    const digits = targetSeconds(column)
    const current = existing.datetimePrecision ?? (dialect === 'postgresql' ? 6 : 0)
    if (digits === null || current <= digits) return []
    const cast =
      dialect === 'postgresql'
        ? `CAST(${name} AS ${existing.dataType === 'timestamp with time zone' ? 'TIMESTAMPTZ' : 'TIMESTAMP'}(${digits}))`
        : `CAST(${name} AS DATETIME(${digits}))`
    return [
      rounded(`values with more than ${digits} digits of fractional seconds`, `${name} <> ${cast}`),
    ]
  }

  if (dialect === 'sqlite') {
    const same =
      expected === actual ||
      (expected === 'enum' && actual === 'string') ||
      (expected === 'bigint' && actual === 'int')
    return same ? [] : [changed]
  }

  if (dialect === 'postgresql' && input.cockroach === true) {
    // An enum keeps its values: CockroachDB drops a member with DROP VALUE, which refuses a
    // member in use, as the enum check counts. Anything else becomes an enum by being re-added.
    if (column.kind === 'enum') return existing.enumValues === null ? [recreated] : []
    const sameLength = (length ?? null) === (existing.maxLength ?? null)
    if (expected === 'string') {
      const special =
        column.nativeType === null ? undefined : POSTGRES_STRING_NATIVES[column.nativeType[0]]
      if (special !== undefined) return existing.dataType === special ? [] : [recreated]
      if (actual === 'string' && POSTGRES_TEXT.has(existing.dataType)) {
        return sameLength ? [] : [recreated]
      }
      return existing.dataType === 'integer' && length === null ? [] : [recreated]
    }
    if (range !== null && NUMERIC.has(actual)) {
      if (held !== null && held.min === range.min && held.max === range.max) return []
      // BIGINT to INT4 is the one narrowing CockroachDB does in place, refusing what does not fit.
      return existing.dataType === 'bigint' && range.max === 2_147_483_647n
        ? [outOfRange(name, integerBounds(range))]
        : [recreated]
    }
    if (expected === 'decimal' && actual === 'decimal') {
      return decimal !== null &&
        existing.precision === decimal.precision &&
        existing.scale === decimal.scale
        ? []
        : [recreated]
    }
    if (expected === 'datetime' && actual === 'datetime') {
      const date = column.nativeType?.[0] === 'Date'
      const digits = targetSeconds(column)
      return date === (existing.dataType === 'date') &&
        (date || digits === (existing.datetimePrecision ?? 6))
        ? []
        : [recreated]
    }
    return expected === actual ? [] : [recreated]
  }

  if (dialect === 'postgresql') {
    // An enum column keeps its values through Prisma's rename-and-cast; the enum check counts
    // the ones the new type does not have. Anything else becomes an enum by being re-added.
    if (column.kind === 'enum') return existing.enumValues === null ? [recreated] : []
    if (expected === 'string') {
      const special =
        column.nativeType === null ? undefined : POSTGRES_STRING_NATIVES[column.nativeType[0]]
      if (special !== undefined) return existing.dataType === special ? [] : [recreated]
      if (actual === 'enum') return [recreated]
      if (length === null) return []
      if (!POSTGRES_TEXT.has(existing.dataType)) return [recreated]
      return existing.maxLength !== null && existing.maxLength <= length ? [] : [tooLong(length)]
    }
    if (NUMERIC.has(expected) && NUMERIC.has(actual)) {
      return expected === 'decimal' ? toDecimal() : toInteger()
    }
    if (expected === 'datetime' && actual === 'datetime') return toDateTime()
    return expected === actual ? [] : [recreated]
  }

  // MySQL converts the column in place with MODIFY, and strict mode refuses the value that does not fit.
  if (column.kind === 'enum') return []
  if (expected === 'string') {
    if (length === null || !['string', 'json', 'bytes'].includes(actual)) return []
    return existing.maxLength !== null && existing.maxLength <= length ? [] : [tooLong(length)]
  }
  const text = `CAST(${name} AS DECIMAL(65, 30))`
  if (range !== null) {
    if (actual === 'string') {
      // MariaDB refuses `10.5` as an integer; MySQL rounds it to 11 (and reads `1e` as 1), then checks the range.
      const pattern = input.mariadb ? MARIADB_INTEGER : MYSQL_ROUNDED_INTEGER
      const value = input.mariadb ? `CAST(${name} AS DECIMAL(65, 0))` : `ROUND(${text})`
      return [
        notConvertible(
          `${name} NOT REGEXP '${pattern}' OR ${value} < ${String(range.min)} OR ${value} > ${String(range.max)}`,
        ),
        ...(input.mariadb
          ? []
          : [
              rounded(
                'values with a fraction, rounded to whole numbers',
                `${name} REGEXP '${pattern}' AND ${text} <> ROUND(${text})`,
              ),
            ]),
      ]
    }
    if (NUMERIC.has(actual) || actual === 'boolean') return toInteger()
    return [changed]
  }
  if (expected === 'decimal' || expected === 'float') {
    if (actual === 'string' && expected === 'decimal' && decimal !== null) {
      const bounds = decimalBounds(decimal.precision, decimal.scale)
      const value = `ROUND(${text}, ${decimal.scale})`
      return [
        notConvertible(
          `${name} NOT REGEXP '${MYSQL_NUMBER}' OR ${value} < ${bounds.min} OR ${value} > ${bounds.max}`,
        ),
        rounded(
          `values rounded to ${decimal.scale} decimal places`,
          `${name} REGEXP '${MYSQL_NUMBER}' AND ${text} <> ${value}`,
        ),
      ]
    }
    if (actual === 'string') return [notConvertible(`${name} NOT REGEXP '${MYSQL_NUMBER}'`)]
    if (expected === 'decimal' && (NUMERIC.has(actual) || actual === 'boolean')) return toDecimal()
    return NUMERIC.has(actual) || actual === 'boolean' ? [] : [changed]
  }
  if (expected === 'datetime') {
    if (actual === 'string') return [notConvertible(`CAST(${name} AS DATETIME(3)) IS NULL`)]
    return actual === 'datetime' ? toDateTime() : [changed]
  }
  if (expected === 'json') {
    if (actual === 'string') return [notConvertible(`JSON_VALID(${name}) = 0`)]
    return actual === 'json' ? [] : [changed]
  }
  if (expected === 'bytes') return actual === 'string' || actual === 'bytes' ? [] : [changed]
  return expected === actual ? [] : [changed]
}
