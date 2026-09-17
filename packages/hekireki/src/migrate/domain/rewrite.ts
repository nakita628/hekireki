import type { Dialect } from '../../database/url.js'
import {
  qualifiedName,
  quoteIdentifier,
  splitStatements,
  splitTopLevel,
  stringLiteral,
} from '../../sql/index.js'

/** The dollar quote of the DO block a PostgreSQL plan runs in. */
export const BLOCK_QUOTE = '$hekireki$'

/**
 * Prisma's migration as it has to run for the decisions of the Migrate page, which Prisma
 * cannot know: the edits its documentation has a migration made by hand for.
 *
 * - A renamed column (`renamedFrom`): Prisma drops the old column and adds the new one; the
 *   rewrite renames it (PostgreSQL `RENAME COLUMN` with the new type, nullability and default,
 *   MySQL `CHANGE COLUMN`, SQLite the copy of the table carries it over), so its values stay.
 * - An added column the rows already there get a value for (`nulls`): it is added without NOT
 *   NULL, filled, and only then made NOT NULL.
 * - A conversion (`convert`): PostgreSQL changes the column's type `USING` it instead of dropping
 *   the column and adding it again; MySQL converts the values before its MODIFY; SQLite converts
 *   them as it copies the table.
 * - An enum value mapped to a member the old type does not have: in PostgreSQL's cast of the
 *   column to the new type, or over a MySQL ENUM widened to both lists for the UPDATE; CockroachDB,
 *   which adds the member and drops the old value in place, gets the UPDATE between the two.
 *
 * CockroachDB changes a table with one ALTER TABLE per clause, and Prisma runs its migration a
 * statement at a time (a column added, or an enum member, cannot be used in the transaction that
 * adds it). The clauses in a row for one table are read as one ALTER TABLE, and every ALTER TABLE
 * the rewrite writes goes back one clause at a time: a change of a column's type has to be alone.
 * Prisma's connection turns the declarative schema changer off, and CockroachDB (25.3 here)
 * changes a column's type only with it: each run of type changes turns it on for themselves and
 * back off after, Prisma's own changes of a type included, which fail otherwise.
 *
 * Prisma runs a migration a statement at a time, with no transaction around it, so a statement
 * that fails leaves the ones before it done. On PostgreSQL, whose schema changes a transaction
 * can hold, `transaction` says the migration can run as one statement, a DO block the caller puts
 * around the whole of it, fixes included: PostgreSQL runs it whole or not at all, and Prisma
 * records the error of the statement that failed. BEGIN and COMMIT will not do: after a failure
 * Prisma records it on the same connection, which the open transaction refuses. Prisma's own
 * BEGIN and COMMIT around an enum change are taken out. Not where the block cannot hold the
 * migration: an enum value added (it cannot be used in the transaction that adds it), an index
 * made CONCURRENTLY, a statement PL/pgSQL does not run as it is (a SELECT), or one with the
 * block's own quote in it.
 *
 * Everything reads the columns by the names they have before the migration. What cannot be found
 * in the migration is reported, never skipped: a migration that is not the one Prisma wrote for
 * this schema is not rewritten by guess.
 *
 * @example
 * ```sql
 * -- Prisma wrote, for a field renamed from nickname to handle:
 * ALTER TABLE "User" DROP COLUMN "nickname",
 * ADD COLUMN "handle" TEXT;
 * -- with the rename decided, the values stay:
 * ALTER TABLE "User" ALTER COLUMN "nickname" DROP DEFAULT, ALTER COLUMN "nickname" SET DATA TYPE TEXT;
 * ALTER TABLE "User" RENAME COLUMN "nickname" TO "handle";
 * ALTER TABLE "User" ALTER COLUMN "handle" DROP NOT NULL;
 *
 * -- a conversion goes into the change of type, a fill right after the column is added:
 * ALTER TABLE "User" ALTER COLUMN "views" SET DATA TYPE INTEGER USING (CAST(NULLIF(views, '') AS INTEGER));
 * ALTER TABLE "User" ADD COLUMN "token" TEXT;
 * UPDATE "User" SET "token" = ('t-' || id);
 * ```
 */
export function rewriteMigration(input: {
  readonly dialect: Dialect
  /** The migration.sql Prisma wrote for the schema. */
  readonly migration: string
  readonly renames: readonly {
    readonly table: { readonly schema: string | null; readonly table: string }
    readonly from: string
    readonly to: string
  }[]
  readonly tables: readonly {
    readonly table: { readonly schema: string | null; readonly table: string }
    readonly converts: readonly { readonly column: string; readonly sql: string }[]
    readonly enumMaps: readonly {
      readonly column: string
      /** The enum's type in the database. */
      readonly type: string
      readonly mapping: readonly { readonly from: string; readonly to: string }[]
      readonly existing: readonly string[]
      readonly members: readonly string[]
    }[]
    readonly fills: readonly { readonly column: string; readonly sql: string }[]
  }[]
  /**
   * What runs once Prisma's statements are done: the rows of a table the migration creates made
   * from values moved into it, and the table those values were kept in dropped.
   */
  readonly after?: readonly string[]
  /** The provider is CockroachDB. */
  readonly cockroach?: boolean
  /** Whether the column is nullable now, for the ENUM MySQL is widened to for a moment. */
  readonly nullable: (
    table: { readonly schema: string | null; readonly table: string },
    column: string,
  ) => boolean
}) {
  const { dialect } = input
  const q = (name: string) => quoteIdentifier(dialect, name)
  const text = (value: string) => stringLiteral(dialect, value)
  const cockroach = input.cockroach === true && dialect === 'postgresql'
  const split = splitStatements(input.migration)
  const statements = cockroach ? joinAlters(split) : split
  const targets = [
    ...input.renames.map((r) => r.table),
    ...input.tables
      .filter((t) => t.converts.length + t.enumMaps.length + t.fills.length > 0)
      .map((t) => t.table),
  ]
  const names = [...new Set(targets.map((table) => qualifiedName(dialect, table)))]
  const plans = names.map((name) => {
    const changes = input.tables.find((t) => qualifiedName(dialect, t.table) === name)
    // What the rewrite does to one table, found by the name the migration gives it.
    return {
      name,
      table: targets.find((table) => qualifiedName(dialect, table) === name) ?? {
        schema: null,
        table: name,
      },
      renames: input.renames.filter((r) => qualifiedName(dialect, r.table) === name),
      converts: changes?.converts ?? [],
      enumMaps: changes?.enumMaps ?? [],
      fills: changes?.fills ?? [],
    }
  })
  const rewritten =
    dialect === 'sqlite'
      ? rewriteSqlite(statements, plans, q)
      : rewriteAlters(dialect, statements, plans, q, text, input.nullable)
  const written = [
    ...(cockroach
      ? withDeclarativeChanger(rewritten.statements.flatMap(oneClauseEach))
      : rewritten.statements),
    ...(input.after ?? []),
  ]
  // Prisma's BEGIN and COMMIT go, and a comment above one goes to the statement after it.
  const isTransaction = (statement: string) =>
    /^(?:BEGIN|COMMIT)$/iu.test(commentOf(statement).body)
  const statementsOnly = written.flatMap((statement, index) => {
    if (isTransaction(statement)) return []
    const previous = written.slice(0, index).findLastIndex((s) => !isTransaction(s))
    const carried = written
      .slice(previous + 1, index)
      .map((s) => commentOf(s).comment)
      .filter((comment) => comment !== '')
    return [[...carried, statement].join('\n')]
  })
  const transaction =
    dialect === 'postgresql' &&
    !cockroach &&
    statementsOnly.every((statement) => {
      const { body } = commentOf(statement)
      return (
        /^(?:ALTER|CREATE|DROP|UPDATE|DELETE|INSERT|COMMENT|TRUNCATE)\b/iu.test(body) &&
        !/\bADD VALUE\b|\bCONCURRENTLY\b/iu.test(body) &&
        !statement.includes(BLOCK_QUOTE)
      )
    })
  const kept = transaction ? statementsOnly : written
  return {
    // Prisma's layout: a block of statements under its comment, an empty line before the next.
    sql: `${kept
      .map((statement, index) => {
        const gap = index === 0 ? '' : commentOf(statement).comment === '' ? '\n' : '\n\n'
        // A comment with no statement under it (an empty migration's) stays as Prisma wrote it.
        return `${gap}${statement}${commentOf(statement).body === '' ? '' : ';'}`
      })
      .join('')}\n`,
    errors: rewritten.errors,
    transaction,
  }
}

const COCKROACH_ALTER = /^ALTER TABLE ((?:"(?:[^"]|"")+"\.)?"(?:[^"]|"")+")\s+([\s\S]+)$/u

/** CockroachDB: the one-clause ALTER TABLEs in a row for one table, read as one. */
function joinAlters(statements: readonly string[]) {
  const alters = statements.map((sql) => COCKROACH_ALTER.exec(commentOf(sql).body))
  const tableAt = (index: number) => alters[index]?.[1] ?? null
  // Where a run of statements starts: anything but an ALTER TABLE of the table before it.
  const starts = statements.flatMap((_, index) =>
    index === 0 || tableAt(index) === null || tableAt(index) !== tableAt(index - 1) ? [index] : [],
  )
  return starts.map((start, n) => {
    const end = starts[n + 1] ?? statements.length
    const rest = alters.slice(start + 1, end).map((alter) => alter?.[2] ?? '')
    return [statements[start] ?? '', ...rest].join(',\n')
  })
}

/**
 * CockroachDB: a run of changes of a column's type, with the schema changer that can make them.
 *
 * @example
 * ```sql
 * -- AlterTable
 * SET use_declarative_schema_changer = on;
 * ALTER TABLE "User" ALTER COLUMN "score" SET DATA TYPE INT4;
 * SET use_declarative_schema_changer = off;
 * ```
 */
function withDeclarativeChanger(statements: readonly string[]) {
  const typed = (index: number) =>
    /^ALTER TABLE \S+ ALTER COLUMN .+ SET DATA TYPE /u.test(commentOf(statements[index] ?? '').body)
  return statements.flatMap((statement, index) => {
    if (!typed(index)) return [statement]
    const { comment, body } = commentOf(statement)
    return underComment(
      comment,
      [
        typed(index - 1) ? null : 'SET use_declarative_schema_changer = on',
        body,
        typed(index + 1) ? null : 'SET use_declarative_schema_changer = off',
      ].filter((sql) => sql !== null),
    )
  })
}

/** Statements made from one of Prisma's, under its comment: the comment goes before the first. */
function underComment(comment: string, statements: readonly string[]) {
  return statements.map((statement, index) =>
    index === 0 && comment !== '' ? `${comment}\n${statement}` : statement,
  )
}

/** CockroachDB: an ALTER TABLE written back one clause at a time. */
function oneClauseEach(statement: string) {
  const { comment, body } = commentOf(statement)
  const alter = COCKROACH_ALTER.exec(body)
  if (alter === null) return [statement]
  return splitTopLevel(alter[2] ?? '').map(
    (clause, index) =>
      `${index === 0 && comment ? `${comment}\n` : ''}ALTER TABLE ${alter[1]} ${clause}`,
  )
}

/** The comment lines Prisma writes above a statement, and the statement itself. */
function commentOf(statement: string) {
  const lines = statement.split('\n')
  const found = lines.findIndex((line) => !line.trim().startsWith('--') && line.trim() !== '')
  // No statement under the comment: all of it is comment.
  const at = found === -1 ? lines.length : found
  return {
    comment: lines.slice(0, at).join('\n').trim(),
    body: lines.slice(at).join('\n').trim(),
  }
}

/** A column definition Prisma writes: its type, NOT NULL, and the default after it. */
function definition(def: string) {
  const notNull = / NOT NULL(?: |$)/u.test(def)
  const at = def.search(/ (?:NOT NULL|NULL|DEFAULT) ?/u)
  const type = (at === -1 ? def : def.slice(0, at)).trim()
  const defaultAt = def.search(/ DEFAULT /u)
  return {
    type,
    notNull,
    default: defaultAt === -1 ? null : def.slice(defaultAt + ' DEFAULT '.length).trim(),
  }
}

const NONE: readonly string[] = []

/**
 * PostgreSQL and MySQL: Prisma changes a table with one ALTER TABLE of clauses, which the rewrite edits.
 *
 * @example
 * ```sql
 * -- PostgreSQL: an enum value mapped in the cast Prisma writes for the new type
 * ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new"
 *   USING (CASE "role"::text WHEN 'EDITOR' THEN 'WRITER' ELSE "role"::text END)::"Role_new";
 *
 * -- MySQL: the ENUM widened, the rows moved, then Prisma's own MODIFY narrows it
 * ALTER TABLE `User` MODIFY `role` ENUM('ADMIN', 'EDITOR', 'VIEWER', 'WRITER') NOT NULL;
 * UPDATE `User` SET `role` = CASE `role` WHEN 'EDITOR' THEN 'WRITER' ELSE `role` END WHERE `role` IN ('EDITOR');
 * -- MySQL: a rename is CHANGE COLUMN, a conversion an UPDATE before the MODIFY
 * UPDATE `User` SET `views` = (CAST(NULLIF(views, '') AS SIGNED));
 * ALTER TABLE `User` MODIFY `views` INTEGER NULL, CHANGE COLUMN `nickname` `displayName` VARCHAR(191) NULL;
 * ```
 */
function rewriteAlters(
  dialect: Dialect,
  statements: readonly string[],
  plans: readonly {
    readonly name: string
    readonly table: { readonly schema: string | null; readonly table: string }
    readonly renames: readonly { readonly from: string; readonly to: string }[]
    readonly converts: readonly { readonly column: string; readonly sql: string }[]
    readonly enumMaps: readonly {
      readonly column: string
      readonly type: string
      readonly mapping: readonly { readonly from: string; readonly to: string }[]
      readonly existing: readonly string[]
      readonly members: readonly string[]
    }[]
    readonly fills: readonly { readonly column: string; readonly sql: string }[]
  }[],
  q: (name: string) => string,
  text: (value: string) => string,
  nullable: (
    table: { readonly schema: string | null; readonly table: string },
    column: string,
  ) => boolean,
) {
  const identifier = dialect === 'mysql' ? '`(?:[^`]|``)+`' : '"(?:[^"]|"")+"'
  const tableName = dialect === 'mysql' ? identifier : `(?:${identifier}\\.)?${identifier}`
  const alterPattern = new RegExp(`^ALTER TABLE (${tableName})\\s+([\\s\\S]+)$`, 'u')
  const found = new Set<string>()
  const mark = (key: string) => {
    found.add(key)
  }
  const out = statements.flatMap((statement) => {
    const { comment, body } = commentOf(statement)
    // CockroachDB drops an enum value in place: the rows holding it go to their new member first,
    // which the ADD VALUE before it has made.
    const dropped =
      /^ALTER TYPE (?:"(?:[^"]|"")+"\.)?"((?:[^"]|"")+)"\s*DROP VALUE '((?:[^']|'')*)'$/u.exec(body)
    if (dialect === 'postgresql' && dropped !== null) {
      const type = (dropped[1] ?? '').replaceAll('""', '"')
      const value = (dropped[2] ?? '').replaceAll("''", "'")
      const updates = plans.flatMap((plan) =>
        plan.enumMaps
          .filter(
            (map) =>
              map.type === type &&
              map.mapping.some((m) => m.from === value) &&
              !found.has(`enum ${plan.name}.${map.column}`),
          )
          .map((map) => {
            mark(`enum ${plan.name}.${map.column}`)
            return `UPDATE ${plan.name} SET ${q(map.column)} = CASE ${q(map.column)}::STRING ${map.mapping.map((m) => `WHEN ${text(m.from)} THEN ${text(m.to)}`).join(' ')} ELSE ${q(map.column)}::STRING END::${q(type)} WHERE ${q(map.column)}::STRING IN (${map.mapping.map((m) => text(m.from)).join(', ')})`
          }),
      )
      return underComment(comment, [...updates, body])
    }
    const alter = alterPattern.exec(body)
    const plan = alter === null ? undefined : plans.find((p) => p.name === alter[1])
    if (alter === null || plan === undefined) return [statement]
    const rest = alter[2] ?? ''
    // PostgreSQL's cast of an enum column to the new type: the mapped values go in there.
    const cast = new RegExp(
      `^ALTER COLUMN (${identifier}) TYPE (${tableName}) USING \\((${identifier})::text::(${tableName})\\)$`,
      'u',
    ).exec(rest.trim())
    if (dialect === 'postgresql' && cast !== null) {
      const map = plan.enumMaps.find((m) => q(m.column) === cast[1])
      if (map === undefined) return [statement]
      mark(`enum ${plan.name}.${map.column}`)
      const read = `${q(map.column)}::text`
      const mapped = `CASE ${read} ${map.mapping.map((m) => `WHEN ${text(m.from)} THEN ${text(m.to)}`).join(' ')} ELSE ${read} END`
      return [
        `${comment ? `${comment}\n` : ''}ALTER TABLE ${plan.name} ALTER COLUMN ${cast[1]} TYPE ${cast[2]} USING (${mapped})::${cast[4]}`,
      ]
    }
    const clauses = splitTopLevel(rest)
    const drop = (column: string) =>
      clauses.findIndex((c) => new RegExp(`^DROP COLUMN ${escape(q(column))}$`, 'u').test(c))
    const add = (column: string) =>
      clauses.findIndex((c) => new RegExp(`^ADD COLUMN\\s+${escape(q(column))}\\s`, 'u').test(c))
    const defOf = (index: number, column: string) =>
      (clauses[index] ?? '').replace(new RegExp(`^ADD COLUMN\\s+${escape(q(column))}\\s+`, 'u'), '')
    const sourceOfRename = new Set(plan.renames.map((r) => r.from))

    // Fills: added without NOT NULL, filled, then NOT NULL, reading the columns as they are now.
    const fills = plan.fills.flatMap((fill) => {
      const at = add(fill.column)
      if (at === -1) return []
      mark(`fill ${plan.name}.${fill.column}`)
      const def = defOf(at, fill.column)
      const parsed = definition(def)
      const loose = def.replace(/ NOT NULL(?= |$)/u, dialect === 'mysql' ? ' NULL' : '')
      return [
        {
          at,
          before: [
            `ALTER TABLE ${plan.name} ADD COLUMN ${q(fill.column)} ${loose}`,
            `UPDATE ${plan.name} SET ${q(fill.column)} = ${fill.sql}`,
          ],
          after: parsed.notNull
            ? [
                dialect === 'mysql'
                  ? `ALTER TABLE ${plan.name} MODIFY ${q(fill.column)} ${def}`
                  : `ALTER TABLE ${plan.name} ALTER COLUMN ${q(fill.column)} SET NOT NULL`,
              ]
            : [],
        },
      ]
    })

    // Enum values mapped to a member the old MySQL ENUM does not have: widen it to both lists first.
    const widened =
      dialect === 'mysql'
        ? plan.enumMaps.flatMap((map) => {
            const modify = clauses.find(
              (c) =>
                new RegExp(
                  `^(?:MODIFY|CHANGE COLUMN ${escape(q(map.column))}) ${escape(q(map.column))} ENUM\\(`,
                  'u',
                ).test(c) || new RegExp(`^MODIFY ${escape(q(map.column))} ENUM\\(`, 'u').test(c),
            )
            if (modify === undefined) return []
            mark(`enum ${plan.name}.${map.column}`)
            const values = [...new Set([...map.existing, ...map.members])]
            return [
              `ALTER TABLE ${plan.name} MODIFY ${q(map.column)} ENUM(${values.map(text).join(', ')}) ${nullable(plan.table, map.column) ? 'NULL' : 'NOT NULL'}`,
              `UPDATE ${plan.name} SET ${q(map.column)} = CASE ${q(map.column)} ${map.mapping.map((m) => `WHEN ${text(m.from)} THEN ${text(m.to)}`).join(' ')} ELSE ${q(map.column)} END WHERE ${q(map.column)} IN (${map.mapping.map((m) => text(m.from)).join(', ')})`,
            ]
          })
        : []

    // Conversions of columns that keep their name.
    // Each an edit of the ALTER TABLE.
    const converts: readonly {
      /** The clauses it takes out, by position; -1 for none. */
      readonly drop: number
      readonly add: number
      /** The statements that go before the ALTER TABLE, and the clauses that go into it instead. */
      readonly before: readonly string[]
      readonly keep: readonly string[]
    }[] = plan.converts
      .filter((convert) => !sourceOfRename.has(convert.column))
      .flatMap((convert) => {
        if (dialect === 'mysql') {
          const touched = clauses.some((c) =>
            new RegExp(`^MODIFY ${escape(q(convert.column))}\\s`, 'u').test(c),
          )
          if (!touched) return []
          mark(`convert ${plan.name}.${convert.column}`)
          return [
            {
              drop: -1,
              add: -1,
              before: [`UPDATE ${plan.name} SET ${q(convert.column)} = (${convert.sql})`],
              keep: NONE,
            },
          ]
        }
        const dropAt = drop(convert.column)
        const addAt = add(convert.column)
        if (dropAt !== -1 && addAt !== -1) {
          mark(`convert ${plan.name}.${convert.column}`)
          const parsed = definition(defOf(addAt, convert.column))
          const column = `ALTER COLUMN ${q(convert.column)}`
          return [
            {
              drop: dropAt,
              add: addAt,
              before: [
                `ALTER TABLE ${plan.name} ${column} DROP DEFAULT, ${column} SET DATA TYPE ${parsed.type} USING (${convert.sql}), ${column} ${parsed.notNull ? 'SET NOT NULL' : 'DROP NOT NULL'}${parsed.default === null ? '' : `, ${column} SET DEFAULT ${parsed.default}`}`,
              ],
              keep: NONE,
            },
          ]
        }
        const castAt = clauses.findIndex((c) =>
          new RegExp(`^ALTER COLUMN ${escape(q(convert.column))} SET DATA TYPE `, 'u').test(c),
        )
        if (castAt === -1) return []
        mark(`convert ${plan.name}.${convert.column}`)
        return [
          {
            drop: castAt,
            add: -1,
            before: [],
            keep: [`${clauses[castAt] ?? ''} USING (${convert.sql})`],
          },
        ]
      })

    // Renames: the drop of the old column and the add of the new one, made one change.
    const renames = plan.renames.flatMap<(typeof converts)[number]>((rename) => {
      const dropAt = drop(rename.from)
      const addAt = add(rename.to)
      if (dropAt === -1 || addAt === -1) return []
      mark(`rename ${plan.name}.${rename.from}`)
      const def = defOf(addAt, rename.to)
      if (dialect === 'mysql') {
        // The values converted in the column as it is, and CHANGE COLUMN carries them over.
        const convert = plan.converts.find((c) => c.column === rename.from)
        if (convert !== undefined) mark(`convert ${plan.name}.${convert.column}`)
        return [
          {
            drop: dropAt,
            add: addAt,
            before:
              convert === undefined
                ? NONE
                : [`UPDATE ${plan.name} SET ${q(rename.from)} = (${convert.sql})`],
            keep: [`CHANGE COLUMN ${q(rename.from)} ${q(rename.to)} ${def}`],
          },
        ]
      }
      const parsed = definition(def)
      const convert = plan.converts.find((c) => c.column === rename.from)
      if (convert !== undefined) mark(`convert ${plan.name}.${convert.column}`)
      const old = `ALTER COLUMN ${q(rename.from)}`
      const now = `ALTER COLUMN ${q(rename.to)}`
      return [
        {
          drop: dropAt,
          add: addAt,
          before: [
            `ALTER TABLE ${plan.name} ${old} DROP DEFAULT, ${old} SET DATA TYPE ${parsed.type}${convert === undefined ? '' : ` USING (${convert.sql})`}`,
            `ALTER TABLE ${plan.name} RENAME COLUMN ${q(rename.from)} TO ${q(rename.to)}`,
            `ALTER TABLE ${plan.name} ${now} ${parsed.notNull ? 'SET NOT NULL' : 'DROP NOT NULL'}${parsed.default === null ? '' : `, ${now} SET DEFAULT ${parsed.default}`}`,
          ],
          keep: NONE,
        },
      ]
    })

    const removed = new Set([
      ...fills.map((f) => f.at),
      ...converts.flatMap((c) => [c.drop, c.add]),
      ...renames.flatMap((r) => [r.drop, r.add]),
    ])
    const kept = [
      ...clauses.filter((_, index) => !removed.has(index)),
      ...converts.flatMap((c) => c.keep),
      ...renames.flatMap((r) => r.keep),
    ]
    const separator = dialect === 'mysql' ? ',\n    ' : ',\n'
    return underComment(comment, [
      ...fills.flatMap((f) => f.before),
      ...widened,
      ...converts.flatMap((c) => c.before),
      ...renames.flatMap((r) => r.before),
      ...(kept.length === 0 ? [] : [`ALTER TABLE ${plan.name} ${kept.join(separator)}`]),
      ...fills.flatMap((f) => f.after),
    ])
  })
  const expectedKeys = plans.flatMap((plan) => [
    ...plan.renames.map((r) => ({
      key: `rename ${plan.name}.${r.from}`,
      message: `rename ${plan.name}.${r.from} to ${r.to}: no DROP COLUMN ${r.from} and ADD COLUMN ${r.to} in one ALTER TABLE`,
    })),
    ...plan.fills.map((f) => ({
      key: `fill ${plan.name}.${f.column}`,
      message: `fill ${plan.name}.${f.column}: no ADD COLUMN ${f.column}`,
    })),
    ...plan.converts.map((c) => ({
      key: `convert ${plan.name}.${c.column}`,
      message: `convert ${plan.name}.${c.column}: no change of its type`,
    })),
    ...plan.enumMaps.map((m) => ({
      key: `enum ${plan.name}.${m.column}`,
      message: `map ${plan.name}.${m.column}: no change of its enum`,
    })),
  ])
  return {
    statements: out,
    errors: expectedKeys.filter((e) => !found.has(e.key)).map((e) => e.message),
  }
}

/** A string matched as it is inside a regular expression. */
function escape(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * SQLite: Prisma copies a table it changes into a new one; the copy is where the rewrite goes.
 *
 * @example
 * ```sql
 * -- the copy reads the old name, converts and fills on its way into the new table
 * INSERT INTO "new_User" ("id", "role", "views", "displayName", "token")
 * SELECT "id", "role", (CAST(NULLIF(views, '') AS INTEGER)), "nickname", ('t-' || id) FROM "User";
 * -- a nullable column SQLite adds in place is filled right after it
 * ALTER TABLE "User" ADD COLUMN "token" TEXT;
 * UPDATE "User" SET "token" = 't-' || id;
 * ```
 */
function rewriteSqlite(
  statements: readonly string[],
  plans: readonly {
    readonly name: string
    readonly table: { readonly schema: string | null; readonly table: string }
    readonly renames: readonly { readonly from: string; readonly to: string }[]
    readonly converts: readonly { readonly column: string; readonly sql: string }[]
    readonly enumMaps: readonly {
      readonly column: string
      readonly type: string
      readonly mapping: readonly { readonly from: string; readonly to: string }[]
      readonly existing: readonly string[]
      readonly members: readonly string[]
    }[]
    readonly fills: readonly { readonly column: string; readonly sql: string }[]
  }[],
  q: (name: string) => string,
) {
  const found = new Set<string>()
  const out = statements.map((statement) => {
    const { comment, body } = commentOf(statement)
    const copy =
      /^INSERT INTO ("(?:[^"]|"")+") \(([^)]*)\) SELECT ([\s\S]+) FROM ("(?:[^"]|"")+")$/u.exec(
        body,
      )
    if (copy !== null) {
      const plan = plans.find((p) => p.name === copy[4])
      if (plan === undefined) return statement
      const into = splitTopLevel(copy[2] ?? '')
      const from = splitTopLevel(copy[3] ?? '')
      const converted = (column: string) => plan.converts.find((c) => c.column === column)
      const columns = into.map((column, index) => {
        const source = from[index] ?? column
        const convert = plan.converts.find((c) => q(c.column) === source)
        if (convert !== undefined) found.add(`convert ${plan.name}.${convert.column}`)
        return { into: column, from: convert === undefined ? source : `(${convert.sql})` }
      })
      const renamed = plan.renames.map((rename) => {
        found.add(`rename ${plan.name}.${rename.from}`)
        const convert = converted(rename.from)
        if (convert !== undefined) found.add(`convert ${plan.name}.${convert.column}`)
        return {
          into: q(rename.to),
          from: convert === undefined ? q(rename.from) : `(${convert.sql})`,
        }
      })
      const filled = plan.fills.map((fill) => {
        found.add(`fill ${plan.name}.${fill.column}`)
        return { into: q(fill.column), from: fill.sql }
      })
      const all = [...columns, ...renamed, ...filled]
      return `${comment ? `${comment}\n` : ''}INSERT INTO ${copy[1]} (${all.map((c) => c.into).join(', ')}) SELECT ${all.map((c) => c.from).join(', ')} FROM ${copy[4]}`
    }
    return statement
  })
  // A nullable column SQLite adds in place: the rows already there are filled right after it.
  const withFills = out.flatMap((statement) => {
    const { body } = commentOf(statement)
    const added = /^ALTER TABLE ("(?:[^"]|"")+") ADD COLUMN ("(?:[^"]|"")+") /u.exec(body)
    const plan = added === null ? undefined : plans.find((p) => p.name === added[1])
    const fill = plan?.fills.find((f) => q(f.column) === added?.[2])
    if (plan === undefined || fill === undefined || found.has(`fill ${plan.name}.${fill.column}`)) {
      return [statement]
    }
    found.add(`fill ${plan.name}.${fill.column}`)
    return [statement, `UPDATE ${plan.name} SET ${q(fill.column)} = ${fill.sql}`]
  })
  const expected = plans.flatMap((plan) => [
    ...plan.renames.map((r) => ({
      key: `rename ${plan.name}.${r.from}`,
      message: `rename ${plan.name}.${r.from} to ${r.to}: Prisma does not copy ${plan.name}`,
    })),
    ...plan.fills.map((f) => ({
      key: `fill ${plan.name}.${f.column}`,
      message: `fill ${plan.name}.${f.column}: no copy of ${plan.name} and no ADD COLUMN ${f.column}`,
    })),
    ...plan.converts.map((c) => ({
      key: `convert ${plan.name}.${c.column}`,
      message: `convert ${plan.name}.${c.column}: Prisma does not copy ${plan.name}`,
    })),
  ])
  return {
    statements: withFills,
    errors: expected.filter((e) => !found.has(e.key)).map((e) => e.message),
  }
}
