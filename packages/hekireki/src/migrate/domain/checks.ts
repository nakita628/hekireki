import type { Dialect } from '../../database/url.js'
import { placeholder, qualifiedName, quoteIdentifier } from '../../sql/index.js'
import { makeConversions } from './conversion.js'
import type { ModelFixes } from './decisions.js'
import { resolveFixes } from './fixes/index.js'
import type { makeExpectedTables } from './tables.js'

/**
 * The head of every count query: the count comes back under one name, whatever the dialect.
 *
 * @example
 * ```sql
 * SELECT COUNT(*) AS "count"
 * ```
 */
function selectCount(dialect: Dialect) {
  return `SELECT COUNT(*) AS ${quoteIdentifier(dialect, 'count')}`
}

/**
 * Every row of a table: what a required column added with no default has to be filled for.
 *
 * @example
 * ```sql
 * SELECT COUNT(*) AS "count" FROM "User"
 * ```
 */
function countRows(dialect: Dialect, from: string) {
  return { sql: `${selectCount(dialect)} FROM ${from}`, params: [] }
}

/**
 * The rows a condition holds for: the NULLs of a column turning required, the values a new
 * type refuses.
 *
 * @example
 * ```sql
 * SELECT COUNT(*) AS "count" FROM "User" WHERE "name" IS NULL
 * ```
 */
function countWhere(dialect: Dialect, from: string, condition: string) {
  return {
    sql: `${selectCount(dialect)} FROM ${from} WHERE ${condition}`,
    params: [],
  }
}

/**
 * The groups of rows that share a value of the columns; a row with a NULL in them shares nothing.
 *
 * @example
 * ```sql
 * SELECT COUNT(*) AS "count" FROM (
 *   SELECT 1 AS "one" FROM "User" WHERE "email" IS NOT NULL GROUP BY "email" HAVING COUNT(*) > 1
 * ) AS "duplicates"
 * ```
 */
function countDuplicates(dialect: Dialect, from: string, columns: readonly string[]) {
  const quoted = columns.map((column) => quoteIdentifier(dialect, column))
  const notNull = quoted.map((column) => `${column} IS NOT NULL`).join(' AND ')
  return {
    sql: `${selectCount(dialect)} FROM (SELECT 1 AS ${quoteIdentifier(dialect, 'one')} FROM ${from} WHERE ${notNull} GROUP BY ${quoted.join(', ')} HAVING COUNT(*) > 1) AS ${quoteIdentifier(dialect, 'duplicates')}`,
    params: [],
  }
}

/**
 * The rows whose value is none of the enum's; read as text, so a PostgreSQL enum of other labels
 * compares. The members are bound, not written in: `$1, $2` on PostgreSQL, `?, ?` elsewhere.
 *
 * @example
 * ```sql
 * -- params: ['ADMIN', 'VIEWER']
 * SELECT COUNT(*) AS "count" FROM "User" WHERE "role" IS NOT NULL AND "role"::text NOT IN ($1, $2)
 * ```
 */
function countOutsideEnum(
  dialect: Dialect,
  from: string,
  column: string,
  values: readonly string[],
) {
  const quoted = quoteIdentifier(dialect, column)
  const read = dialect === 'postgresql' ? `${quoted}::text` : quoted
  const list = values.map((_, index) => placeholder(dialect, index + 1)).join(', ')
  return {
    sql: `${selectCount(dialect)} FROM ${from} WHERE ${quoted} IS NOT NULL AND ${read} NOT IN (${list})`,
    params: [...values],
  }
}

/**
 * The rows whose key is set and points at no row of the parent table.
 *
 * @example
 * ```sql
 * SELECT COUNT(*) AS "count" FROM "Post" AS "child"
 * WHERE "child"."authorId" IS NOT NULL
 *   AND NOT EXISTS (SELECT 1 FROM "User" AS "parent" WHERE "parent"."id" = "child"."authorId")
 * ```
 */
function countOrphans(
  dialect: Dialect,
  from: string,
  /** Where the parent's rows are read from. */
  target: string,
  foreignKey: {
    readonly fromColumns: readonly string[]
    readonly toSchema: string | null
    readonly toTable: string
    readonly toColumns: readonly string[]
  },
) {
  const child = quoteIdentifier(dialect, 'child')
  const parent = quoteIdentifier(dialect, 'parent')
  const notNull = foreignKey.fromColumns
    .map((column) => `${child}.${quoteIdentifier(dialect, column)} IS NOT NULL`)
    .join(' AND ')
  const match = foreignKey.fromColumns
    .map(
      (column, index) =>
        `${parent}.${quoteIdentifier(dialect, foreignKey.toColumns[index] ?? column)} = ${child}.${quoteIdentifier(dialect, column)}`,
    )
    .join(' AND ')
  return {
    sql: `${selectCount(dialect)} FROM ${from} AS ${child} WHERE ${notNull} AND NOT EXISTS (SELECT 1 FROM ${target} AS ${parent} WHERE ${match})`,
    params: [],
  }
}

function pairs(from: readonly string[], to: readonly string[]) {
  return from
    .map((column, index) => `${column}=${to[index] ?? ''}`)
    .toSorted()
    .join(' ')
}

/** The table with the columns a fill gives the rows already there, as the migration will add them. */
function withFilled<T extends { readonly columns: readonly { readonly name: string }[] }>(
  table: T,
  filled: readonly string[],
) {
  const virtual = filled.map((name) => ({
    name,
    nullable: true,
    dataType: '',
    columnType: null,
    maxLength: null,
    precision: null,
    scale: null,
    datetimePrecision: null,
    enumValues: null,
  }))
  return filled.length === 0 ? table : { ...table, columns: [...table.columns, ...virtual] }
}

/** The expected table under the names its columns have now, renames undone. */
function renamedTable<
  T extends {
    readonly schema: unknown
    readonly table: string
    readonly primaryKey: readonly string[]
    readonly columns: readonly { readonly column: string }[]
    readonly uniques: readonly { readonly columns: readonly string[] }[]
    readonly foreignKeys: readonly {
      readonly fromColumns: readonly string[]
      readonly toSchema: string | null
      readonly toTable: string
      readonly toColumns: readonly string[]
    }[]
  },
>(
  table: T,
  keyOf: (table: { readonly schema: string | null; readonly table: string }) => string,
  nameNow: (key: string, column: string) => string,
) {
  const key = keyOf({
    schema: typeof table.schema === 'string' ? table.schema : null,
    table: table.table,
  })
  const now = (column: string) => nameNow(key, column)
  return {
    ...table,
    primaryKey: table.primaryKey.map(now),
    columns: table.columns.map((column) => ({ ...column, column: now(column.column) })),
    uniques: table.uniques.map((unique) => ({ ...unique, columns: unique.columns.map(now) })),
    foreignKeys: table.foreignKeys.map((fk) => ({
      ...fk,
      fromColumns: fk.fromColumns.map(now),
      toColumns: fk.toColumns.map((column) =>
        nameNow(keyOf({ schema: fk.toSchema, table: fk.toTable }), column),
      ),
    })),
  }
}

/** A renamed column whose type PostgreSQL cannot cast: the rename changes the type in place, and fails. */
function withoutCast<
  C extends {
    readonly kind: string
    readonly what: string
  },
>(conversion: C, type: string) {
  return {
    ...conversion,
    severity: 'blocking' as const,
    what: `renamed column with no cast to ${type}`,
    unit: 'row',
    hint: 'PostgreSQL cannot change the type of the column in place: give the field convert to say how each value becomes the new type.',
    condition: null,
  }
}

/**
 * The checks for a schema against the database as it is now. A table both have is checked
 * column by column and constraint by constraint; a table only the database has is checked for
 * the rows that go with it; a table only the schema has is listed in `added`, as it has no rows
 * to check until it exists.
 *
 * Each check is one question asked of the data, as a count query: the rows that stop the
 * migration (`blocking`: Prisma Migrate fails on them, or a constraint would) or lose something
 * in it (`warning`). `guaranteed`: a constraint the database already has rules those rows out, so
 * the query need not run. `unit` is what the count counts, singular.
 *
 * @example
 * ```sql
 * -- with no decisions, a check counts the table as it is:
 * SELECT COUNT(*) AS "count" FROM "User" WHERE "name" IS NULL
 *
 * -- with a decision that fills the NULLs, the same check reads the table as the fix leaves it:
 * WITH "hk_fix_0" AS (SELECT "id", "email", COALESCE("name", 'unknown') AS "name" FROM "public"."User")
 * SELECT COUNT(*) AS "count" FROM "hk_fix_0" WHERE "name" IS NULL
 * ```
 */
export function makeChecks(input: {
  readonly dialect: Dialect
  readonly expected: ReturnType<typeof makeExpectedTables>
  readonly actual: readonly {
    readonly schema: string | null
    readonly table: string
    readonly columns: readonly {
      readonly name: string
      readonly nullable: boolean
      readonly dataType: string
      readonly columnType: string | null
      readonly maxLength: number | null
      readonly precision: number | null
      readonly scale: number | null
      readonly datetimePrecision: number | null
      readonly enumValues: readonly string[] | null
      /** A generated column, or an identity only the database may write. */
      readonly generated?: boolean
    }[]
    /** The triggers of the table: what a write to it sets off, which no check follows. */
    readonly triggers?: readonly string[]
    /** The CHECK constraints the table has now, each as the expression the database evaluates. */
    readonly checks?: readonly { readonly name: string; readonly clause: string }[]
    readonly uniques: readonly (readonly string[])[]
    readonly foreignKeys: readonly {
      readonly columns: readonly string[]
      readonly refSchema: string | null
      readonly refTable: string
      readonly refColumns: readonly string[]
      readonly enforced: boolean
      readonly onDelete: string
      readonly onUpdate: string
    }[]
  }[]
  /** The schema an unqualified model lives in on PostgreSQL; null elsewhere. */
  readonly defaultSchema: string | null
  /** The MySQL server is MariaDB. */
  readonly mariadb: boolean
  /** The schema's provider is CockroachDB, reached as PostgreSQL. */
  readonly cockroach?: boolean
  /** The fixes the decisions of the Migrate page make; the checks count what they leave. */
  readonly fixes?: Readonly<Record<string, ModelFixes>>
}) {
  const { dialect } = input
  // MySQL with lower_case_table_names reports `user` for the `User` a model names.
  const keyOf = (table: { readonly schema: string | null; readonly table: string }) => {
    const key = `${table.schema ?? input.defaultSchema ?? ''}.${table.table}`
    return dialect === 'mysql' ? key.toLowerCase() : key
  }
  const rawByKey = new Map(input.actual.map((table) => [keyOf(table), table]))
  const fieldFix = (model: string, field: string) => input.fixes?.[model]?.fields?.[field]

  // A field with `renamedFrom` is read under the name its column has now: the migration renames
  // the column, so its values carry over rather than being dropped with it.
  const renameRequests = input.expected.flatMap((table) =>
    table.columns.flatMap((column) => {
      const from = fieldFix(table.model, column.field)?.renamedFrom
      return from === undefined ? [] : [{ table, field: column.field, from, to: column.column }]
    }),
  )
  const renameErrors = renameRequests.flatMap(({ table, field, from, to }) => {
    const path = `${table.model}.${field}`
    const actual = rawByKey.get(keyOf(table))
    if (actual === undefined) {
      return [`${path}: the migration creates ${table.table}; there is no column to rename.`]
    }
    if (!actual.columns.some((c) => c.name === from)) {
      return [`${path}: ${table.table} has no column ${from}.`]
    }
    return actual.columns.some((c) => c.name === to)
      ? [`${path}: ${table.table} already has a column ${to}; there is nothing to rename.`]
      : []
  })
  const renames = renameErrors.length === 0 ? renameRequests : []
  const nameNow = (key: string, column: string) =>
    renames.find((r) => keyOf(r.table) === key && r.to === column)?.from ?? column
  const expected = input.expected.map((table) => renamedTable(table, keyOf, nameNow))

  const expectedKeys = new Set(expected.map(keyOf))
  const conversionsOf = (table: (typeof expected)[number], column: string) => {
    const existing = rawByKey.get(keyOf(table))?.columns.find((c) => c.name === column)
    const found = table.columns.find((c) => c.column === column)
    if (existing === undefined || found === undefined) return []
    const all = makeConversions({
      dialect,
      mariadb: input.mariadb,
      cockroach: input.cockroach ?? false,
      column: found,
      existing,
    })
    const fix = fieldFix(table.model, found.field)
    // `convert` says how each value becomes the new type: on PostgreSQL the check casts what it
    // gives, so a value that does not convert fails there; elsewhere the values are converted
    // before the column changes, so what the new type refuses of them still counts.
    if (fix?.convert !== undefined) {
      return dialect === 'postgresql' ? [] : all.filter((c) => c.kind !== 'column-type')
    }
    // A renamed column changes its type in place, and PostgreSQL has no cast for this change.
    return fix?.renamedFrom !== undefined && dialect === 'postgresql'
      ? all.map((c) => (c.kind === 'column-recreated' ? withoutCast(c, found.type) : c))
      : all
  }
  const fixes = resolveFixes({
    dialect,
    expected,
    actual: input.actual,
    keyOf,
    conversionsOf,
    models: input.fixes,
  })
  // A column the migration adds and a fill gives the rows already there reads as one the table has.
  const actualByKey = new Map(
    input.actual.map((table) => [
      keyOf(table),
      withFilled(table, fixes.filled.get(keyOf(table)) ?? []),
    ]),
  )
  /** A fixed table is read as the fixes leave it; every other table as it is. */
  const source = (table: { readonly schema: string | null; readonly table: string }) =>
    fixes.sources.get(keyOf(table)) ?? qualifiedName(dialect, table)
  const fixed = (table: { readonly schema: string | null; readonly table: string }) =>
    fixes.sources.has(keyOf(table))
  /** The statement as the check runs it: after the CTEs of the fixes, when there are any. */
  const withFixes = (statement: { readonly sql: string; readonly params: readonly unknown[] }) => ({
    sql: `${fixes.with}${statement.sql}`,
    params: statement.params,
  })

  const tableChecks = (
    wanted: (typeof input.expected)[number],
    actual: (typeof input.actual)[number],
  ) => {
    const find = (column: string) => actual.columns.find((c) => c.name === column)
    const has = (column: string) => find(column) !== undefined
    const from = source(wanted)
    const trusted = !fixed(wanted)
    const conversions = new Map(
      wanted.columns.flatMap((column) => {
        const found = conversionsOf(wanted, column.column)
        return found.length === 0 ? [] : [[column.column, found] as const]
      }),
    )
    // A column PostgreSQL drops and adds again keeps none of its values, so nothing is asked of them.
    const recreated = new Set(
      [...conversions]
        .filter(([, found]) => found.some((conversion) => conversion.kind === 'column-recreated'))
        .map(([column]) => column),
    )
    const columns = wanted.columns.flatMap((column) => {
      const subject = `${wanted.model}.${column.field}`
      const existing = find(column.column)
      if (existing === undefined) {
        if (!column.required || column.databaseDefault) return []
        return [
          {
            kind: 'column-added',
            severity: 'blocking',
            model: wanted.model,
            subject,
            what: 'required column added without a database default',
            unit: 'row',
            hint:
              dialect === 'mysql'
                ? "MySQL fills the rows already there with '', 0, the first enum member or a zero date, not a value Prisma Client would write: give the field a @default the database fills (not uuid(), cuid(), nanoid(), ulid() or @updatedAt), or add it optional, fill it, then make it required; filling them on the Migrate page of hekireki studio does it in the migration."
                : 'The database has no value for the rows already there: give the field a @default the database fills (not uuid(), cuid(), nanoid(), ulid() or @updatedAt), or add it optional, fill it, then make it required; filling them on the Migrate page of hekireki studio does it in the migration.',
            guaranteed: false,
            statement: withFixes(countRows(dialect, from)),
          },
        ]
      }
      const found = conversions.get(column.column) ?? []
      const conversionChecks = found.map((conversion) => ({
        kind: conversion.kind,
        severity: conversion.severity,
        model: wanted.model,
        subject,
        what: conversion.what,
        unit: conversion.unit,
        hint: conversion.hint,
        guaranteed: false,
        statement: withFixes(
          conversion.condition === null
            ? countRows(dialect, from)
            : countWhere(dialect, from, conversion.condition),
        ),
        // A column dropped and added again keeps none of its values: the rows that hold one.
        lost:
          conversion.kind === 'column-recreated'
            ? `SELECT * FROM ${qualifiedName(dialect, actual)} WHERE ${quoteIdentifier(dialect, column.column)} IS NOT NULL`
            : null,
      }))
      if (recreated.has(column.column)) return conversionChecks
      const notNull = column.required
        ? [
            {
              kind: 'not-null',
              severity: 'blocking',
              model: wanted.model,
              subject,
              what: existing.nullable ? 'column becomes NOT NULL' : 'NOT NULL',
              unit: 'NULL row',
              hint: 'Fill the NULLs before the column becomes NOT NULL, or say what fills them on the Migrate page of hekireki studio; a @default does not fill rows already there.',
              guaranteed: trusted && !existing.nullable,
              statement: withFixes(
                countWhere(dialect, from, `${quoteIdentifier(dialect, column.column)} IS NULL`),
              ),
            },
          ]
        : []
      const allowed = column.enumValues ?? []
      const members =
        column.kind === 'enum' && !column.isList && allowed.length > 0
          ? [
              {
                kind: 'enum',
                severity: 'blocking',
                model: wanted.model,
                subject,
                what: `values outside enum ${column.type}`,
                unit: 'row',
                hint: 'Move the rows to a member that stays before the enum changes, or say what each stored value becomes on the Migrate page of hekireki studio.',
                guaranteed:
                  trusted &&
                  (existing.enumValues?.every((value) => allowed.includes(value)) ?? false),
                statement: withFixes(countOutsideEnum(dialect, from, column.column, allowed)),
              },
            ]
          : []
      return [...notNull, ...conversionChecks, ...members]
    })
    const uniques = wanted.uniques
      .filter(
        (unique) =>
          unique.columns.every(has) && !unique.columns.some((column) => recreated.has(column)),
      )
      .map((unique) => ({
        kind: 'unique',
        severity: 'blocking',
        model: wanted.model,
        subject: `${wanted.model}.${unique.fields.join(', ')}`,
        what: unique.fields.length === 1 ? 'unique' : 'unique together',
        unit: 'duplicate group',
        hint: 'Merge or remove the duplicates before the constraint is created, or say which to keep on the Migrate page of hekireki studio.',
        // A unique key over some of the columns makes every wider set unique too.
        guaranteed:
          trusted &&
          actual.uniques.some(
            (existing) =>
              existing.length > 0 && existing.every((column) => unique.columns.includes(column)),
          ),
        statement: withFixes(countDuplicates(dialect, from, unique.columns)),
      }))
    const foreignKeys = wanted.foreignKeys
      .filter((foreignKey) => {
        const target = actualByKey.get(
          keyOf({ schema: foreignKey.toSchema, table: foreignKey.toTable }),
        )
        return (
          target !== undefined &&
          foreignKey.fromColumns.every(has) &&
          !foreignKey.fromColumns.some((column) => recreated.has(column)) &&
          foreignKey.toColumns.every((column) => target.columns.some((c) => c.name === column))
        )
      })
      .map((foreignKey) => ({
        kind: 'foreign-key',
        severity: 'blocking',
        model: wanted.model,
        subject: `${wanted.model}.${foreignKey.field} → ${foreignKey.toModel}`,
        what: 'foreign key',
        unit: 'orphan row',
        hint: `Delete the orphans, set them to NULL, or point them at a ${foreignKey.toModel} that exists; the Migrate page of hekireki studio does the first two.`,
        guaranteed:
          trusted &&
          !fixed({ schema: foreignKey.toSchema, table: foreignKey.toTable }) &&
          actual.foreignKeys.some(
            (existing) =>
              existing.enforced &&
              keyOf({ schema: existing.refSchema, table: existing.refTable }) ===
                keyOf({ schema: foreignKey.toSchema, table: foreignKey.toTable }) &&
              pairs(existing.columns, existing.refColumns) ===
                pairs(foreignKey.fromColumns, foreignKey.toColumns),
          ),
        statement: withFixes(
          countOrphans(
            dialect,
            from,
            source({ schema: foreignKey.toSchema, table: foreignKey.toTable }),
            foreignKey,
          ),
        ),
      }))
    // A column whose values move to another table is not dropped with them, as a renamed one is not.
    const dropped = actual.columns
      .filter(
        (column) =>
          !wanted.columns.some((c) => c.column === column.name) &&
          !fixes.moved.some((m) => m.key === keyOf(actual) && m.column === column.name),
      )
      .map((column) => ({
        kind: 'column-dropped',
        severity: 'warning',
        model: wanted.model,
        subject: `${wanted.model}.${column.name}`,
        what: 'column dropped',
        unit: 'value',
        hint: 'A renamed field reads as a drop and an add, and so does one moved to a related model: keep the column with @map, or name the field it became on the Migrate page of hekireki studio.',
        guaranteed: false,
        statement: withFixes(
          countWhere(dialect, from, `${quoteIdentifier(dialect, column.name)} IS NOT NULL`),
        ),
        /** The rows as they are now, with the values the column takes with it. */
        lost: `SELECT * FROM ${qualifiedName(dialect, actual)} WHERE ${quoteIdentifier(dialect, column.name)} IS NOT NULL`,
      }))
    return [...columns, ...uniques, ...foreignKeys, ...dropped]
  }

  const present = expected.flatMap((table) => {
    const actual = actualByKey.get(keyOf(table))
    return actual === undefined ? [] : tableChecks(table, actual)
  })
  const dropped = input.actual
    .filter((table) => !expectedKeys.has(keyOf(table)))
    .map((table) => ({
      kind: 'table-dropped',
      severity: 'warning',
      model: table.table,
      subject: table.table,
      what: 'table dropped',
      unit: 'row',
      hint: 'A renamed model reads as a drop and an add: keep the table with @@map, or copy the rows over first.',
      guaranteed: false,
      statement: countRows(dialect, qualifiedName(dialect, table)),
      /** Every row the table takes with it. */
      lost: `SELECT * FROM ${qualifiedName(dialect, table)}`,
    }))
  const added = expected
    .filter((table) => !actualByKey.has(keyOf(table)))
    .map((table) => table.model)
  // What Prisma's schema does not describe, on the tables the fixes or their cascades write to.
  const written = input.actual.filter((table) => fixes.sources.has(keyOf(table)))
  // A CHECK constraint is asked about every row a fix writes: the rows as the fixes leave them,
  // before the migration changes any column, that the expression is false for. A fix that would
  // be refused is found here rather than half way through the plan.
  const constraints = written
    // A table only the migration changes has no fix to ask about: its rows pass the constraint now.
    .filter((table) => fixes.sourcesBeforeMigration.has(keyOf(table)))
    .flatMap((table) =>
      (table.checks ?? []).map((constraint) => ({
        kind: 'check-constraint',
        severity: 'blocking',
        model: expected.find((one) => keyOf(one) === keyOf(table))?.model ?? table.table,
        subject: `${table.table} ${constraint.name}`,
        what: `the fixes leave rows the CHECK constraint refuses: ${constraint.clause}`,
        unit: 'row',
        hint: 'The database refuses the statement of the fix that writes such a row, and the plan stops there: choose a value the constraint takes, or settle these rows first.',
        guaranteed: false,
        statement: withFixes({
          sql: `${selectCount(dialect)} FROM ${fixes.sourcesBeforeMigration.get(keyOf(table)) ?? qualifiedName(dialect, table)} WHERE NOT (${constraint.clause})`,
          params: [],
        }),
      })),
    )
  // The constraint outlives the migration on PostgreSQL and MySQL (an ALTER TABLE keeps it), and
  // is asked again of what the migration makes of the rows: a value converted, an enum value
  // mapped, an added column filled. Only where the migration changes the rows of the table, which
  // is where the two readings differ. SQLite makes the table again without the constraint.
  const afterMigration =
    dialect === 'sqlite'
      ? []
      : written
          .filter(
            (table) =>
              fixes.sources.get(keyOf(table)) !== fixes.sourcesBeforeMigration.get(keyOf(table)),
          )
          .flatMap((table) =>
            (table.checks ?? []).map((constraint) => ({
              kind: 'check-constraint',
              severity: 'blocking',
              model: expected.find((one) => keyOf(one) === keyOf(table))?.model ?? table.table,
              subject: `${table.table} ${constraint.name} (after the migration)`,
              what: `the migration leaves rows the CHECK constraint refuses: ${constraint.clause}`,
              unit: 'row',
              hint: 'The database refuses the statement of the migration that makes such a row: convert, map or fill to a value the constraint takes, or change the constraint in the migration before it.',
              guaranteed: false,
              statement: withFixes({
                sql: `${selectCount(dialect)} FROM ${source(table)} WHERE NOT (${constraint.clause})`,
                params: [],
              }),
            })),
          )
  // A trigger fires on the UPDATE or DELETE of a fix, and on the rows a cascade reaches. What it
  // then does is code the check cannot read: said, with how many triggers there are.
  const triggers = written.flatMap((table) => {
    const names = table.triggers ?? []
    return names.length === 0
      ? []
      : [
          {
            kind: 'trigger-unfollowed',
            severity: 'warning',
            model: expected.find((one) => keyOf(one) === keyOf(table))?.model ?? table.table,
            subject: table.table,
            what: `the fixes write to a table with triggers the checks do not follow: ${names.join(', ')}`,
            unit: 'trigger',
            hint: 'Each fires as the plan writes to the table, and may change or refuse rows the preview does not show. Read them before running the plan, and look at the rows after it.',
            guaranteed: false,
            statement: {
              sql: `SELECT ${names.length} AS ${quoteIdentifier(dialect, 'count')}`,
              params: [],
            },
          },
        ]
  })
  // What the database does on its own when a fix deletes or changes rows other tables point at.
  const effects = fixes.effects.map((effect) => ({
    kind: effect.kind,
    severity: effect.severity,
    model: effect.model,
    subject: effect.subject,
    what: effect.what,
    unit: 'row',
    hint: effect.hint,
    guaranteed: false,
    statement: withFixes({ sql: effect.count, params: [] }),
  }))
  return {
    checks: [...present, ...effects, ...constraints, ...afterMigration, ...triggers, ...dropped],
    added,
    /** Decisions that do not fit the schema or the database. */
    errors: [...renameErrors, ...fixes.errors],
    /** Each fixed table's rows as the fixes leave them, in primary key order. */
    previews: fixes.changedTables.map((table) => ({
      model: table.model,
      sql: `${fixes.with}SELECT * FROM ${source(table)}${
        table.primaryKey.length === 0
          ? ''
          : ` ORDER BY ${table.primaryKey.map((c) => quoteIdentifier(dialect, c)).join(', ')}`
      }`,
    })),
    /** What `migrate plan --migration` writes into Prisma's migration. */
    rewrite: {
      renames: renames.map((r) => ({
        table: {
          schema: typeof r.table.schema === 'string' ? r.table.schema : null,
          table: r.table.table,
        },
        from: r.from,
        to: r.to,
      })),
      tables: fixes.rewrite,
      after: fixes.after,
    },
    fixes: fixes.fixes.map((fix) => ({
      model: fix.model,
      subject: fix.subject,
      kind: fix.kind,
      action: fix.action,
      statements: fix.statements,
      parts: fix.parts,
      inMigration: fix.inMigration,
      count: withFixes({ sql: fix.count, params: [] }),
    })),
  }
}

/**
 * The field a check is about: `User.name` is `name`, and a relation's `User.posts → Post` is
 * `posts`. A unique key over more than one field names them all, commas and everything, because
 * the decision spans them and there is no one field to name.
 */
export function fieldOf(check: { readonly model: string; readonly subject: string }) {
  const after = check.subject.startsWith(`${check.model}.`)
    ? check.subject.slice(check.model.length + 1)
    : check.subject
  return (after.split(' → ')[0] ?? after).trim()
}
