import type { Dialect } from '../../database/url.js'
import { qualifiedName, quoteIdentifier } from '../../sql/index.js'
import { fieldOf } from './checks.js'
import { formatMapping } from './decisions.js'
import { sqlOf } from './dialect.js'
import type { makeExpectedTables } from './tables.js'
import { databaseFamily, prismaFamily } from './types.js'

// What the page can say about a check without being told: the facts a person needs to read it
// (the enum and the values it loses, the types a column goes between, the relation and whether
// it is optional), and the decision that most likely fits, read from the schema and the database.
// A suggestion is only ever offered: nothing is decided until a person takes it.

type Expected = ReturnType<typeof makeExpectedTables>[number]
type ExpectedColumn = Expected['columns'][number]

type Actual = {
  readonly schema: string | null
  readonly table: string
  readonly columns: readonly {
    readonly name: string
    readonly nullable: boolean
    readonly dataType: string
    readonly columnType: string | null
    readonly enumValues: readonly string[] | null
  }[]
}

/** A decision the page offers ready-made, and why it is the one offered. */
type Suggestion = {
  readonly choice: string
  readonly value: string | null
  /** What it rests on, for the page to say in its own language; its details are in the facts. */
  readonly reason: string
}

/** The length of the longest run of letters two names share, case aside: `nickname` and `displayName` share `name`. */
function sharedRun(a: string, b: string) {
  const left = a.toLowerCase()
  const right = b.toLowerCase()
  // Row by row down `left`: how long the run ending at each pair of positions is, one more than
  // the run ending at the pair before it when the letters match, else nothing.
  return left.split('').reduce<{ readonly row: readonly number[]; readonly longest: number }>(
    (state, char) => {
      const row = right
        .split('')
        .map((other, at) => (other === char ? (state.row[at - 1] ?? 0) + 1 : 0))
      return { row, longest: Math.max(state.longest, ...row) }
    },
    { row: [], longest: 0 },
  ).longest
}

/** A name with case and separators set aside: `in-review`, `In Review` and `IN_REVIEW` alike. */
function spelling(text: string) {
  return text.toLowerCase().replaceAll(/[\s_-]/gu, '')
}

type FillInput = {
  readonly column: ExpectedColumn
  readonly table: Expected
  readonly sql: ReturnType<typeof sqlOf>
  readonly unique: boolean
}

/** What fills the rows already there of a column that becomes, or is added, required. */
function fill(input: FillInput): Suggestion | null {
  return generatedFill(input.column, input.sql) ?? referencedFill(input) ?? valueFill(input)
}

/** The schema's own default, or the value a generated default would have made. */
function generatedFill(column: ExpectedColumn, sql: ReturnType<typeof sqlOf>): Suggestion | null {
  if (column.defaultValue !== null) {
    return { choice: 'value', value: column.defaultValue, reason: 'schema-default' }
  }
  if (column.defaultFunction === 'uuid') return { choice: 'sql', value: sql.uuid, reason: 'uuid' }
  if (['cuid', 'nanoid', 'ulid'].includes(column.defaultFunction ?? '')) {
    return { choice: 'sql', value: sql.randomId, reason: 'random-id' }
  }
  if (column.updatedAt || column.defaultFunction === 'now') {
    return { choice: 'sql', value: sql.now, reason: 'now' }
  }
  return null
}

/**
 * A key that points at another table cannot take a made-up value: the foreign key refuses what
 * is not there. The rows go to a row that is, to be pointed at the right one afterwards.
 */
function referencedFill(input: FillInput): Suggestion | null {
  const { column, sql } = input
  const pointing = input.table.foreignKeys.find(
    (fk) => fk.fromColumns.length === 1 && fk.fromColumns[0] === column.column,
  )
  const [target] = pointing?.toColumns ?? []
  if (pointing !== undefined && target !== undefined && pointing.toColumns.length === 1) {
    return {
      choice: 'sql',
      value: sql.firstKey(pointing.toTable, pointing.toSchema ?? null, target),
      reason: 'first-referenced',
    }
  }
  return null
}

/** A plain value of the column's type: its first enum member, nothing, zero, false, now. */
function valueFill(input: FillInput): Suggestion | null {
  const { column, sql } = input
  if (column.kind === 'enum') return enumFill(column)
  switch (column.type) {
    case 'String':
      return stringFill(input)
    case 'Int':
    case 'BigInt':
    case 'Float':
    case 'Decimal':
      return { choice: 'value', value: '0', reason: 'zero' }
    case 'Boolean':
      return { choice: 'sql', value: sql.falsy, reason: 'false' }
    case 'DateTime':
      return { choice: 'sql', value: sql.now, reason: 'now' }
    case 'Json':
      return { choice: 'value', value: '{}', reason: 'empty-object' }
    default:
      return null
  }
}

function enumFill(column: ExpectedColumn): Suggestion | null {
  const member = column.enumMembers?.[0]?.name
  return member === undefined ? null : { choice: 'value', value: member, reason: 'enum-first' }
}

/** A unique column cannot take one value for every row: each gets its own, from its key. */
function stringFill(input: FillInput): Suggestion {
  const { column, table, sql } = input
  const [key] = table.primaryKey
  return input.unique && key !== undefined && table.primaryKey.length === 1
    ? { choice: 'sql', value: sql.prefixed(`${column.field}-`, key), reason: 'from-key' }
    : { choice: 'value', value: '', reason: 'empty-string' }
}

type AdviceInput = {
  readonly dialect: Dialect
  readonly cockroach: boolean
  readonly expected: readonly Expected[]
  readonly actual: readonly Actual[]
  readonly checks: readonly {
    readonly kind: string
    readonly model: string
    readonly subject: string
    readonly what: string
  }[]
  /** The distinct values stored in a column now, by `Model.field`; missing when not read. */
  readonly stored: ReadonlyMap<string, readonly string[]>
}

/** A column the migration adds that the values of a dropped column could go to. */
type Destination = {
  readonly choice: string
  readonly value: string
  readonly type: string
  readonly fits: boolean
  readonly relation: string
  readonly via: string | null
  readonly created: boolean
}

type Advice = {
  readonly facts: { readonly [key: string]: string }
  readonly suggestion: Suggestion | null
  /** Where the values of a dropped column could go, the likeliest first. */
  readonly candidates: readonly Suggestion[]
  /** Every column the migration adds that the values of a dropped column could go to. */
  readonly destinations: readonly Destination[]
}

/** What every check is read against: the input, and how the database compares names. */
type AdviceEnv = {
  readonly input: AdviceInput
  readonly sql: ReturnType<typeof sqlOf>
  /** A name as the database compares it: MySQL sets case aside. */
  readonly normal: (name: string) => string
  readonly has: (columns: readonly { readonly name: string }[] | undefined, name: string) => boolean
  readonly actualOf: (table: Expected) => Actual | undefined
}

/** One check, with the table, column and database column it is about. */
type CheckSite = AdviceEnv & {
  readonly check: AdviceInput['checks'][number]
  readonly field: string
  readonly table: Expected
  readonly actual: Actual | undefined
  readonly column: ExpectedColumn | undefined
  readonly existing: Actual['columns'][number] | undefined
  readonly advise: (
    suggestion: Suggestion | null,
    facts?: { readonly [key: string]: string },
    candidates?: readonly Suggestion[],
    destinations?: readonly Destination[],
  ) => Advice
}

/** The types a type change goes between, whatever it does to the values. */
function typeChangeFacts(
  kind: string,
  column: ExpectedColumn | undefined,
  existing: Actual['columns'][number] | undefined,
) {
  if (column === undefined || existing === undefined) return {}
  return kind.startsWith('value-') || kind.startsWith('column-')
    ? { from: existing.columnType ?? existing.dataType, to: column.type }
    : {}
}

function adviseFill(site: CheckSite) {
  const { table, column, sql, advise } = site
  if (column === undefined) return advise(null)
  const unique = table.uniques.some(
    (key) => key.columns.length === 1 && key.columns[0] === column.column,
  )
  const suggestion = fill({ column, table, sql, unique })
  return advise(suggestion, {
    type: column.type,
    ...(suggestion?.reason === 'schema-default' ? { default: column.defaultValue ?? '' } : {}),
    ...(suggestion?.reason === 'enum-first' ? { member: suggestion.value ?? '' } : {}),
    ...(suggestion?.reason === 'first-referenced'
      ? {
          target:
            table.foreignKeys.find((fk) => fk.fromColumns[0] === column.column)?.toModel ?? '',
        }
      : {}),
  })
}

function adviseEnum(site: CheckSite) {
  const { input, check, field, column, existing, advise } = site
  if (column === undefined) return advise(null)
  const members = column.enumMembers ?? []
  const allowed = new Set(members.map((m) => m.dbName))
  const stored = input.stored.get(`${check.model}.${field}`) ?? []
  const removed = stored.filter((value) => !allowed.has(value))
  const before = new Set([...(existing?.enumValues ?? []), ...stored])
  const added = members.filter((m) => !before.has(m.dbName))
  const facts = {
    enum: column.type,
    removed: removed.join(', '),
    members: members.map((m) => m.name).join(', '),
  }
  const mapped = enumMapping(members, column.defaultValue, removed, added)
  return mapped === null
    ? advise(null, facts)
    : advise(mapped.suggestion, { ...facts, member: mapped.member })
}

/** Where the values an enum loses go, and the member the page names for it. */
function enumMapping(
  members: NonNullable<ExpectedColumn['enumMembers']>,
  defaultValue: string | null,
  removed: readonly string[],
  added: NonNullable<ExpectedColumn['enumMembers']>,
) {
  const fallback = members.find((m) => m.name === defaultValue) ?? members[0]
  // A value stored under another spelling of a member (`admin` for ADMIN, `in-review` for
  // IN_REVIEW) is that member; what matches none goes where it would otherwise.
  const sameName = (value: string) =>
    members.find((m) => spelling(m.name) === spelling(value)) ??
    members.find((m) => spelling(m.dbName) === spelling(value))
  const unmatched = removed.filter((value) => sameName(value) === undefined)
  if (removed.length > 0 && unmatched.length < removed.length && fallback !== undefined) {
    return {
      suggestion: {
        choice: 'map',
        value: formatMapping(
          removed.map((value) => [value, (sameName(value) ?? fallback).name] as const),
        ),
        reason: 'enum-same-name',
      },
      member: unmatched.length === 0 ? '' : fallback.name,
    }
  }
  const [only] = removed
  const [replacement] = added
  if (
    removed.length === 1 &&
    added.length === 1 &&
    only !== undefined &&
    replacement !== undefined
  ) {
    return {
      suggestion: {
        choice: 'map',
        value: formatMapping([[only, replacement.name]]),
        reason: 'enum-replaced',
      },
      member: replacement.name,
    }
  }
  if (removed.length === 0 || fallback === undefined) return null
  return {
    suggestion: {
      choice: 'map',
      value: formatMapping(removed.map((value) => [value, fallback.name] as const)),
      reason: fallback.name === defaultValue ? 'enum-default' : 'enum-first',
    },
    member: fallback.name,
  }
}

function adviseUnique(site: CheckSite) {
  const { table, field, advise } = site
  const fields = field.split(', ')
  const columnOf = new Map(table.columns.toReversed().map((c) => [c.field, c]))
  const columns = fields.map((one) => columnOf.get(one))
  // Rows can stay when the key may be NULL: only the key of the others is cleared.
  const optional = columns.some((c) => c !== undefined && !c.required)
  const created =
    table.columns.find((c) => c.defaultFunction === 'now' && /created/iu.test(c.field)) ??
    table.columns.find((c) => c.defaultFunction === 'now')
  const choice = `keep-first-${optional ? 'null' : 'delete'}`
  return created === undefined
    ? advise({ choice, value: null, reason: 'first-by-key' }, { fields: fields.join(', ') })
    : advise(
        { choice, value: created.field, reason: 'oldest' },
        { fields: fields.join(', '), orderBy: created.field },
      )
}

function adviseForeignKey(site: CheckSite) {
  const { table, field, advise } = site
  const foreignKey = table.foreignKeys.find((fk) => fk.field === field)
  if (foreignKey === undefined) return advise(null)
  const requiredOf = new Map(table.columns.toReversed().map((c) => [c.column, c.required]))
  const optional = foreignKey.fromColumns.every((name) => requiredOf.get(name) === false)
  return advise(
    optional
      ? { choice: 'null', value: null, reason: 'optional-relation' }
      : { choice: 'delete', value: null, reason: 'required-relation' },
    { target: foreignKey.toModel },
  )
}

/**
 * How much a column the migration adds reads as a dropped one: its name (the same but for case
 * and separators, else the longest run of letters they share, three at least), then its kind
 * (text takes any value), then whether it may be empty as the dropped one may.
 */
function likeness(
  one: Actual['columns'][number],
  family: ReturnType<typeof databaseFamily>,
  c: ExpectedColumn,
) {
  const sameName =
    spelling(c.column) === spelling(one.name) || spelling(c.field) === spelling(one.name)
  const run = Math.max(sharedRun(one.name, c.column), sharedRun(one.name, c.field))
  const kind = prismaFamily(c)
  const fits = kind === family || kind === 'string'
  return {
    fits,
    sameName,
    weight:
      !fits || (!sameName && run < 3)
        ? null
        : (sameName ? 100 : run * 2) +
          (kind === family ? 4 : 0) +
          (one.nullable === !c.required ? 1 : 0),
  }
}

/** How a related model and the table are related, over one column on either side. */
function linkOf(
  table: Expected,
  other: Expected,
  child: Expected['foreignKeys'][number] | undefined,
  parent: Expected['foreignKeys'][number] | undefined,
) {
  if (child !== undefined) {
    return {
      relation: 'points-here',
      via: `${other.model}.${child.fromColumns[0] ?? ''} → ${table.model}.${child.toColumns[0] ?? ''}`,
    }
  }
  if (parent !== undefined) {
    return {
      relation: 'pointed-at',
      via: `${table.model}.${parent.fromColumns[0] ?? ''} → ${other.model}.${parent.toColumns[0] ?? ''}`,
    }
  }
  return null
}

/**
 * The columns of a related model the values of a dropped column could move to: its rows point
 * at this table's, or this table's at its, over one column the database has now.
 */
function movesInto(
  site: CheckSite,
  actual: Actual,
  other: Expected,
  parentsByModel: ReadonlyMap<string, readonly Expected['foreignKeys'][number][]>,
  like: (c: ExpectedColumn) => ReturnType<typeof likeness>,
) {
  const { table, has, actualOf } = site
  if (other === table) return []
  const otherActual = actualOf(other)
  const child = other.foreignKeys.find(
    (fk) =>
      fk.toModel === table.model &&
      fk.fromColumns.length === 1 &&
      has(actual.columns, fk.toColumns[0] ?? '') &&
      (otherActual === undefined || has(otherActual.columns, fk.fromColumns[0] ?? '')),
  )
  const parent = otherActual === undefined ? undefined : parentsByModel.get(other.model)?.[0]
  const link = linkOf(table, other, child, parent)
  if (link === null) return []
  // Not its key, nor a key it points with: a value moves into a column that holds data.
  const keys = new Set([...other.primaryKey, ...other.foreignKeys.flatMap((fk) => fk.fromColumns)])
  return other.columns
    .filter((c) => !has(otherActual?.columns, c.column) && !keys.has(c.column))
    .map((c) => {
      const likeIt = like(c)
      return {
        choice: 'move',
        value: `${other.model}.${c.field}`,
        type: c.type,
        relation: link.relation,
        via: link.via,
        created: otherActual === undefined,
        fits: likeIt.fits,
        sameName: likeIt.sameName,
        weight: likeIt.weight,
      }
    })
}

/**
 * Every column the migration adds that a dropped column of this table could have gone to: in
 * the table itself (a rename), or in a related model (a move), with how the two are related and
 * how much it reads as the dropped one.
 */
function placesOf(site: CheckSite, actual: Actual, one: Actual['columns'][number]) {
  const { input, table, has } = site
  const family = databaseFamily({
    dialect: input.dialect,
    dataType: one.dataType,
    columnType: one.columnType,
  })
  const like = (c: ExpectedColumn) => likeness(one, family, c)
  const keyColumns = new Set(table.primaryKey)
  const renames = table.columns
    .filter((c) => !has(actual.columns, c.column) && !keyColumns.has(c.column))
    .map((c) => {
      const likeIt = like(c)
      return {
        choice: 'rename',
        value: c.field,
        type: c.type,
        relation: 'same',
        via: null,
        created: false,
        fits: likeIt.fits,
        sameName: likeIt.sameName,
        weight: likeIt.weight,
      }
    })
  const parentsByModel = Map.groupBy(
    table.foreignKeys.filter(
      (fk) => fk.fromColumns.length === 1 && has(actual.columns, fk.fromColumns[0] ?? ''),
    ),
    (fk) => fk.toModel,
  )
  const moves = input.expected.flatMap((other) =>
    movesInto(site, actual, other, parentsByModel, like),
  )
  return [...renames, ...moves]
}

/** Why a place reads as where the values went. */
function placeReason(choice: string, sameName: boolean) {
  const named = sameName ? 'same-name' : 'similar-name'
  return choice === 'move' ? `${named}-related` : named
}

/** The places that read as where the values went, the likeliest first. */
function rankPlaces(places: ReturnType<typeof placesOf>) {
  return places
    .flatMap((place) =>
      place.weight === null
        ? []
        : [
            {
              choice: place.choice,
              value: place.value,
              reason: placeReason(place.choice, place.sameName),
              sameName: place.sameName,
              weight: place.weight,
            },
          ],
    )
    .toSorted((x, y) => y.weight - x.weight)
}

/**
 * Two columns dropped can read as gone to one place (`fullName` and `nickname` to `name`): the
 * place is suggested for the one it reads as more, and for neither on a tie.
 */
function outdone(
  site: CheckSite,
  actual: Actual,
  dropped: Actual['columns'][number],
  best: ReturnType<typeof rankPlaces>[number],
) {
  const { table, normal } = site
  const kept = new Set(table.columns.map((c) => normal(c.column)))
  return actual.columns
    .filter((other) => other.name !== dropped.name && !kept.has(normal(other.name)))
    .some((other) => {
      const [theirs] = rankPlaces(placesOf(site, actual, other))
      return (
        theirs !== undefined &&
        theirs.choice === best.choice &&
        theirs.value === best.value &&
        theirs.weight >= best.weight
      )
    })
}

function adviseDropped(site: CheckSite) {
  const { actual, field, advise } = site
  const dropped = actual?.columns.find((c) => c.name === field)
  if (actual === undefined || dropped === undefined) return advise(null)
  // Found once: the destinations are the places as they are, the candidates the ranked ones.
  const places = placesOf(site, actual, dropped)
  const destinations = places.map((place) => ({
    choice: place.choice,
    value: place.value,
    type: place.type,
    fits: place.fits,
    relation: place.relation,
    via: place.via,
    created: place.created,
  }))
  const ranked = rankPlaces(places)
  const candidates = ranked.map((c) => ({
    choice: c.choice,
    value: c.value,
    reason: c.reason,
  }))
  // One is suggested when it stands out: the same name, or a likeness no other place has.
  const [best, second] = ranked
  if (best === undefined) return advise(null, { column: field }, candidates, destinations)
  const standsOut = best.sameName || second === undefined || best.weight > second.weight
  if (!standsOut || outdone(site, actual, dropped, best)) {
    return advise(null, { column: field }, candidates, destinations)
  }
  return advise(
    {
      choice: best.choice,
      value: best.value,
      reason: best.choice === 'move' ? 'moved' : 'renamed',
    },
    best.choice === 'move'
      ? { column: field, movedTo: best.value }
      : { column: field, renamedTo: best.value },
    candidates,
    destinations,
  )
}

function adviseConversion(site: CheckSite) {
  const { input, sql, column, existing, advise } = site
  if (column === undefined || existing === undefined) return advise(null)
  const family = databaseFamily({
    dialect: input.dialect,
    dataType: existing.dataType,
    columnType: existing.columnType,
  })
  const converted = family === 'string' ? sql.number(column.column, column.type) : null
  return converted === null
    ? advise(null)
    : advise({ choice: 'sql', value: converted, reason: 'convert-number' })
}

/** What each kind of check is advised by. */
const ADVISERS = new Map<string, (site: CheckSite) => Advice>([
  ['not-null', adviseFill],
  ['column-added', adviseFill],
  ['enum', adviseEnum],
  ['unique', adviseUnique],
  ['foreign-key', adviseForeignKey],
  ['column-dropped', adviseDropped],
  ['column-type', adviseConversion],
  ['column-recreated', adviseConversion],
  ['value-out-of-range', (site) => site.advise({ choice: 'clamp', value: null, reason: 'clamp' })],
  [
    'value-too-long',
    (site) => site.advise({ choice: 'truncate', value: null, reason: 'truncate' }),
  ],
  [
    'value-truncated',
    (site) => site.advise({ choice: 'truncate', value: null, reason: 'truncate' }),
  ],
  [
    'value-not-convertible',
    (site) =>
      site.advise(
        site.column?.required === false
          ? { choice: 'null', value: null, reason: 'nullable' }
          : { choice: 'delete', value: null, reason: 'not-nullable' },
      ),
  ],
])

/**
 * The facts and the suggestion of each check, in the order the checks are given.
 *
 * @param input - the dialect, the tables the schema expects and the database has, the checks,
 *   and the values each enum column stores now (for the enum checks that found rows)
 * @returns one entry per check: the facts to describe it by, and a suggestion or null
 */
export function adviseChecks(input: AdviceInput) {
  const sql = sqlOf(input.dialect, input.cockroach)
  const normal = (name: string) => (input.dialect === 'mysql' ? name.toLowerCase() : name)
  const same = (a: string, b: string) => normal(a) === normal(b)
  const has = (columns: readonly { readonly name: string }[] | undefined, name: string) =>
    columns?.some((c) => same(c.name, name)) === true
  const actualOf = (table: Expected) =>
    input.actual.find(
      (t) =>
        same(t.table, table.table) &&
        (table.schema === null || t.schema === null || t.schema === table.schema),
    )
  const env: AdviceEnv = { input, sql, normal, has, actualOf }
  const modelOf = new Map(input.expected.toReversed().map((t) => [t.model, t]))
  return input.checks.map((check) => adviseCheck(env, check, modelOf.get(check.model)))
}

function adviseCheck(
  env: AdviceEnv,
  check: AdviceInput['checks'][number],
  table: Expected | undefined,
): Advice {
  const field = fieldOf(check)
  const actual = table === undefined ? undefined : env.actualOf(table)
  const column = table?.columns.find((c) => c.field === field)
  const existing = actual?.columns.find((c) => c.name === column?.column)
  const base: Readonly<Record<string, string>> = {
    model: check.model,
    field,
    subject: check.subject,
    what: check.what,
    ...typeChangeFacts(check.kind, column, existing),
  }
  const advise: CheckSite['advise'] = (
    suggestion,
    facts = {},
    candidates = [],
    destinations = [],
  ) => ({
    facts: { ...base, ...facts },
    suggestion,
    candidates,
    destinations,
  })
  // A dropped model is not in the schema any more: what it was is the table the check names.
  if (check.kind === 'table-dropped') return advise(null, { table: check.subject })
  if (table === undefined) return advise(null)
  const adviser = ADVISERS.get(check.kind)
  const site = { ...env, check, field, table, actual, column, existing, advise }
  return adviser === undefined ? advise(null) : adviser(site)
}

/**
 * The values an enum column stores now, to tell which of them the new enum loses: read from the
 * table as it is, NULLs aside, at most a hundred of them.
 *
 * @example
 * ```sql
 * SELECT DISTINCT "role" AS "value" FROM "User" WHERE "role" IS NOT NULL LIMIT 100
 * ```
 */
export function storedValues(
  dialect: Dialect,
  table: { readonly schema: string | null; readonly table: string },
  column: string,
) {
  const name = quoteIdentifier(dialect, column)
  return {
    sql: `SELECT DISTINCT ${name} AS ${quoteIdentifier(dialect, 'value')} FROM ${qualifiedName(dialect, table)} WHERE ${name} IS NOT NULL LIMIT 100`,
    params: [],
  }
}
