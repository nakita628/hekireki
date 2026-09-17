import { qualifiedName } from '../../../sql/index.js'
import type { makeConversions } from '../conversion.js'
import type { ModelFixes } from '../decisions.js'
import { stringLiteral } from '../dialect.js'
import type { makeExpectedTables } from '../tables.js'
import { cascade, updated } from './effects.js'
import type { resolveMoves } from './moves.js'
import { anyOf, describe, identityColumns, postgresType, valueSql } from './values.js'
import type { FixContext, FixedTable, FixState } from './versions.js'

/**
 * The values the new type refuses, enum values and NULLs of one column, before the migration.
 *
 * @example
 * ```sql
 * -- { nulls: 'unknown' } on User.name
 * --   the plan
 * UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL
 * --   the check, as the next version of the table
 * "hk_fix_0" AS (SELECT "id", "email", COALESCE("name", 'unknown') AS "name", "role" FROM "public"."User")
 * --   the rows it changes
 * SELECT COUNT(*) AS "count" FROM "public"."User" WHERE "name" IS NULL
 *
 * -- { values: { EDITOR: 'VIEWER' } } on User.role
 * UPDATE "User" SET "role" = CASE "role" WHEN 'EDITOR' THEN 'VIEWER' ELSE "role" END WHERE "role" IN ('EDITOR')
 * ```
 */
export function columnStep(
  context: FixContext,
  state: FixState,
  entry: FixedTable,
  column: ReturnType<typeof makeExpectedTables>[number]['columns'][number],
  fix: NonNullable<ModelFixes['fields']>[string],
  /** What the change of the column's type refuses or changes, from `makeConversions`. */
  conversions: ReturnType<typeof makeConversions>,
): FixState {
  const { dialect, keyOf, q, current, version, listOf } = context
  const { table, actual } = entry
  const key = keyOf(table)
  const base = qualifiedName(dialect, table)
  const from = current(state, key)
  const name = q(column.column)
  const blocking = conversions.filter(
    (c) => c.severity === 'blocking' && c.kind !== 'column-recreated' && c.condition !== null,
  )
  const refused = blocking.length === 0 ? null : anyOf(blocking.map((c) => c.condition ?? ''))
  const invalid = refused === null ? undefined : fix.invalid
  const bounded = blocking.find((c) => c.bounds !== null)?.bounds ?? null
  const length = blocking.find((c) => c.length !== null)?.length ?? null
  const replaced =
    invalid === undefined || invalid === 'delete'
      ? null
      : invalid === 'null'
        ? 'NULL'
        : invalid === 'clamp'
          ? bounded === null
            ? null
            : `CASE WHEN ${name} < ${bounded.min} THEN ${bounded.min} ELSE ${bounded.max} END`
          : invalid === 'truncate'
            ? length === null
              ? null
              : dialect === 'sqlite'
                ? `SUBSTR(${name}, 1, ${length})`
                : `LEFT(${name}, ${length})`
            : valueSql(dialect, column, invalid.set)
  const deletes = invalid === 'delete'
  const afterInvalid =
    replaced === null || refused === null
      ? name
      : `CASE WHEN ${refused} THEN ${replaced} ELSE ${name} END`
  const existing = actual.columns.find((c) => c.name === column.column)?.enumValues ?? null
  // The stored values and the members they become, written as the plain text they are. A
  // member the column's type does not have yet is mapped by the migration, in its cast.
  const asText = { ...column, kind: 'scalar', type: 'String', isList: false }
  const mapped = Object.entries(fix.values ?? {})
    .map(([stored, member]) => ({
      from: valueSql(dialect, asText, stored),
      to: column.enumMembers?.find((m) => m.name === member)?.dbName ?? member,
    }))
    .filter((m) => existing === null || dialect === 'sqlite' || existing.includes(m.to))
  const mapping = mapped
    .map((m) => `WHEN ${m.from} THEN ${valueSql(dialect, asText, m.to)}`)
    .join(' ')
  const afterValues =
    mapped.length === 0 ? afterInvalid : `CASE ${afterInvalid} ${mapping} ELSE ${afterInvalid} END`
  const fill = fix.nulls === undefined ? null : valueSql(dialect, column, fix.nulls)
  const expression = fill === null ? afterValues : `COALESCE(${afterValues}, ${fill})`
  if (invalid === undefined && mapped.length === 0 && fill === null) return state
  const kept = deletes && refused !== null ? `(${refused}) IS NOT TRUE AND ` : ''
  const next = version(
    state,
    key,
    `SELECT ${actual.columns
      .map((c) => (c.name === column.column ? `${expression} AS ${q(c.name)}` : q(c.name)))
      .join(
        ', ',
      )} FROM ${from}${deletes && refused !== null ? ` WHERE (${refused}) IS NOT TRUE` : ''}`,
  )
  const subject = `${table.model}.${column.field}`
  // Each statement in two halves, so the plan can run it a batch of rows at a time.
  const invalidHead = deletes
    ? `DELETE FROM ${base}`
    : `UPDATE ${base} SET ${name} = ${replaced ?? name}`
  const mappedHead = `UPDATE ${base} SET ${name} = CASE ${name} ${mapping} ELSE ${name} END`
  const mappedWhere = `${name} IN (${mapped.map((m) => m.from).join(', ')})`
  const fixes = [
    ...(invalid === undefined || refused === null
      ? []
      : [
          {
            model: table.model,
            table,
            subject,
            kind: 'invalid',
            inMigration: false,
            action:
              typeof invalid === 'string'
                ? {
                    null: 'values the new type refuses set to NULL',
                    delete: 'rows whose value the new type refuses deleted',
                    clamp: 'values out of range clamped to the range',
                    truncate: 'values too long cut to the length',
                  }[invalid]
                : `values the new type refuses set to ${describe(invalid.set)}`,
            count: `SELECT COUNT(*) AS ${q('count')} FROM ${from} WHERE ${refused}`,
            statements: [`${invalidHead} WHERE ${refused}`],
            parts: { head: invalidHead, table: base, where: refused },
          },
        ]),
    ...(mapped.length === 0
      ? []
      : [
          {
            model: table.model,
            table,
            subject,
            kind: 'values',
            inMigration: false,
            action:
              `values mapped: ${mapped.map((m) => `${m.from} → ${m.to}`).join(', ')}`.replaceAll(
                "'",
                '',
              ),
            count: `SELECT COUNT(*) AS ${q('count')} FROM ${from} WHERE ${kept}${afterInvalid} IN (${mapped.map((m) => m.from).join(', ')})`,
            statements: [`${mappedHead} WHERE ${mappedWhere}`],
            parts: { head: mappedHead, table: base, where: mappedWhere },
          },
        ]),
    ...(fill === null
      ? []
      : [
          {
            model: table.model,
            table,
            subject,
            kind: 'nulls',
            inMigration: false,
            action: `NULLs set to ${describe(fix.nulls ?? null)}`,
            count: `SELECT COUNT(*) AS ${q('count')} FROM ${from} WHERE ${kept}${afterValues} IS NULL`,
            statements: [`UPDATE ${base} SET ${name} = ${fill} WHERE ${name} IS NULL`],
            parts: {
              head: `UPDATE ${base} SET ${name} = ${fill}`,
              table: base,
              where: `${name} IS NULL`,
            },
          },
        ]),
  ]
  const withFixes = { ...next.state, fixes: [...next.state.fixes, ...fixes] }
  const columns = actual.columns.map((c) => c.name)
  const changedRows = [
    ...(replaced !== null && refused !== null ? [refused] : []),
    ...(mapped.length > 0 ? [`${afterInvalid} IN (${mapped.map((m) => m.from).join(', ')})`] : []),
  ]
  const afterUpdate =
    changedRows.length === 0
      ? withFixes
      : updated(
          context,
          withFixes,
          key,
          `SELECT ${listOf(columns)} FROM ${from} WHERE ${anyOf(changedRows)}`,
          [column.column],
          subject,
        )
  return deletes && refused !== null
    ? cascade(
        context,
        afterUpdate,
        key,
        `SELECT ${listOf(columns)} FROM ${from} WHERE ${refused}`,
        subject,
        [key],
      )
    : afterUpdate
}

/**
 * The rows a duplicates fix removes or clears: every row of a group of equal keys but the one kept.
 *
 * @example
 * ```sql
 * SELECT "id", "email", ROW_NUMBER() OVER (PARTITION BY "email" ORDER BY "id" ASC) AS "hk_rank" FROM "User"
 * -- and the rows chosen from it: every one of a group but the first
 * "hk_rank" > 1 AND "email" IS NOT NULL
 * ```
 */
function ranked(
  q: FixContext['q'],
  from: string,
  columns: readonly string[],
  duplicate: FixedTable['resolved']['duplicates'][number],
  table: ReturnType<typeof makeExpectedTables>[number],
) {
  const direction = duplicate.fix.keep === 'first' ? 'ASC' : 'DESC'
  const order = [
    ...duplicate.order,
    ...table.primaryKey.filter((c) => !duplicate.order.includes(c)),
  ]
    .map((c) => `${q(c)} ${direction}`)
    .join(', ')
  const rank = q('hk_rank')
  const partition = duplicate.key.map(q).join(', ')
  const chosen = `${rank} > 1 AND ${duplicate.key.map((c) => `${q(c)} IS NOT NULL`).join(' AND ')}`
  return {
    sql: `SELECT ${columns.join(', ')}, ROW_NUMBER() OVER (PARTITION BY ${partition} ORDER BY ${order}) AS ${rank} FROM ${from}`,
    chosen,
  }
}

/**
 * The duplicates under a unique key: one row of each group kept, the others deleted or their key
 * cleared. What the database then does to the rows pointing at them is followed by `cascade` or
 * `updated`.
 *
 * @example
 * ```sql
 * -- { duplicates: { keep: 'first', others: 'delete' } } on User.email
 * --   the plan
 * DELETE FROM "User" WHERE "id" IN (
 *   SELECT "id" FROM (
 *     SELECT "id", "email", ROW_NUMBER() OVER (PARTITION BY "email" ORDER BY "id" ASC) AS "hk_rank" FROM "User"
 *   ) AS "hk_ranked" WHERE "hk_rank" > 1 AND "email" IS NOT NULL
 * )
 * --   the check, as the next version of the table
 * "hk_fix_2" AS (
 *   SELECT "id", "email", "name", "role" FROM (...ranked...) AS "hk_ranked"
 *   WHERE ("hk_rank" > 1 AND "email" IS NOT NULL) IS NOT TRUE
 * )
 * -- others: 'null' keeps the rows and clears the key:
 * UPDATE "User" SET "code" = NULL WHERE "id" IN (...the same rows...)
 * ```
 */
export function duplicateStep(
  context: FixContext,
  state: FixState,
  entry: FixedTable,
  duplicate: FixedTable['resolved']['duplicates'][number],
): FixState {
  const { dialect, keyOf, q, current, version } = context
  const { table, actual } = entry
  const key = keyOf(table)
  const from = current(state, key)
  const columns = actual.columns.map((c) => q(c.name))
  const rows = ranked(q, from, columns, duplicate, table)
  const clear = duplicate.fix.others === 'null'
  const next = version(
    state,
    key,
    clear
      ? `SELECT ${actual.columns
          .map((c) =>
            duplicate.key.includes(c.name)
              ? `CASE WHEN ${rows.chosen} THEN NULL ELSE ${q(c.name)} END AS ${q(c.name)}`
              : q(c.name),
          )
          .join(', ')} FROM (${rows.sql}) AS ${q('hk_ranked')}`
      : `SELECT ${columns.join(', ')} FROM (${rows.sql}) AS ${q('hk_ranked')} WHERE (${rows.chosen}) IS NOT TRUE`,
  )
  const base = qualifiedName(dialect, table)
  // The rows are named by a key the table has now: the one being fixed cannot tell them apart,
  // and the migration may be adding or dropping the key the schema will have.
  const identity = identityColumns(actual, table.primaryKey, duplicate.key) ?? table.primaryKey
  // `"id"`, or `("a", "b")` for a composite key, as IN compares them.
  const keys = identity.length === 1 ? q(identity[0] ?? '') : `(${identity.map(q).join(', ')})`
  const inPlace = ranked(
    q,
    base,
    [...identity.map(q), ...duplicate.key.filter((c) => !identity.includes(c)).map(q)],
    duplicate,
    table,
  )
  const target = `${keys} IN (SELECT ${identity.map(q).join(', ')} FROM (${inPlace.sql}) AS ${q('hk_ranked')} WHERE ${inPlace.chosen})`
  const subject = `${table.model}.${duplicate.fields.join(', ')}`
  const head = clear
    ? `UPDATE ${base} SET ${duplicate.key.map((c) => `${q(c)} = NULL`).join(', ')}`
    : `DELETE FROM ${base}`
  const fix = {
    model: table.model,
    table,
    subject,
    kind: 'duplicates',
    inMigration: false,
    action: `duplicates: the ${duplicate.fix.keep} by ${duplicate.order.join(', ')} kept, the others ${clear ? 'set to NULL' : 'deleted'}`,
    count: `SELECT COUNT(*) AS ${q('count')} FROM (${rows.sql}) AS ${q('hk_ranked')} WHERE ${rows.chosen}`,
    statements: [`${head} WHERE ${target}`],
    parts: { head, table: base, where: target },
  }
  const withFix = { ...next.state, fixes: [...next.state.fixes, fix] }
  const chosenRows = `SELECT ${columns.join(', ')} FROM (${rows.sql}) AS ${q('hk_ranked')} WHERE ${rows.chosen}`
  return clear
    ? updated(context, withFix, key, chosenRows, duplicate.key, subject)
    : cascade(context, withFix, key, chosenRows, subject, [key])
}

/**
 * The rows whose foreign key points at no parent: their key cleared, or the rows deleted. The
 * parents are read as the fixes before this one leave them, so a parent a fix deletes makes orphans
 * of its children here.
 *
 * @example
 * ```sql
 * -- { orphans: 'null' } on Post.author
 * --   the plan
 * UPDATE "Post" AS "hk_child" SET "authorId" = NULL
 * WHERE "hk_child"."authorId" IS NOT NULL
 *   AND NOT EXISTS (SELECT 1 FROM "User" AS "hk_parent" WHERE "hk_parent"."id" = "hk_child"."authorId")
 * --   the check reads the parents as the fixes before it left them ("hk_fix_2"), not as they are
 * "hk_fix_4" AS (
 *   SELECT "hk_child"."id", CASE WHEN <orphan> THEN NULL ELSE "hk_child"."authorId" END AS "authorId"
 *   FROM "hk_fix_3" AS "hk_child"
 * )
 * -- orphans: 'delete' on MySQL names the alias twice: DELETE `hk_child` FROM `Post` AS `hk_child` WHERE ...
 * ```
 */
export function orphanStep(
  context: FixContext,
  state: FixState,
  entry: FixedTable,
  relation: FixedTable['resolved']['relations'][number],
): FixState {
  const { dialect, keyOf, q, current, version, listOf } = context
  const { table, actual } = entry
  const key = keyOf(table)
  const fk = relation.foreignKey
  const parentTable = { schema: fk.toSchema, table: fk.toTable }
  const from = current(state, key)
  const parentNow = current(state, keyOf(parentTable))
  const child = q('hk_child')
  const parent = q('hk_parent')
  const condition = (source: string) =>
    `${fk.fromColumns.map((c) => `${child}.${q(c)} IS NOT NULL`).join(' AND ')} AND NOT EXISTS (SELECT 1 FROM ${source} AS ${parent} WHERE ${fk.fromColumns
      .map((c, i) => `${parent}.${q(fk.toColumns[i] ?? c)} = ${child}.${q(c)}`)
      .join(' AND ')})`
  const simulated = condition(parentNow === '' ? qualifiedName(dialect, parentTable) : parentNow)
  const base = qualifiedName(dialect, table)
  // MySQL will not read the table an UPDATE or DELETE writes unless the read is materialised first.
  const parentInPlace =
    dialect === 'mysql'
      ? `(SELECT DISTINCT ${fk.toColumns.map(q).join(', ')} FROM ${qualifiedName(dialect, parentTable)})`
      : qualifiedName(dialect, parentTable)
  const inPlace = condition(parentInPlace)
  const clear = relation.orphans === 'null'
  const next = version(
    state,
    key,
    clear
      ? `SELECT ${actual.columns
          .map((c) =>
            fk.fromColumns.includes(c.name)
              ? `CASE WHEN ${simulated} THEN NULL ELSE ${child}.${q(c.name)} END AS ${q(c.name)}`
              : `${child}.${q(c.name)}`,
          )
          .join(', ')} FROM ${from} AS ${child}`
      : `SELECT ${listOf(
          actual.columns.map((c) => c.name),
          child,
        )} FROM ${from} AS ${child} WHERE (${simulated}) IS NOT TRUE`,
  )
  const subject = `${table.model}.${fk.field} → ${fk.toModel}`
  const fix = {
    model: table.model,
    table,
    subject,
    kind: 'orphans',
    inMigration: false,
    action: clear ? 'orphans set to NULL' : 'orphans deleted',
    count: `SELECT COUNT(*) AS ${q('count')} FROM ${from} AS ${child} WHERE ${simulated}`,
    statements: [
      clear
        ? `UPDATE ${base} AS ${child} SET ${fk.fromColumns.map((c) => `${q(c)} = NULL`).join(', ')} WHERE ${inPlace}`
        : dialect === 'mysql'
          ? `DELETE ${child} FROM ${base} AS ${child} WHERE ${inPlace}`
          : `DELETE FROM ${base} AS ${child} WHERE ${inPlace}`,
    ],
    // Over an alias, which MySQL's UPDATE and DELETE with a LIMIT do not take.
    parts: null,
  }
  const withFix = { ...next.state, fixes: [...next.state.fixes, fix] }
  const removed = `SELECT ${listOf(
    actual.columns.map((c) => c.name),
    child,
  )} FROM ${from} AS ${child} WHERE ${simulated}`
  return clear
    ? updated(context, withFix, key, removed, fk.fromColumns, subject)
    : cascade(context, withFix, key, removed, subject, [key])
}

/**
 * What the migration does with the rows of one table, after every fix before it: a column
 * converted by `convert`, an enum value mapped to a member the old type does not have (in the
 * cast on PostgreSQL, over a widened ENUM on MySQL), the rows already there of an added column
 * filled by `nulls`.
 *
 * @example
 * ```sql
 * -- { convert: { sql: 'CAST(NULLIF(TRIM("views"), \'\') AS INTEGER)' } } on Post.views: no statement
 * -- of the plan (the migration's own ALTER takes it, see `rewriteMigration`), and in the check
 * "hk_fix_3" AS (
 *   SELECT "id", CAST((CAST(NULLIF(TRIM("views"), '') AS INTEGER)) AS INTEGER) AS "views", "userCode"
 *   FROM "hk_fix_1"
 * )
 * -- { nulls: '' } on a column the migration adds
 * "hk_fix_5" AS (SELECT "id", "email", "name", "role", '' AS "bio" FROM "hk_fix_2")
 * ```
 */
export function migrationStep(
  context: FixContext,
  state: FixState,
  entry: FixedTable,
  /** The columns whose values move between tables, from `resolveMoves`. */
  moved: ReturnType<typeof resolveMoves>['moved'],
): FixState {
  const { dialect, keyOf, q, current, version } = context
  const { table, actual } = entry
  const key = keyOf(table)
  const from = current(state, key)
  const converted = entry.resolved.columns.filter((c) => !c.added && c.fix.convert !== undefined)
  const mappings = entry.resolved.columns.flatMap(({ column, fix, added }) => {
    if (added || column.kind !== 'enum' || dialect === 'sqlite') return []
    const existing = actual.columns.find((c) => c.name === column.column)?.enumValues ?? null
    if (existing === null) return []
    const late = Object.entries(fix.values ?? {}).flatMap(([stored, member]) => {
      const to = column.enumMembers?.find((m) => m.name === member)?.dbName ?? member
      return existing.includes(to) ? [] : [{ from: stored, to }]
    })
    return late.length === 0 ? [] : [{ column, existing, mapping: late }]
  })
  const fills = entry.resolved.columns.filter((c) => c.added && c.fix.nulls !== undefined)
  const movedIn = moved.filter((m) => !m.created && m.target === table)
  if (converted.length + mappings.length + fills.length + movedIn.length === 0) return state
  const read = (column: string) =>
    dialect === 'postgresql' ? `CAST(${q(column)} AS TEXT)` : q(column)
  const select = [
    ...actual.columns.map((c) => {
      const conversion = converted.find((each) => each.column.column === c.name)
      if (conversion !== undefined) {
        const sql = `(${conversion.fix.convert?.sql ?? q(c.name)})`
        const type = dialect === 'postgresql' ? postgresType(conversion.column) : null
        return `${type === null ? sql : `CAST(${sql} AS ${type})`} AS ${q(c.name)}`
      }
      const mapping = mappings.find((m) => m.column.column === c.name)
      if (mapping !== undefined) {
        return `CASE ${read(c.name)} ${mapping.mapping
          .map((m) => `WHEN ${stringLiteral(dialect, m.from)} THEN ${stringLiteral(dialect, m.to)}`)
          .join(' ')} ELSE ${read(c.name)} END AS ${q(c.name)}`
      }
      return q(c.name)
    }),
    ...fills.map(
      ({ column, fix }) => `${valueSql(dialect, column, fix.nulls ?? null)} AS ${q(column.column)}`,
    ),
    // The check has no table of kept values to read: the source's rows as the fixes leave them.
    ...movedIn.map(
      (m) =>
        `${m.valueFrom(`(SELECT ${m.kept} FROM ${current(state, keyOf(m.source))}) AS ${q('hk_move')}`)} AS ${q(m.column.column)}`,
    ),
  ]
  const next = version(state, key, `SELECT ${select.join(', ')} FROM ${from}`)
  const fixes = [
    ...converted.map(({ column, fix }) => ({
      model: table.model,
      table,
      subject: `${table.model}.${column.field}`,
      kind: 'convert',
      inMigration: true,
      action: `values converted by SQL ${fix.convert?.sql ?? ''}`,
      count: `SELECT COUNT(*) AS ${q('count')} FROM ${from} WHERE ${q(column.column)} IS NOT NULL`,
      statements: [],
      parts: null,
    })),
    ...mappings.map(({ column, mapping }) => ({
      model: table.model,
      table,
      subject: `${table.model}.${column.field}`,
      kind: 'values',
      inMigration: true,
      action: `values mapped by the migration: ${mapping.map((m) => `${m.from} → ${m.to}`).join(', ')}`,
      count: `SELECT COUNT(*) AS ${q('count')} FROM ${from} WHERE ${read(column.column)} IN (${mapping.map((m) => stringLiteral(dialect, m.from)).join(', ')})`,
      statements: [],
      parts: null,
    })),
    ...fills.map(({ column, fix }) => ({
      model: table.model,
      table,
      subject: `${table.model}.${column.field}`,
      kind: 'fill',
      inMigration: true,
      action: `added column filled with ${describe(fix.nulls ?? null)}`,
      count: `SELECT COUNT(*) AS ${q('count')} FROM ${from}`,
      statements: [],
      parts: null,
    })),
  ]
  return { ...next.state, fixes: [...next.state.fixes, ...fixes] }
}
