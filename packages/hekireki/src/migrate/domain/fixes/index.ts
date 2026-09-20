import type { Dialect } from '../../../database/url.js'
import { qualifiedName } from '../../../sql/index.js'
import type { makeConversions } from '../conversion.js'
import type { ModelFixes } from '../decisions.js'
import type { makeExpectedTables } from '../tables.js'
import { resolveMoves } from './moves.js'
import { onlyMoves, resolveTable } from './resolve-table.js'
import { columnStep, duplicateStep, migrationStep, orphanStep } from './steps.js'
import { valueSql } from './values.js'
import { makeFixContext } from './versions.js'
import type { FixState } from './versions.js'

/**
 * The fixes the decisions of the Migrate page make, made twice from one description.
 *
 * - For the plan: UPDATE and DELETE statements to run before Prisma's migration, one fix after
 *   another, and what the migration itself does with the rows (a conversion, a member mapped
 *   in the enum's cast, the rows of an added column filled) for `migrate plan --migration`.
 * - For the check, read-only: the same steps as a chain of CTEs, one version of a table per
 *   step, in the plan's order, so every count is of the rows as the plan will leave them.
 *
 * The steps run table by table (each fixed column in the order it was decided, then the
 * duplicates), then the orphans, parents before the children that point at them, then what
 * the migration does. A delete is followed as the database follows it: a foreign key it has
 * refuses it (the plan fails), or deletes the rows that point at the deleted ones (down the
 * keys, recursively where a table points at itself), or clears their key.
 */

/**
 * The fixes the decisions ask for, resolved against the schema and the database: each fix with
 * the query that counts its rows and the plan's statements, what the database does on its own
 * about the rows a fix deletes or changes, the CTEs the check reads every changed table through,
 * what the migration itself has to do, and every decision that names something wrong.
 *
 * @example
 * ```sql
 * -- `with`, the clause every query of the check starts with: one CTE per step, in the plan's order
 * WITH "hk_fix_0" AS (SELECT "id", "email", COALESCE("name", 'unknown') AS "name", "role" FROM "public"."User"),
 *      "hk_fix_1" AS (SELECT "id", "email", "name", CASE "role" WHEN 'EDITOR' THEN 'VIEWER' ELSE "role" END AS "role" FROM "hk_fix_0"),
 *      "hk_fix_2" AS (...the duplicates of "hk_fix_1" gone...)
 * -- `sources` then says where a changed table is read from: "public"."User" → "hk_fix_2"
 * ```
 */
export function resolveFixes(input: {
  readonly dialect: Dialect
  readonly expected: ReturnType<typeof makeExpectedTables>
  readonly actual: Parameters<typeof makeFixContext>[0]['actual']
  readonly keyOf: (table: { readonly schema: string | null; readonly table: string }) => string
  readonly conversionsOf: (
    table: ReturnType<typeof makeExpectedTables>[number],
    column: string,
  ) => ReturnType<typeof makeConversions>
  readonly models: Readonly<Record<string, ModelFixes>> | undefined
}) {
  const context = makeFixContext(input)
  const { dialect, keyOf, q, actualByKey, versioned, current, empty } = context
  const configured = Object.entries(input.models ?? {})
  const unknownModels = configured.flatMap(([model]) =>
    input.expected.some((table) => table.model === model)
      ? []
      : [`${model}: the schema has no model ${model}.`],
  )
  const missing = input.expected.flatMap((table) => {
    const config = input.models?.[table.model]
    return config !== undefined && !actualByKey.has(keyOf(table)) && !onlyMoves(config)
      ? [`${table.model}: the migration creates ${table.table}, so there are no rows of it to fix.`]
      : []
  })
  const tables = input.expected.flatMap((table) => {
    const config = input.models?.[table.model]
    const actual = actualByKey.get(keyOf(table))
    if (config === undefined || actual === undefined) return []
    const resolved = resolveTable({
      table,
      actual,
      conversionsOf: (column) => input.conversionsOf(table, column),
      config,
    })
    return [{ table, actual, resolved }]
  })

  const moves = resolveMoves(context, input.models)
  const { moved } = moves

  const errors = [
    ...unknownModels,
    ...missing,
    ...tables.flatMap((entry) => entry.resolved.errors),
    ...moves.errors,
  ]
  const usable = tables.filter((entry) => entry.resolved.errors.length === 0)

  // Parents first down the foreign keys a fix settles orphans of; a cycle is broken where it closes.
  const byKey = new Map(usable.map((entry) => [keyOf(entry.table), entry]))
  const visit = (
    key: string,
    path: readonly string[],
    done: readonly string[],
  ): readonly string[] => {
    if (done.includes(key) || path.includes(key)) return done
    const entry = byKey.get(key)
    if (entry === undefined) return done
    const parents = entry.resolved.relations
      .map((r) => keyOf({ schema: r.foreignKey.toSchema, table: r.foreignKey.toTable }))
      .filter((parent) => parent !== key)
    const after = parents.reduce((acc, parent) => visit(parent, [...path, key], acc), done)
    return after.includes(key) ? after : [...after, key]
  }
  const ordered = usable
    .reduce<readonly string[]>((done, entry) => visit(keyOf(entry.table), [], done), [])
    .flatMap((key) => {
      const entry = byKey.get(key)
      return entry === undefined ? [] : [entry]
    })

  const columnsAndDuplicates = usable.reduce(
    (state, entry) =>
      entry.resolved.duplicates.reduce(
        (acc, duplicate) => duplicateStep(context, acc, entry, duplicate),
        entry.resolved.columns
          .filter(({ added }) => !added)
          .reduce(
            (acc, { column, fix }) =>
              columnStep(
                context,
                acc,
                entry,
                column,
                fix,
                input.conversionsOf(entry.table, column.column),
              ),
            state,
          ),
      ),
    empty,
  )
  const orphans = ordered.reduce(
    (state, entry) =>
      entry.resolved.relations.reduce(
        (acc, relation) => orphanStep(context, acc, entry, relation),
        state,
      ),
    columnsAndDuplicates,
  )
  // The values of every moved column kept, after the fixes of its table, before the migration.
  const kept: FixState = {
    ...orphans,
    fixes: [
      ...orphans.fixes,
      ...moved.map((m) => ({
        model: m.target.model,
        table: m.target,
        subject: m.path,
        kind: 'move',
        inMigration: false,
        action: `values moved from ${m.source.model}.${m.from.column}`,
        count: `SELECT COUNT(*) AS ${q('count')} FROM ${current(orphans, keyOf(m.source))} WHERE ${q(m.from.column)} IS NOT NULL`,
        statements: [
          `CREATE TABLE ${m.holding} AS SELECT ${m.kept} FROM ${qualifiedName(dialect, m.sourceActual)}`,
        ],
        parts: null,
      })),
    ],
    // Where several rows of the source point at one row of the target and do not agree, one
    // value is kept and the others go: said out loud, with how many rows of the target it is.
    effects: [
      ...orphans.effects,
      ...moved
        .filter((m) => m.several)
        .map((m) => ({
          kind: 'move-ambiguous',
          severity: 'warning',
          model: m.target.model,
          subject: m.path,
          what: `several rows of ${m.source.model} hold different values of ${m.from.column} for one row of ${m.target.model}`,
          hint: `The value kept is the one of the ${m.source.model} with the smallest ${m.source.primaryKey.join(', ') || m.from.column} that has one; the others go with the column. Settle them first if another should stay.`,
          count: `SELECT COUNT(*) AS ${q('count')} FROM (SELECT ${q(m.link.key)} FROM ${current(orphans, keyOf(m.source))} WHERE ${q(m.link.key)} IS NOT NULL AND ${q(m.from.column)} IS NOT NULL GROUP BY ${q(m.link.key)} HAVING COUNT(DISTINCT ${q(m.from.column)}) > 1) AS ${q('hk_ambiguous')}`,
        })),
    ],
  }
  const final = usable.reduce((state, entry) => migrationStep(context, state, entry, moved), kept)

  const changed = [...final.versions.keys()].flatMap((key) => {
    const table = versioned(key)
    return table === null ? [] : [table]
  })
  return {
    errors,
    fixes: final.fixes,
    effects: final.effects,
    /** The WITH clause every query of the check starts with; empty when nothing is fixed. */
    with:
      final.ctes.length === 0
        ? ''
        : `WITH ${final.recursive ? 'RECURSIVE ' : ''}${final.ctes.join(', ')} `,
    /** Where to read a changed table from, by its key; every other table is read as it is. */
    sources: final.versions,
    /**
     * The same before the migration's own steps: the rows as the fixes leave them, in the columns
     * and types the database has now, which is what a CHECK constraint of today is asked about.
     */
    sourcesBeforeMigration: kept.versions,
    /** The tables the fixes or the database's own rules change, to read their rows as they leave them. */
    changedTables: changed,
    /** Columns the migration adds that a fill gives the rows already there, by table key. */
    filled: new Map(
      usable.map((entry) => [
        keyOf(entry.table),
        entry.resolved.columns
          .filter((c) => c.added && (c.fix.nulls !== undefined || c.fix.movedFrom !== undefined))
          .map((c) => c.column.column),
      ]),
    ),
    /** The columns whose values move to another table, by table key: they are not lost. */
    moved: moved.map((m) => ({ key: keyOf(m.sourceActual), column: m.from.column })),
    /** What runs after the migration: the rows of a table it creates made, the kept values dropped. */
    after: moves.after,
    /** What `migrate plan --migration` writes into Prisma's migration, table by table. */
    rewrite: usable.map((entry) => ({
      table: {
        schema: typeof entry.table.schema === 'string' ? entry.table.schema : null,
        table: entry.table.table,
      },
      converts: entry.resolved.columns.flatMap(({ column, fix, added }) =>
        added || fix.convert === undefined ? [] : [{ column: column.column, sql: fix.convert.sql }],
      ),
      enumMaps: entry.resolved.columns.flatMap(({ column, fix, added }) => {
        if (added || column.kind !== 'enum' || dialect === 'sqlite') return []
        const existing =
          entry.actual.columns.find((c) => c.name === column.column)?.enumValues ?? null
        if (existing === null) return []
        const mapping = Object.entries(fix.values ?? {}).flatMap(([stored, member]) => {
          const to = column.enumMembers?.find((m) => m.name === member)?.dbName ?? member
          return existing.includes(to) ? [] : [{ from: stored, to }]
        })
        return mapping.length === 0
          ? []
          : [
              {
                column: column.column,
                type: column.enumType ?? column.type,
                mapping,
                existing,
                members: (column.enumMembers ?? []).map((m) => m.dbName),
              },
            ]
      }),
      fills: [
        ...entry.resolved.columns.flatMap(({ column, fix, added }) =>
          added && fix.nulls !== undefined
            ? [{ column: column.column, sql: valueSql(dialect, column, fix.nulls) }]
            : [],
        ),
        ...moved
          .filter((m) => !m.created && m.target === entry.table)
          .map((m) => ({ column: m.column.column, sql: m.valueFrom(m.holding) })),
      ],
    })),
  }
}
