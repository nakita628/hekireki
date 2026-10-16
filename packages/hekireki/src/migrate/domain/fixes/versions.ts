import type { Dialect } from '../../../database/url.js'
import { qualifiedName, quoteIdentifier } from '../../../sql/index.js'
import type { makeExpectedTables } from '../tables.js'
import type { resolveTable } from './resolve-table.js'

/** A table the decisions fix, with what they ask of it resolved and free of errors. */
export type FixedTable = {
  readonly table: ReturnType<typeof makeExpectedTables>[number]
  readonly actual: FixContext['actual'][number]
  readonly resolved: ReturnType<typeof resolveTable>
}

/**
 * What every step of the fixes reads and writes through: the tables, and the versions of them the
 * steps make. A step never changes a table; it adds a CTE that selects the table's rows as the
 * step leaves them, and the steps after it read that one.
 */
export function makeFixContext(input: {
  readonly dialect: Dialect
  readonly expected: ReturnType<typeof makeExpectedTables>
  /** Every table of the database, to follow what a delete or a change does to the rows that point at it. */
  readonly actual: readonly {
    readonly schema: string | null
    readonly table: string
    readonly columns: readonly {
      readonly name: string
      readonly enumValues: readonly string[] | null
      /** A generated column, or an identity only the database may write. */
      readonly generated?: boolean
    }[]
    readonly uniques: readonly (readonly string[])[]
    readonly foreignKeys: readonly {
      readonly columns: readonly string[]
      readonly refSchema: string | null
      readonly refTable: string
      readonly refColumns: readonly string[]
      readonly onDelete: string
      readonly onUpdate: string
    }[]
  }[]
  readonly keyOf: (table: { readonly schema: string | null; readonly table: string }) => string
}) {
  const { dialect, keyOf } = input
  const q = (name: string) => quoteIdentifier(dialect, name)
  const actualByKey = new Map(input.actual.map((table) => [keyOf(table), table]))
  const expectedByKey = new Map(input.expected.map((table) => [keyOf(table), table]))

  /** A table as the steps see it, whether the schema has a model for it or not. */
  const versioned = (key: string) => {
    const expected = expectedByKey.get(key)
    const actual = actualByKey.get(key)
    if (actual === undefined) return null
    return {
      model: expected?.model ?? actual.table,
      schema: actual.schema,
      table: actual.table,
      columns: actual.columns.map((c) => c.name),
      primaryKey:
        expected?.primaryKey ?? actual.uniques[0] ?? actual.columns.slice(0, 1).map((c) => c.name),
    }
  }

  // Every foreign key of the database by the table it points at, read once: a delete or a change
  // of a table's rows is followed through them, and the steps ask for a table's many times over.
  const pointingAt = Map.groupBy(
    input.actual.flatMap((child) => child.foreignKeys.map((fk) => ({ child, fk }))),
    ({ fk }) => keyOf({ schema: fk.refSchema, table: fk.refTable }),
  )
  /**
   * The foreign keys into the table at `key`, in the order of the tables and of their keys, each
   * with the columns it references: its own, or the table's primary key where it names none. A
   * key that references more or fewer columns than it holds is left out.
   */
  const incoming = (key: string) => {
    const parent = versioned(key)
    if (parent === null) return []
    return (pointingAt.get(key) ?? [])
      .map(({ child, fk }) => ({
        child,
        fk,
        references: fk.refColumns.every((c) => c !== '') ? fk.refColumns : parent.primaryKey,
      }))
      .filter(({ fk, references }) => references.length === fk.columns.length)
  }

  const noCtes: readonly string[] = []
  /**
   * A fix: the table it writes to, what it does (for the report), the query that counts the rows
   * it changes as the steps before it leave the table, and the plan's statements for it, without
   * the trailing semicolon. `inMigration`: the migration makes it, and `migrate plan --migration`
   * writes it into Prisma's migration.
   */
  const noFixes: readonly {
    readonly model: string
    readonly table: { readonly schema: string | null; readonly table: string }
    readonly subject: string
    readonly kind: string
    readonly action: string
    readonly count: string
    readonly statements: readonly string[]
    readonly inMigration: boolean
    /**
     * The one statement of the fix in two halves, `${head} WHERE ${where}` over `table`, when it
     * is one the plan can run a batch of rows at a time; null for the others.
     */
    readonly parts: {
      readonly head: string
      readonly table: string
      readonly where: string
    } | null
  }[] = []
  /** What the database does on its own when a fix deletes or changes rows other tables point at. */
  const noEffects: readonly {
    readonly kind: string
    readonly severity: string
    readonly model: string
    readonly subject: string
    readonly what: string
    readonly hint: string
    readonly count: string
  }[] = []
  /** Every version of every changed table so far, as CTEs, with the fixes and effects that made them. */
  const empty = {
    versions: new Map<string, string>(),
    ctes: noCtes,
    fixes: noFixes,
    effects: noEffects,
    recursive: false,
    counter: 0,
  }
  const current = (state: typeof empty, key: string) => {
    const known = state.versions.get(key)
    if (known !== undefined) return known
    const table = versioned(key)
    return table === null ? '' : qualifiedName(dialect, table)
  }
  /**
   * A new version of a table: its rows as the step leaves them.
   *
   * @example
   * ```sql
   * -- the first step over "public"."User" becomes
   * "hk_fix_0" AS (SELECT "id", "email", COALESCE("name", 'unknown') AS "name" FROM "public"."User")
   * -- and `current` answers "hk_fix_0" for the table from then on, so the next step selects from it
   * ```
   */
  const version = (state: typeof empty, key: string, select: string) => {
    const name = q(`hk_fix_${state.counter}`)
    return {
      name,
      state: {
        ...state,
        counter: state.counter + 1,
        ctes: [...state.ctes, `${name} AS (${select})`],
        versions: new Map([...state.versions, [key, name]]),
      },
    }
  }
  const listOf = (columns: readonly string[], alias: string | null = null) =>
    columns.map((c) => (alias === null ? q(c) : `${alias}.${q(c)}`)).join(', ')
  const ref = q('hk_ref')
  const gone = q('hk_gone')

  return {
    dialect,
    keyOf,
    expected: input.expected,
    actual: input.actual,
    actualByKey,
    q,
    versioned,
    incoming,
    empty,
    current,
    version,
    listOf,
    ref,
    gone,
  }
}

export type FixContext = ReturnType<typeof makeFixContext>

/** Every version of every changed table so far, with the fixes and effects that made them. */
export type FixState = FixContext['empty']
