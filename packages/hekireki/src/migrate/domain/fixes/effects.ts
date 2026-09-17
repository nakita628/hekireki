import type { FixContext, FixState } from './versions.js'

/**
 * What the database does about the rows of `key` that `deleted` selects (every column of
 * them), through each foreign key into the table: refuse the delete, delete the rows that
 * point at them too, or clear their key. `path` stops a cascade that comes back around.
 *
 * @example
 * ```sql
 * -- duplicates of User.email are deleted, and Post.authorId is ON DELETE CASCADE: the next version
 * -- of Post is without the rows that point at a deleted user ("hk_gone" is the rows that go)
 * "hk_fix_3" AS (
 *   SELECT "hk_ref"."id", "hk_ref"."views", "hk_ref"."authorId" FROM "public"."Post" AS "hk_ref"
 *   WHERE ("hk_ref"."authorId" IS NOT NULL AND EXISTS (
 *     SELECT 1 FROM (...the deleted users...) AS "hk_gone" WHERE "hk_gone"."id" = "hk_ref"."authorId"
 *   )) IS NOT TRUE
 * )
 * -- ON DELETE SET NULL keeps the rows and clears the key instead:
 * --   CASE WHEN <pointing> THEN NULL ELSE "hk_ref"."authorId" END AS "authorId"
 * -- a table that points at itself is followed with a recursive CTE over its keys
 * ```
 */
export function cascade(
  context: FixContext,
  state: FixState,
  key: string,
  deleted: string,
  cause: string,
  path: readonly string[],
): FixState {
  const { keyOf, q, versioned, current, version, listOf, ref, gone } = context
  const parent = versioned(key)
  if (parent === null) return state
  const into = context.actual.flatMap((child) =>
    child.foreignKeys
      .filter((fk) => keyOf({ schema: fk.refSchema, table: fk.refTable }) === key)
      .map((fk) => ({ child, fk })),
  )
  // A table pointing at itself goes first: its cascade decides every row that goes.
  const ordered = [
    ...into.filter(({ child }) => keyOf(child) === key),
    ...into.filter(({ child }) => keyOf(child) !== key),
  ]
  const step = (
    acc: { readonly state: FixState; readonly deleted: string },
    { child, fk }: (typeof ordered)[number],
  ) => {
    const childKey = keyOf(child)
    const table = versioned(childKey)
    if (table === null) return acc
    const references = fk.refColumns.every((c) => c !== '') ? fk.refColumns : parent.primaryKey
    if (references.length !== fk.columns.length) return acc
    const source = current(acc.state, childKey)
    const match = (goneAlias: string) =>
      fk.columns
        .map((c, i) => `${goneAlias}.${q(references[i] ?? c)} = ${ref}.${q(c)}`)
        .join(' AND ')
    const pointing = `${fk.columns.map((c) => `${ref}.${q(c)} IS NOT NULL`).join(' AND ')} AND EXISTS (SELECT 1 FROM (${acc.deleted}) AS ${gone} WHERE ${match(gone)})`
    const subject = `${table.table}.${fk.columns.join(', ')} → ${cause}`
    const count = `SELECT COUNT(*) AS ${q('count')} FROM ${source} AS ${ref} WHERE ${pointing}`
    const rule = fk.onDelete
    if (rule === 'restrict' || rule === 'no action') {
      return {
        ...acc,
        state: {
          ...acc.state,
          effects: [
            ...acc.state.effects,
            {
              kind: 'delete-refused',
              severity: 'blocking',
              model: table.table,
              subject,
              what: `its foreign key refuses the delete (ON DELETE ${rule.toUpperCase()})`,
              hint: `These rows point at rows the fix deletes, and the database will not let them go: settle them first (a fix on ${table.table}, or delete them), or keep the rows.`,
              count,
            },
          ],
        },
      }
    }
    if (rule === 'set default') {
      return {
        ...acc,
        state: {
          ...acc.state,
          effects: [
            ...acc.state.effects,
            {
              kind: 'delete-cascades',
              severity: 'warning',
              model: table.table,
              subject,
              what: 'ON DELETE SET DEFAULT resets the key, which the checks do not follow',
              hint: 'The database sets these keys to their default: check the rows after the plan.',
              count,
            },
          ],
        },
      }
    }
    const effect = {
      kind: 'delete-cascades',
      severity: 'warning',
      model: table.table,
      subject,
      what:
        rule === 'cascade'
          ? 'ON DELETE CASCADE deletes them too'
          : 'ON DELETE SET NULL clears their key',
      hint: 'The database changes these rows as well; the checks read them as it leaves them.',
      count,
    }
    if (rule === 'set null') {
      const next = version(
        acc.state,
        childKey,
        `SELECT ${table.columns
          .map((c) =>
            fk.columns.includes(c)
              ? `CASE WHEN ${pointing} THEN NULL ELSE ${ref}.${q(c)} END AS ${q(c)}`
              : `${ref}.${q(c)}`,
          )
          .join(', ')} FROM ${source} AS ${ref}`,
      )
      return {
        ...acc,
        state: { ...next.state, effects: [...next.state.effects, effect] },
      }
    }
    if (childKey === key) {
      // Every row that points at a deleted row goes, and every row that points at those:
      // a recursive CTE over the keys, the deleted rows its seed.
      const keys = [...new Set([...table.primaryKey, ...references])]
      const closure = q(`hk_fix_${acc.state.counter}`)
      const identity = table.primaryKey.map((c) => `${gone}.${q(c)} = ${ref}.${q(c)}`).join(' AND ')
      const recursive = {
        ...acc.state,
        counter: acc.state.counter + 1,
        recursive: true,
        ctes: [
          ...acc.state.ctes,
          `${closure} AS (SELECT ${listOf(keys, q('hk_seed'))} FROM (${acc.deleted}) AS ${q('hk_seed')} UNION SELECT ${listOf(keys, ref)} FROM ${source} AS ${ref} JOIN ${closure} AS ${gone} ON ${match(gone)})`,
        ],
      }
      const cascaded = `EXISTS (SELECT 1 FROM ${closure} AS ${gone} WHERE ${identity})`
      const next = version(
        recursive,
        childKey,
        `SELECT ${listOf(table.columns, ref)} FROM ${source} AS ${ref} WHERE NOT ${cascaded}`,
      )
      return {
        deleted: `SELECT ${listOf(keys)} FROM ${closure}`,
        state: {
          ...next.state,
          effects: [
            ...next.state.effects,
            {
              ...effect,
              count: `SELECT COUNT(*) AS ${q('count')} FROM ${source} AS ${ref} WHERE ${cascaded}`,
            },
          ],
        },
      }
    }
    const removed = `SELECT ${listOf(table.columns, ref)} FROM ${source} AS ${ref} WHERE ${pointing}`
    const next = version(
      acc.state,
      childKey,
      `SELECT ${listOf(table.columns, ref)} FROM ${source} AS ${ref} WHERE (${pointing}) IS NOT TRUE`,
    )
    const affected = { ...next.state, effects: [...next.state.effects, effect] }
    if (path.includes(childKey)) {
      return {
        ...acc,
        state: {
          ...affected,
          effects: [
            ...affected.effects,
            {
              kind: 'delete-cascades',
              severity: 'warning',
              model: table.table,
              subject,
              what: 'the cascade comes back to a table it went through, and the checks stop following it there',
              hint: 'The database follows a cycle of ON DELETE CASCADE to the end: check the rows after the plan.',
              count,
            },
          ],
        },
      }
    }
    return {
      ...acc,
      state: cascade(context, affected, childKey, removed, subject, [...path, childKey]),
    }
  }
  return ordered.reduce(step, { state, deleted }).state
}

/**
 * A fix that changes the values of columns other tables point at: the database refuses the
 * change (ON UPDATE RESTRICT or NO ACTION), or follows it (CASCADE gives the rows pointing at a
 * changed row its new key, SET NULL clears theirs), and on down the tables that point at those.
 * Each changed row is paired with what it becomes by its primary key; a fix that changes the
 * primary key itself leaves the cascade counted but not followed. MySQL acts as RESTRICT where
 * a cascade comes back to a table it has changed, a table pointing at itself included.
 *
 * @example
 * ```sql
 * -- the duplicates of User.code are set to NULL, and Post.userCode is ON UPDATE SET NULL: the next
 * -- version of Post has the key of the rows that pointed at a changed user cleared
 * "hk_fix_1" AS (
 *   SELECT "hk_ref"."id", "hk_ref"."views",
 *     CASE WHEN EXISTS (
 *       SELECT 1 FROM (...the changed users, as they were...) AS "hk_gone"
 *       WHERE "hk_gone"."code" = "hk_ref"."userCode"
 *     ) THEN NULL ELSE "hk_ref"."userCode" END AS "userCode"
 *   FROM "public"."Post" AS "hk_ref"
 * )
 * -- ON UPDATE CASCADE reads the new key of the row in place of NULL, joined by the primary key
 * ```
 */
export function updated(
  context: FixContext,
  state: FixState,
  key: string,
  changed: string,
  columns: readonly string[],
  cause: string,
  path: readonly string[] = [key],
): FixState {
  const { dialect, keyOf, q, versioned, current, version, listOf, ref, gone } = context
  const parent = versioned(key)
  if (parent === null) return state
  // What the changed rows are now, before any cascade runs into the same table.
  const after = current(state, key)
  const into = context.actual.flatMap((child) =>
    child.foreignKeys
      .map((fk) => ({
        child,
        fk,
        references: fk.refColumns.every((c) => c !== '') ? fk.refColumns : parent.primaryKey,
      }))
      .filter(
        ({ fk, references }) =>
          keyOf({ schema: fk.refSchema, table: fk.refTable }) === key &&
          references.length === fk.columns.length &&
          references.some((c) => columns.includes(c)),
      ),
  )
  const step = (acc: FixState, { child, fk, references }: (typeof into)[number]): FixState => {
    const childKey = keyOf(child)
    const table = versioned(childKey)
    if (table === null) return acc
    const source = current(acc, childKey)
    const match = fk.columns
      .map((c, i) => `${gone}.${q(references[i] ?? c)} = ${ref}.${q(c)}`)
      .join(' AND ')
    const pointing = `EXISTS (SELECT 1 FROM (${changed}) AS ${gone} WHERE ${match})`
    const subject = `${child.table}.${fk.columns.join(', ')} → ${cause}`
    const count = `SELECT COUNT(*) AS ${q('count')} FROM ${source} AS ${ref} WHERE ${pointing}`
    const rule = fk.onUpdate
    const follows = rule === 'cascade' || rule === 'set null'
    const effectOf = (value: {
      readonly kind: 'update-refused' | 'update-cascades'
      readonly what: string
      readonly hint: string
    }) => ({
      ...value,
      severity: value.kind === 'update-refused' ? 'blocking' : 'warning',
      model: child.table,
      subject,
      count,
    })
    if (rule === 'restrict' || rule === 'no action') {
      return {
        ...acc,
        effects: [
          ...acc.effects,
          effectOf({
            kind: 'update-refused',
            what: `its foreign key refuses the change (ON UPDATE ${rule.toUpperCase()})`,
            hint: 'These rows point at values the fix changes, and the database will not let them change: settle them first, or leave the values.',
          }),
        ],
      }
    }
    if (follows && dialect === 'mysql' && path.includes(childKey)) {
      return {
        ...acc,
        effects: [
          ...acc.effects,
          effectOf({
            kind: 'update-refused',
            what: `ON UPDATE ${rule.toUpperCase()} comes back to a table the change has been through, which MySQL refuses as RESTRICT`,
            hint: 'MySQL does not follow an ON UPDATE cascade into a table it has changed: settle these rows first, or leave the values.',
          }),
        ],
      }
    }
    const byPrimaryKey = parent.primaryKey.every((c) => !columns.includes(c))
    if (
      !follows ||
      (rule === 'cascade' && !byPrimaryKey) ||
      (path.includes(childKey) && childKey !== key)
    ) {
      return {
        ...acc,
        effects: [
          ...acc.effects,
          effectOf({
            kind: 'update-cascades',
            what: follows
              ? `ON UPDATE ${rule.toUpperCase()} follows the change, which the checks do not follow here`
              : `ON UPDATE ${rule.toUpperCase()} resets the key, which the checks do not follow`,
            hint: 'The database changes these rows as well: check them after the plan.',
          }),
        ],
      }
    }
    const renewed = q('hk_new')
    const valueOf = (index: number) =>
      rule === 'set null'
        ? 'NULL'
        : `(SELECT ${renewed}.${q(references[index] ?? '')} FROM (${changed}) AS ${gone} JOIN ${after} AS ${renewed} ON ${parent.primaryKey
            .map((c) => `${renewed}.${q(c)} = ${gone}.${q(c)}`)
            .join(' AND ')} WHERE ${match})`
    const next = version(
      acc,
      childKey,
      `SELECT ${table.columns
        .map((c) => {
          const index = fk.columns.indexOf(c)
          return index === -1
            ? `${ref}.${q(c)}`
            : `CASE WHEN ${pointing} THEN ${valueOf(index)} ELSE ${ref}.${q(c)} END AS ${q(c)}`
        })
        .join(', ')} FROM ${source} AS ${ref}`,
    )
    const effect = effectOf({
      kind: 'update-cascades',
      what:
        rule === 'cascade'
          ? 'ON UPDATE CASCADE gives them the new key'
          : 'ON UPDATE SET NULL clears their key',
      hint: 'The database changes these rows as well; the checks read them as it leaves them.',
    })
    // The rows that pointed at a changed row, as they were: their key changes in turn.
    const pointed = `SELECT ${listOf(table.columns, ref)} FROM ${source} AS ${ref} WHERE ${pointing}`
    return updated(
      context,
      { ...next.state, effects: [...next.state.effects, effect] },
      childKey,
      pointed,
      fk.columns,
      subject,
      [...path, childKey],
    )
  }
  return into.reduce(step, state)
}
