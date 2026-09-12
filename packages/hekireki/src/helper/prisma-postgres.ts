import type { DMMF } from '@prisma/generator-helper'

// What a Prisma schema means on PostgreSQL, whichever language the model is written in: the names
// Prisma Migrate gives tables, constraints and indexes, the keys and join tables it creates, and
// how it writes a default into the DEFAULT clause.

/** PostgreSQL's NAMEDATALEN - 1: the longest name, in bytes, that Prisma Migrate derives. */
const IDENTIFIER_LIMIT = 63

function utf8Length(value: string) {
  return new TextEncoder().encode(value).length
}

/**
 * A constraint or index name as Prisma Migrate derives it: when base and suffix together exceed
 * PostgreSQL's identifier limit, the base is cut — at a character boundary, counting UTF-8 bytes
 * as PostgreSQL does — to leave room for the suffix.
 *
 * @param base - The table name, joined with the column names where Prisma includes them.
 * @param suffix - `_pkey`, `_key`, `_idx`, `_fkey` and so on.
 * @returns The name Prisma gives the constraint or index.
 */
export function prismaConstraintName(base: string, suffix: string) {
  const room = IDENTIFIER_LIMIT - utf8Length(suffix)
  if (utf8Length(base) <= room) return `${base}${suffix}`
  const chars = [...base.matchAll(/./gsu)].map(([char]) => char)
  // Prefix lengths only grow, so the characters that fit are a prefix of the name.
  const kept = chars.filter((_, index) => utf8Length(chars.slice(0, index + 1).join('')) <= room)
  return `${kept.join('')}${suffix}`
}

export function tableName(model: DMMF.Model) {
  return model.dbName ?? model.name
}

export function columnName(field: DMMF.Field) {
  return field.dbName ?? field.name
}

export type IndexInfo = {
  readonly type: DMMF.IndexType
  readonly fields: readonly DMMF.IndexField[]
  readonly dbName?: string
  readonly algorithm?: string
}

export function isListDefault(
  def: DMMF.Field['default'],
): def is readonly (string | number | boolean)[] {
  return Array.isArray(def)
}

export function isFunctionDefault(
  def: DMMF.Field['default'],
): def is { readonly name: string; readonly args: readonly (string | number)[] } {
  return def !== null && typeof def === 'object' && !Array.isArray(def) && 'name' in def
}

export function modelIndexes(
  model: DMMF.Model,
  indexes: readonly DMMF.Index[],
): readonly IndexInfo[] {
  const own = indexes.filter((index) => index.model === model.name)
  if (own.length > 0) return own
  // A DMMF without `indexes` still carries the keys and the unique criteria on the model itself.
  const primaryKey =
    model.primaryKey?.fields ?? model.fields.filter((f) => f.isId).map((f) => f.name)
  return [
    ...(primaryKey.length > 0
      ? [{ type: 'id' as const, fields: primaryKey.map((name) => ({ name })) }]
      : []),
    ...model.fields
      .filter((f) => f.isUnique)
      .map((f) => ({ type: 'unique' as const, fields: [{ name: f.name }] })),
    ...model.uniqueFields.map((fields) => ({
      type: 'unique' as const,
      fields: fields.map((name) => ({ name })),
    })),
  ]
}

export function isSameFieldSet(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((name) => right.includes(name))
}

export function fieldNames(index: IndexInfo) {
  return index.fields.map((f) => f.name)
}

// The key an entity is tracked by: the primary key or, for a model Prisma identifies by a unique
// criterion alone, the first unique criterion whose fields are all required.
export function entityKey(model: DMMF.Model, indexes: readonly IndexInfo[]) {
  return (
    indexes.find((index) => index.type === 'id') ??
    indexes.find(
      (index) =>
        index.type === 'unique' &&
        index.fields.every(
          (f) => model.fields.find((mf) => mf.name === f.name)?.isRequired === true,
        ),
    ) ??
    null
  )
}

export function indexName(model: DMMF.Model, index: IndexInfo) {
  if (index.dbName) return index.dbName
  const table = tableName(model)
  if (index.type === 'id') return prismaConstraintName(table, '_pkey')
  const columns = index.fields.map((f) => {
    const field = model.fields.find((mf) => mf.name === f.name)
    return field ? columnName(field) : f.name
  })
  return prismaConstraintName(
    [table, ...columns].join('_'),
    index.type === 'unique' ? '_key' : '_idx',
  )
}

// The other end of a relation field: the same relation, on the related model, and — which is what
// tells the two ends of a self-relation apart — not the field itself.
export function backRelation(field: DMMF.Field, owner: DMMF.Model, models: readonly DMMF.Model[]) {
  const related = models.find((m) => m.name === field.type)
  return related?.fields.find(
    (f) =>
      f.kind === 'object' &&
      f.relationName === field.relationName &&
      f.type === owner.name &&
      !(related.name === owner.name && f.name === field.name),
  )
}

export type ManyToMany = {
  readonly relationName: string
  /** The side join column `A` belongs to. */
  readonly a: { readonly model: DMMF.Model; readonly field: DMMF.Field }
  /** The side join column `B` belongs to. */
  readonly b: { readonly model: DMMF.Model; readonly field: DMMF.Field }
}

// Prisma keeps an implicit many-to-many relation in `_<relation>`, a row per pair in columns `A`
// and `B`. `A` holds the id of the model whose name sorts first, and that model's relation field
// lists the `B` of its rows; in a self-relation both columns hold the same model's ids, and the
// field whose name sorts first is the one that lists `B`.
export function manyToManyRelations(models: readonly DMMF.Model[]) {
  return models.flatMap((model) =>
    model.fields
      .filter((f) => f.kind === 'object' && f.isList && (f.relationFromFields ?? []).length === 0)
      .flatMap((field): ManyToMany[] => {
        const inverse = backRelation(field, model, models)
        const other = models.find((m) => m.name === field.type)
        if (!(other && inverse?.isList)) return []
        const isSideA =
          model.name === other.name ? field.name < inverse.name : model.name < other.name
        if (!isSideA) return []
        return [
          {
            relationName: field.relationName ?? `${model.name}To${other.name}`,
            a: { model, field },
            b: { model: other, field: inverse },
          },
        ]
      }),
  )
}

/**
 * Reads an RFC 3339 timestamp as it may stand in `@default("...")`.
 *
 * @param value - The default as DMMF carries it.
 * @returns Its fields, the fraction as microseconds, or null when it is not a calendar timestamp.
 */
export function parseDateTimeDefault(value: string) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:(Z)|([+-])(\d{2}):?(\d{2}))$/iu.exec(
      value,
    )
  if (!match) return null
  const [, year, month, day, hour, minute, second, fraction, zulu, sign, offsetHour, offsetMinute] =
    match
  const parsed = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    microsecond: roundToMicroseconds(fraction ?? ''),
    offsetMinutes:
      zulu === undefined
        ? (sign === '-' ? -1 : 1) * (Number(offsetHour) * 60 + Number(offsetMinute))
        : 0,
  }
  // Date.UTC rolls an out-of-range field over into the next; a timestamp that does not come back
  // unchanged — a 30th of February, a 25th hour — is not a calendar timestamp.
  const date = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second),
  )
  const isCalendar =
    parsed.year >= 1 &&
    date.getUTCFullYear() === parsed.year &&
    date.getUTCMonth() === parsed.month - 1 &&
    date.getUTCDate() === parsed.day &&
    date.getUTCHours() === parsed.hour &&
    date.getUTCMinutes() === parsed.minute &&
    date.getUTCSeconds() === parsed.second
  return isCalendar ? parsed : null
}

// PostgreSQL reads a fractional second to the microsecond, rounding half to even. Rounding that to
// the column's precision happens in the database, for the literal and for what a client sends alike,
// so this is the one step to reproduce.
function roundToMicroseconds(digits: string) {
  const padded = digits.padEnd(7, '0')
  const whole = Number(padded.slice(0, 6))
  const rest = padded.slice(6)
  const isHalf = /^50*$/u.test(rest)
  const isAboveHalf = !isHalf && rest.charAt(0) >= '5'
  return isAboveHalf || (isHalf && whole % 2 === 1) ? whole + 1 : whole
}

export type Moment = Exclude<ReturnType<typeof parseDateTimeDefault>, null>

// The moment `offsetMinutes` away from the timestamp's own clock, carrying a fraction rounded up
// to a whole second into the seconds.
export function shift(moment: Moment, offsetMinutes: number) {
  const carry = moment.microsecond === 1_000_000 ? 1 : 0
  const date = new Date(
    Date.UTC(
      moment.year,
      moment.month - 1,
      moment.day,
      moment.hour,
      moment.minute,
      moment.second + carry,
    ) -
      offsetMinutes * 60_000,
  )
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    microsecond: moment.microsecond % 1_000_000,
  }
}

export function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function pad(value: number, width = 2) {
  return String(value).padStart(width, '0')
}

// A timestamp default as Prisma Migrate writes it into the DEFAULT clause (chrono's
// `%Y-%m-%d %H:%M:%S%.f %:z`), which every PostgreSQL date and time type accepts — the ISO form
// with a `T` is not a valid `time`.
export function sqlTimestamp(value: string | number | boolean) {
  const parsed = typeof value === 'string' ? parseDateTimeDefault(value) : null
  if (!parsed) return String(value)
  const clock = shift(parsed, 0)
  const fraction =
    clock.microsecond === 0
      ? ''
      : clock.microsecond % 1000 === 0
        ? `.${pad(clock.microsecond / 1000, 3)}`
        : `.${pad(clock.microsecond, 6)}`
  const offset = Math.abs(parsed.offsetMinutes)
  const sign = parsed.offsetMinutes < 0 ? '-' : '+'
  return `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)} ${pad(clock.hour)}:${pad(clock.minute)}:${pad(clock.second)}${fraction} ${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
}

// A PostgreSQL array literal of the values; the column's type reads each element.
export function sqlArray(values: readonly string[]) {
  const elements = values.map(
    (value) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
  )
  return sqlString(`{${elements.join(',')}}`)
}

export const INDEX_METHODS: { readonly [algorithm: string]: string } = {
  Hash: 'hash',
  Gist: 'gist',
  Gin: 'gin',
  SpGist: 'spgist',
  Brin: 'brin',
}

/**
 * A PostgreSQL operator class as Prisma Migrate writes it: `JsonbPathOps` is `jsonb_path_ops`,
 * `Int4MinMaxMultiOps` is `int4_minmax_multi_ops`, and one given with `raw("...")` is used as it is.
 *
 * @param operatorClass - The operator class as DMMF carries it.
 * @param nativeType - The native type of the indexed field.
 * @returns The operator class's name in PostgreSQL.
 */
export function operatorClassName(operatorClass: string, nativeType: string | undefined) {
  if (!/^[A-Z][\dA-Za-z]*Ops$/u.test(operatorClass)) return operatorClass
  // DMMF names UuidMinMaxMultiOps "BitMinMaxOps" (Prisma's Display impl has the two swapped); Prisma
  // allows BitMinMaxOps on bit columns only, so on a uuid column it can only be the former.
  if (operatorClass === 'BitMinMaxOps' && nativeType === 'Uuid') return 'uuid_minmax_multi_ops'
  return operatorClass
    .replace('MinMax', 'Minmax')
    .replace('VarBit', 'Varbit')
    .replace('TimestampTz', 'Timestamptz')
    .replace('TimeTz', 'Timetz')
    .replaceAll(/([\da-z])([A-Z])/gu, '$1_$2')
    .toLowerCase()
}
