import { Array, Result } from 'effect'

import { qualifiedName } from '../../../sql/index.js'
import type { ModelFixes } from '../decisions.js'
import { sqlOf } from '../dialect.js'
import type { FixContext } from './versions.js'

/** A foreign key over one column, which a value can be moved along. */
function oneColumn(fk: {
  readonly fromColumns: readonly string[]
  readonly toColumns: readonly string[]
}) {
  return fk.fromColumns.length === 1 && fk.toColumns.length === 1
}

/** Whether the table the database has holds a column of that name. */
function hasColumn(
  table: { readonly columns: readonly { readonly name: string }[] } | undefined,
  name: string,
) {
  return table?.columns.some((c) => c.name === name) === true
}

/**
 * The columns the decisions move to a related model, resolved against the schema and the
 * database: where each value is kept while the migration runs, what fills the column it lands
 * in, and what runs once the migration is done.
 *
 * @example
 * ```sql
 * -- User.authorName takes the values of Post.authorName, which the migration drops.
 * -- before the migration, the values are kept by the key the two tables are related by, with
 * -- the primary key that says which of several rows comes first
 * CREATE TABLE "hk_move_Post_authorName" AS
 *   SELECT "authorId" AS "hk_key", "authorName" AS "hk_value", "id" AS "hk_order_0" FROM "public"."Post"
 * -- in the migration, the added column is filled from there (`valueFrom`): of the rows pointing
 * -- at one user, the value of the one with the smallest key that has a value
 * (SELECT "hk_value" FROM "hk_move_Post_authorName"
 *  WHERE "hk_key" = "id" AND "hk_value" IS NOT NULL ORDER BY "hk_order_0", "hk_value" LIMIT 1)
 * -- after the migration (`after`)
 * DROP TABLE "hk_move_Post_authorName"
 * ```
 */
export function resolveMoves(
  context: FixContext,
  models: Readonly<Record<string, ModelFixes>> | undefined,
) {
  const { dialect, keyOf, q, actualByKey } = context
  // A column moved to a related model: Prisma drops it from one table and adds it to the other,
  // in whichever order its migration has them. Its values are kept before the migration in a
  // table of their own, keyed by the column the two tables are related by; the column added
  // is filled from there, or, in a table the migration creates, the rows are made from there;
  // and the table goes once the migration is done.
  const moveRequests = context.expected.flatMap((target) =>
    Object.entries(models?.[target.model]?.fields ?? {}).flatMap(([field, fix]) =>
      fix.movedFrom === undefined ? [] : [{ target, field, from: fix.movedFrom }],
    ),
  )
  const resolved = moveRequests.map(({ target, field, from }) => {
    const path = `${target.model}.${field}`
    const column = target.columns.find((c) => c.field === field)
    const targetActual = actualByKey.get(keyOf(target))
    const source = context.expected.find((t) => t.model === from.model)
    const sourceActual = source === undefined ? undefined : actualByKey.get(keyOf(source))
    // The target's rows point at the source's (a profile at its user): each takes its own
    // row's value. Else the source's rows point at the target's: each target row takes the
    // value of the first row pointing at it.
    const child = target.foreignKeys.find((fk) => fk.toModel === from.model && oneColumn(fk))
    const parent =
      targetActual === undefined
        ? undefined
        : source?.foreignKeys.find((fk) => fk.toModel === target.model && oneColumn(fk))
    const link =
      child !== undefined
        ? { key: child.toColumns[0] ?? '', match: child.fromColumns[0] ?? '' }
        : parent !== undefined
          ? { key: parent.fromColumns[0] ?? '', match: parent.toColumns[0] ?? '' }
          : null
    const errors =
      column === undefined
        ? targetActual === undefined
          ? [`${path}: ${target.model} has no field ${field}.`]
          : []
        : source === undefined || sourceActual === undefined
          ? [`${path}: the database has no table of ${from.model} to move ${from.column} from.`]
          : !hasColumn(sourceActual, from.column)
            ? [`${path}: ${sourceActual.table} has no column ${from.column}.`]
            : link === null
              ? [
                  `${path}: ${target.model} and ${from.model} are not related by a foreign key over one column, so no row of ${target.model} can be told which value of ${from.model}.${from.column} is its own.`,
                ]
              : !hasColumn(sourceActual, link.key) ||
                  (targetActual !== undefined && !hasColumn(targetActual, link.match))
                ? [
                    `${path}: the relation between ${target.model} and ${from.model} is added by this migration; relate them in a migration before the one that moves ${from.column}.`,
                  ]
                : []
    if (
      errors.length > 0 ||
      column === undefined ||
      source === undefined ||
      sourceActual === undefined ||
      link === null
    ) {
      return Result.fail(errors)
    }
    // PostgreSQL cuts a name at 63 bytes without saying so, and MySQL refuses one over 64
    // characters: a long one keeps its start and ends in a number made of the whole of it.
    const named = `hk_move_${sourceActual.table}_${from.column}`.replaceAll(/\W/gu, '_')
    const holdingName =
      named.length <= 60
        ? named
        : `${named.slice(0, 51)}_${Array.makeBy(
            named.length,
            (index) => named.codePointAt(index) ?? 0,
          )
            .reduce((hash, code) => (hash * 31 + code) % 4_294_967_291, 7)
            .toString(16)
            .padStart(8, '0')}`
    // A table of that name already there is what a plan that did not finish left: it may hold the
    // only copy of the values, so it is for a person to look at, not for the plan to write over.
    if (context.actual.some((table) => table.table === holdingName)) {
      return Result.fail([
        `${path}: the database has a table ${holdingName}, left by a plan that did not finish. It holds the values of ${from.model}.${from.column} as they were then: check that ${sourceActual.table}.${from.column} still has them, then drop ${holdingName} and run the check again.`,
      ])
    }
    const holding = q(holdingName)
    // Several rows of the source can point at one row of the target: the value kept is the one
    // of the row with the smallest primary key that has a value, in the check and in the plan.
    const several = child === undefined
    const orderBy = source.primaryKey.every((c) => hasColumn(sourceActual, c))
      ? source.primaryKey
      : []
    const ordered = [...orderBy.map((_, index) => q(`hk_order_${index}`)), q('hk_value')].join(', ')
    return Result.succeed({
      path,
      target,
      created: targetActual === undefined,
      column,
      source,
      sourceActual,
      from,
      link,
      holding,
      /** Whether several rows of the source can point at one row of the target. */
      several,
      /** The columns of the source the kept values are read with: the key, the value, its primary key. */
      kept: [
        `${q(link.key)} AS ${q('hk_key')}`,
        `${q(from.column)} AS ${q('hk_value')}`,
        ...orderBy.map((c, index) => `${q(c)} AS ${q(`hk_order_${index}`)}`),
      ].join(', '),
      /** Which of the kept values a row takes, read from `source`: the holding table, or the rows in the check. */
      valueFrom: (kept: string) =>
        `(SELECT ${q('hk_value')} FROM ${kept} WHERE ${q('hk_key')} = ${q(link.match)} AND ${q('hk_value')} IS NOT NULL ORDER BY ${ordered} LIMIT 1)`,
    })
  })
  const [moveErrors, moved] = Array.separate(resolved)
  // Every new table's rows are made in one INSERT, from values of one table related one way.
  const createdTargets = [...new Set(moved.filter((m) => m.created).map((m) => m.target))]
  const createdErrors = createdTargets.flatMap((target) => {
    const into = moved.filter((m) => m.target === target)
    const [first] = into
    if (first === undefined) return []
    const mixed = into.some((m) => m.source !== first.source || m.link.match !== first.link.match)
    return mixed
      ? [
          `${target.model}: the migration creates ${target.table}, and its rows can be made from the values of one related table only.`,
        ]
      : target.columns
          .filter(
            (c) =>
              c.required &&
              !c.databaseDefault &&
              !c.updatedAt &&
              !['uuid', 'cuid', 'nanoid', 'ulid'].includes(c.defaultFunction ?? '') &&
              c.column !== first.link.match &&
              !into.some((m) => m.column.column === c.column),
          )
          .map(
            (c) =>
              `${target.model}.${c.field}: the migration creates ${target.table}, and ${c.field} is required with no default to make its rows with.`,
          )
  })
  const afterMigration = [
    ...createdTargets.flatMap((target) => {
      const into = moved.filter((m) => m.target === target)
      const [first] = into
      if (first === undefined) return []
      const sql = sqlOf(dialect, false)
      const alias = (index: number) => q(`hk_${index}`)
      const generated = target.columns.flatMap((c) => {
        if (
          !c.required ||
          c.databaseDefault ||
          c.column === first.link.match ||
          into.some((m) => m.column.column === c.column)
        ) {
          return []
        }
        if (c.updatedAt) return [{ column: c.column, sql: sql.now }]
        if (c.defaultFunction === 'uuid') return [{ column: c.column, sql: sql.uuid }]
        return ['cuid', 'nanoid', 'ulid'].includes(c.defaultFunction ?? '')
          ? [{ column: c.column, sql: sql.randomId }]
          : []
      })
      const columns = [
        q(first.link.match),
        ...into.map((m) => q(m.column.column)),
        ...generated.map((g) => q(g.column)),
      ]
      const values = [
        `${alias(0)}.${q('hk_key')}`,
        ...into.map((_, index) => `${alias(index)}.${q('hk_value')}`),
        ...generated.map((g) => g.sql),
      ]
      const joins = into
        .slice(1)
        .map(
          (m, index) =>
            ` LEFT JOIN ${m.holding} AS ${alias(index + 1)} ON ${alias(index + 1)}.${q('hk_key')} = ${alias(0)}.${q('hk_key')}`,
        )
        .join('')
      const kept = into.map((_, index) => `${alias(index)}.${q('hk_value')} IS NOT NULL`)
      return [
        `INSERT INTO ${qualifiedName(dialect, target)} (${columns.join(', ')}) SELECT ${values.join(', ')} FROM ${first.holding} AS ${alias(0)}${joins} WHERE ${alias(0)}.${q('hk_key')} IS NOT NULL AND (${kept.join(' OR ')})`,
      ]
    }),
    ...moved.map((m) => `DROP TABLE ${m.holding}`),
  ]
  return {
    errors: [...moveErrors.flat(), ...createdErrors],
    moved,
    /** What runs after the migration: the rows of a table it creates made, the kept values dropped. */
    after: afterMigration,
  }
}
