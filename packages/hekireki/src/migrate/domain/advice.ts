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
  const lengths = Array.from({ length: left.length }, (_, start) =>
    Array.from({ length: left.length - start }, (__, index) => left.slice(start, start + index + 1))
      .filter((run) => right.includes(run))
      .reduce((longest, run) => Math.max(longest, run.length), 0),
  )
  return Math.max(0, ...lengths)
}

/** A name with case and separators set aside: `in-review`, `In Review` and `IN_REVIEW` alike. */
function spelling(text: string) {
  return text.toLowerCase().replaceAll(/[\s_-]/gu, '')
}

/** What fills the rows already there of a column that becomes, or is added, required. */
function fill(input: {
  readonly column: ExpectedColumn
  readonly table: Expected
  readonly sql: ReturnType<typeof sqlOf>
  readonly unique: boolean
}): Suggestion | null {
  const { column, sql } = input
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
  // A key that points at another table cannot take a made-up value: the foreign key refuses what
  // is not there. The rows go to a row that is, to be pointed at the right one afterwards.
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
  const [key] = input.table.primaryKey
  if (column.kind === 'enum') {
    const member = column.enumMembers?.[0]?.name
    return member === undefined ? null : { choice: 'value', value: member, reason: 'enum-first' }
  }
  switch (column.type) {
    case 'String':
      // A unique column cannot take one value for every row: each gets its own, from its key.
      return input.unique && key !== undefined && input.table.primaryKey.length === 1
        ? { choice: 'sql', value: sql.prefixed(`${column.field}-`, key), reason: 'from-key' }
        : { choice: 'value', value: '', reason: 'empty-string' }
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

/**
 * The facts and the suggestion of each check, in the order the checks are given.
 *
 * @param input - the dialect, the tables the schema expects and the database has, the checks,
 *   and the values each enum column stores now (for the enum checks that found rows)
 * @returns one entry per check: the facts to describe it by, and a suggestion or null
 */
export function adviseChecks(input: {
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
}) {
  const sql = sqlOf(input.dialect, input.cockroach)
  const same = (a: string, b: string) =>
    input.dialect === 'mysql' ? a.toLowerCase() === b.toLowerCase() : a === b
  const actualOf = (table: Expected) =>
    input.actual.find(
      (t) =>
        same(t.table, table.table) &&
        (table.schema === null || t.schema === null || t.schema === table.schema),
    )
  return input.checks.map((check) => {
    const field = fieldOf(check)
    const table = input.expected.find((t) => t.model === check.model)
    const actual = table === undefined ? undefined : actualOf(table)
    const column = table?.columns.find((c) => c.field === field)
    const existing = actual?.columns.find((c) => c.name === column?.column)
    const base: Readonly<Record<string, string>> = {
      model: check.model,
      field,
      subject: check.subject,
      what: check.what,
      // A type change, whatever it does to the values: the types it goes between.
      ...(column !== undefined &&
      existing !== undefined &&
      (check.kind.startsWith('value-') || check.kind.startsWith('column-'))
        ? { from: existing.columnType ?? existing.dataType, to: column.type }
        : {}),
    }
    const advise = (
      suggestion: Suggestion | null,
      facts: Readonly<Record<string, string>> = {},
      /** Where the values of a dropped column could go, the likeliest first. */
      candidates: readonly Suggestion[] = [],
      /** Every column the migration adds that the values of a dropped column could go to. */
      destinations: readonly {
        readonly choice: string
        readonly value: string
        readonly type: string
        readonly fits: boolean
        readonly relation: string
        readonly via: string | null
        readonly created: boolean
      }[] = [],
    ) => ({ facts: { ...base, ...facts }, suggestion, candidates, destinations })
    // A dropped model is not in the schema any more: what it was is the table the check names.
    if (check.kind === 'table-dropped') return advise(null, { table: check.subject })
    if (table === undefined) return advise(null)

    switch (check.kind) {
      case 'not-null':
      case 'column-added': {
        if (column === undefined) return advise(null)
        const unique = table.uniques.some(
          (key) => key.columns.length === 1 && key.columns[0] === column.column,
        )
        const suggestion = fill({ column, table, sql, unique })
        return advise(suggestion, {
          type: column.type,
          ...(suggestion?.reason === 'schema-default'
            ? { default: column.defaultValue ?? '' }
            : {}),
          ...(suggestion?.reason === 'enum-first' ? { member: suggestion.value ?? '' } : {}),
          ...(suggestion?.reason === 'first-referenced'
            ? {
                target:
                  table.foreignKeys.find((fk) => fk.fromColumns[0] === column.column)?.toModel ??
                  '',
              }
            : {}),
        })
      }
      case 'enum': {
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
        const fallback = members.find((m) => m.name === column.defaultValue) ?? members[0]
        // A value stored under another spelling of a member (`admin` for ADMIN, `in-review` for
        // IN_REVIEW) is that member; what matches none goes where it would otherwise.
        const sameName = (value: string) =>
          members.find((m) => spelling(m.name) === spelling(value)) ??
          members.find((m) => spelling(m.dbName) === spelling(value))
        const unmatched = removed.filter((value) => sameName(value) === undefined)
        if (removed.length > 0 && unmatched.length < removed.length && fallback !== undefined) {
          return advise(
            {
              choice: 'map',
              value: formatMapping(
                removed.map((value) => [value, (sameName(value) ?? fallback).name] as const),
              ),
              reason: 'enum-same-name',
            },
            { ...facts, member: unmatched.length === 0 ? '' : fallback.name },
          )
        }
        const [only] = removed
        const [replacement] = added
        if (removed.length === 1 && added.length === 1 && only !== undefined && replacement) {
          return advise(
            {
              choice: 'map',
              value: formatMapping([[only, replacement.name]]),
              reason: 'enum-replaced',
            },
            { ...facts, member: replacement.name },
          )
        }
        if (removed.length === 0 || fallback === undefined) return advise(null, facts)
        return advise(
          {
            choice: 'map',
            value: formatMapping(removed.map((value) => [value, fallback.name] as const)),
            reason: fallback.name === column.defaultValue ? 'enum-default' : 'enum-first',
          },
          { ...facts, member: fallback.name },
        )
      }
      case 'unique': {
        const fields = field.split(', ')
        const columns = fields.map((one) => table.columns.find((c) => c.field === one))
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
      case 'foreign-key': {
        const foreignKey = table.foreignKeys.find((fk) => fk.field === field)
        if (foreignKey === undefined) return advise(null)
        const optional = foreignKey.fromColumns.every(
          (name) => table.columns.find((c) => c.column === name)?.required === false,
        )
        return advise(
          optional
            ? { choice: 'null', value: null, reason: 'optional-relation' }
            : { choice: 'delete', value: null, reason: 'required-relation' },
          { target: foreignKey.toModel },
        )
      }
      case 'column-dropped': {
        const dropped = actual?.columns.find((c) => c.name === field)
        if (actual === undefined || dropped === undefined) return advise(null)
        /**
         * Every column the migration adds that a dropped column of this table could have gone
         * to: in the table itself (a rename), or in a related model (a move), with how the two
         * are related and how much it reads as the dropped one.
         */
        const placesOf = (one: typeof dropped) => {
          const family = databaseFamily({
            dialect: input.dialect,
            dataType: one.dataType,
            columnType: one.columnType,
          })
          const has = (columns: readonly { readonly name: string }[] | undefined, name: string) =>
            columns?.some((c) => same(c.name, name)) === true
          // How much a column the migration adds reads as this one: its name (the same but for
          // case and separators, else the longest run of letters they share, three at least),
          // then its kind (text takes any value), then whether it may be empty as this one may.
          const likeness = (c: ExpectedColumn) => {
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
          const renames = table.columns
            .filter((c) => !has(actual.columns, c.column) && !table.primaryKey.includes(c.column))
            .map((c) => {
              const like = likeness(c)
              return {
                choice: 'rename',
                value: c.field,
                type: c.type,
                relation: 'same',
                via: null,
                created: false,
                fits: like.fits,
                sameName: like.sameName,
                weight: like.weight,
              }
            })
          // A related model: its rows point at this table's, or this table's at its, over one
          // column the database has now.
          const moves = input.expected.flatMap((other) => {
            if (other === table) return []
            const otherActual = actualOf(other)
            const child = other.foreignKeys.find(
              (fk) =>
                fk.toModel === table.model &&
                fk.fromColumns.length === 1 &&
                has(actual.columns, fk.toColumns[0] ?? '') &&
                (otherActual === undefined || has(otherActual.columns, fk.fromColumns[0] ?? '')),
            )
            const parent =
              otherActual === undefined
                ? undefined
                : table.foreignKeys.find(
                    (fk) =>
                      fk.toModel === other.model &&
                      fk.fromColumns.length === 1 &&
                      has(actual.columns, fk.fromColumns[0] ?? ''),
                  )
            const link =
              child !== undefined
                ? {
                    relation: 'points-here',
                    via: `${other.model}.${child.fromColumns[0] ?? ''} → ${table.model}.${child.toColumns[0] ?? ''}`,
                  }
                : parent !== undefined
                  ? {
                      relation: 'pointed-at',
                      via: `${table.model}.${parent.fromColumns[0] ?? ''} → ${other.model}.${parent.toColumns[0] ?? ''}`,
                    }
                  : null
            if (link === null) return []
            // Not its key, nor a key it points with: a value moves into a column that holds data.
            const keys = new Set([
              ...other.primaryKey,
              ...other.foreignKeys.flatMap((fk) => fk.fromColumns),
            ])
            return other.columns
              .filter((c) => !has(otherActual?.columns, c.column) && !keys.has(c.column))
              .map((c) => {
                const like = likeness(c)
                return {
                  choice: 'move',
                  value: `${other.model}.${c.field}`,
                  type: c.type,
                  relation: link.relation,
                  via: link.via,
                  created: otherActual === undefined,
                  fits: like.fits,
                  sameName: like.sameName,
                  weight: like.weight,
                }
              })
          })
          return [...renames, ...moves]
        }
        /** The places that read as where the values went, the likeliest first. */
        const destinationsOf = (one: typeof dropped) =>
          placesOf(one)
            .flatMap((place) =>
              place.weight === null
                ? []
                : [
                    {
                      choice: place.choice,
                      value: place.value,
                      reason:
                        place.choice === 'move'
                          ? place.sameName
                            ? 'same-name-related'
                            : 'similar-name-related'
                          : place.sameName
                            ? 'same-name'
                            : 'similar-name',
                      sameName: place.sameName,
                      weight: place.weight,
                    },
                  ],
            )
            .toSorted((x, y) => y.weight - x.weight)
        const destinations = placesOf(dropped).map((place) => ({
          choice: place.choice,
          value: place.value,
          type: place.type,
          fits: place.fits,
          relation: place.relation,
          via: place.via,
          created: place.created,
        }))
        const ranked = destinationsOf(dropped)
        const candidates = ranked.map((c) => ({
          choice: c.choice,
          value: c.value,
          reason: c.reason,
        }))
        // One is suggested when it stands out: the same name, or a likeness no other place has.
        // Two columns dropped can read as gone to one place (`fullName` and `nickname` to
        // `name`); it is suggested for the one it reads as more, and for neither on a tie.
        const [best, second] = ranked
        const standsOut =
          best !== undefined &&
          (best.sameName || second === undefined || best.weight > second.weight)
        const outdone =
          best !== undefined &&
          actual.columns
            .filter(
              (other) =>
                other.name !== dropped.name &&
                !table.columns.some((c) => same(c.column, other.name)),
            )
            .some((other) => {
              const [theirs] = destinationsOf(other)
              return (
                theirs !== undefined &&
                theirs.choice === best.choice &&
                theirs.value === best.value &&
                theirs.weight >= best.weight
              )
            })
        if (best === undefined || !standsOut || outdone) {
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
      case 'column-type':
      case 'column-recreated': {
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
      case 'value-out-of-range':
        return advise({ choice: 'clamp', value: null, reason: 'clamp' })
      case 'value-too-long':
      case 'value-truncated':
        return advise({ choice: 'truncate', value: null, reason: 'truncate' })
      case 'value-not-convertible':
        return advise(
          column?.required === false
            ? { choice: 'null', value: null, reason: 'nullable' }
            : { choice: 'delete', value: null, reason: 'not-nullable' },
        )
      default:
        return advise(null)
    }
  })
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
