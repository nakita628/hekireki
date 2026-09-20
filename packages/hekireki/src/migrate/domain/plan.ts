import type { Dialect } from '../../database/url.js'
import { splitStatements } from '../../sql/index.js'
import { fieldOf } from './checks.js'
import { CHOICES } from './decisions.js'
import { rewriteMigration } from './rewrite.js'

/**
 * A statement that drops something, or changes a column in a way that can lose what it holds. A
 * DELETE is one however it is written: MySQL's names the alias before FROM (`DELETE `c` FROM ...`).
 */
const DESTRUCTIVE =
  /^\s*(?:DROP\s+(?:TABLE|COLUMN|INDEX|CONSTRAINT|TYPE|SCHEMA)|ALTER\s+TABLE\s+.*\bDROP\b|TRUNCATE|DELETE\s)/iu

/** A line that is only a comment: what Prisma Migrate writes above each group of statements. */
const COMMENT_LINE = /^\s*--\s*(?<title>.*?)\s*$/u

/** The name in the first pair of quotes or backticks; the dialects quote differently. */
const NAMES = /["`](?<name>[^"`]+)["`]/gu

function namesOf(sql: string) {
  return [...sql.matchAll(NAMES)].map((match) => match.groups?.name ?? '')
}

/** Whether the statement drops something or otherwise loses what a column holds. */
export function isDestructiveStatement(sql: string) {
  return DESTRUCTIVE.test(sql.replaceAll(/^\s*--.*$/gmu, '').trim())
}

/**
 * The tables a block of statements rebuilds. SQLite cannot alter most of a table, so Prisma makes
 * a new one, copies the rows over, drops the old one and renames the new one into its place. The
 * `DROP TABLE` in the middle of that loses nothing, and calling it destructive would put a
 * warning on the one shape of migration that is careful by construction.
 */
export function rebuiltTables(statements: readonly string[]) {
  const renamed = statements.flatMap((statement) => {
    const match =
      /^\s*ALTER\s+TABLE\s+["`](?<from>[^"`]+)["`]\s+RENAME\s+TO\s+["`](?<to>[^"`]+)["`]/iu.exec(
        statement,
      )
    const from = match?.groups?.from
    const to = match?.groups?.to
    return from === undefined || to === undefined ? [] : [{ from, to }]
  })
  return new Set(
    renamed.flatMap(({ from, to }) => {
      const copied = statements.some(
        (statement) => /^\s*INSERT\s+INTO/iu.test(statement) && namesOf(statement).includes(from),
      )
      const dropped = statements.some((statement) =>
        new RegExp(`^\\s*DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?["\`]${to}["\`]`, 'iu').test(
          statement,
        ),
      )
      return copied && dropped ? [to] : []
    }),
  )
}

/** One change a statement makes, as a list so a statement that makes none is an empty one. */
function change(kind: string, table: string, columns: readonly string[] = [], target?: string) {
  return [{ kind, table, columns, target: target ?? null }]
}

/**
 * What one statement does, in the words of the schema rather than the words of the database: the
 * kind of change and the names it is about, for a page to say in its own language.
 */
function describeStatement(sql: string, rebuilt: ReadonlySet<string>) {
  const statement = sql.trim()
  const [first = '', second = ''] = namesOf(statement)
  if (/^CREATE\s+(?:TYPE|)/iu.test(statement) && /AS\s+ENUM/iu.test(statement)) {
    return change('create-enum', first)
  }
  if (/^CREATE\s+TABLE/iu.test(statement)) {
    return rebuilt.has(first.replace(/^new_/u, '')) && first.startsWith('new_')
      ? change('rebuild-table', first.replace(/^new_/u, ''))
      : change('create-table', first)
  }
  if (/^INSERT\s+INTO/iu.test(statement)) {
    return rebuilt.has(first.replace(/^new_/u, '')) ? [] : change('copy-rows', first)
  }
  if (/^DROP\s+TABLE/iu.test(statement)) {
    return rebuilt.has(first) ? [] : change('drop-table', first)
  }
  if (/^ALTER\s+TABLE[\s\S]*RENAME\s+TO/iu.test(statement)) return []
  if (/^ALTER\s+TABLE[\s\S]*ADD\s+COLUMN/iu.test(statement)) {
    return change('add-column', first, [second])
  }
  if (/^ALTER\s+TABLE[\s\S]*DROP\s+COLUMN/iu.test(statement)) {
    return change('drop-column', first, [second])
  }
  if (/^ALTER\s+TABLE[\s\S]*FOREIGN\s+KEY/iu.test(statement)) {
    // `ALTER TABLE "X" ADD CONSTRAINT "c_fkey" FOREIGN KEY ("c") REFERENCES "Y"("id")`.
    const key = /FOREIGN\s+KEY\s*\(\s*["`](?<column>[^"`]+)["`]/iu.exec(statement)?.groups?.column
    const target = /REFERENCES\s+["`](?<table>[^"`]+)["`]/iu.exec(statement)?.groups?.table
    return change('foreign-key', first, key === undefined ? [] : [key], target)
  }
  // `CREATE [UNIQUE] INDEX "name" ON "Table"("column", ...)`: the index is named first.
  if (/^CREATE\s+(?:UNIQUE\s+)?INDEX/iu.test(statement)) {
    const [, table = '', ...columns] = namesOf(statement)
    return change(/UNIQUE/iu.test(statement) ? 'unique' : 'index', table, columns)
  }
  return []
}

/**
 * What a step does, one change each, for someone deciding whether to run it. Prisma titles a block
 * with the name of the change it makes (`RedefineTables`), which says what the engine did rather
 * than what the database will look like afterwards.
 */
export function describeStep(statements: readonly string[]) {
  const rebuilt = rebuiltTables(statements)
  const changes = statements.flatMap((statement) => describeStatement(statement, rebuilt))
  return changes.filter(
    (one, index) =>
      changes.findIndex(
        (other) =>
          other.kind === one.kind &&
          other.table === one.table &&
          other.columns.join(',') === one.columns.join(','),
      ) === index,
  )
}

/**
 * The fixes that write over values the rows hold: what the new type refuses set to NULL, clamped
 * or cut, stored values mapped onto another member, a duplicate's or an orphan's key cleared. An
 * UPDATE does not say so as a DELETE does, and what it writes over is as gone. Filling a NULL, and
 * keeping the values of a column that moves, write over nothing.
 */
const LOSSY_FIXES: ReadonlySet<string> = new Set(['invalid', 'values', 'duplicates', 'orphans'])

/**
 * Whether a fix loses rows, or values the rows hold now.
 *
 * @param fix - the kind of the fix (`nulls`, `values`, `invalid`, ...) and its statements
 * @returns true for a DELETE or a DROP among the statements, and for a fix that writes over values
 */
export function isLossyFix(fix: {
  readonly kind?: string
  readonly statements: readonly string[]
}) {
  return isDestructiveStep(fix.statements) || LOSSY_FIXES.has(fix.kind ?? '')
}

/** Whether a step loses rows or what a column holds; a table rebuilt in place loses neither. */
export function isDestructiveStep(statements: readonly string[]) {
  const rebuilt = rebuiltTables(statements)
  return statements.some((statement) => {
    if (!isDestructiveStatement(statement)) return false
    const [first = ''] = namesOf(statement)
    return !(/^\s*DROP\s+TABLE/iu.test(statement) && rebuilt.has(first))
  })
}

/**
 * The migration in the groups Prisma Migrate itself wrote it in: a `-- CreateTable` or
 * `-- RedefineTables` comment and the statements under it, up to the next comment.
 *
 * The grouping is what makes a step safe to run on its own. SQLite has no `ALTER TABLE` for most
 * changes, so Prisma rebuilds the table: make the new one, copy the rows over, drop the old one,
 * rename. Split that into single statements and a person could drop the table without having
 * copied the rows, or stop halfway and be left with neither table under the right name.
 */
function blocksOf(migration: string) {
  const lines = migration.split('\n')
  // A comment starts a block only between statements: one inside a statement stays with it.
  const starts = lines.flatMap((line, index) => {
    if (!COMMENT_LINE.test(line)) return []
    const before = lines
      .slice(0, index)
      .join('\n')
      .replaceAll(/^\s*--.*$/gmu, '')
      .trim()
    return before === '' || before.endsWith(';') ? [index] : []
  })
  const ends = [...starts.slice(1), lines.length]
  const blocks = [
    { title: null, lines: lines.slice(0, starts[0] ?? lines.length) },
    ...starts.map((start, index) => ({
      title: COMMENT_LINE.exec(lines[start] ?? '')?.groups?.title ?? null,
      lines: lines.slice(start + 1, ends[index] ?? lines.length),
    })),
  ]
  return blocks.flatMap((block) => {
    const statements = splitStatements(block.lines.join('\n'))
      .map((statement) => statement.trim())
      .filter((statement) => statement !== '')
    return statements.length === 0 ? [] : [{ title: block.title, statements }]
  })
}

/**
 * What a migration takes with it without saying: SQLite cannot alter most of a table, so Prisma
 * makes a new one, copies the rows and drops the old one, and the triggers and CHECK constraints
 * of the old one go with it. Prisma's schema describes neither, so its new table has neither.
 *
 * @param report - the tables with triggers or CHECK constraints, as the check found them
 * @param statements - every statement of the migration
 * @returns one line per table the migration rebuilds that has some
 */
export function lostInRebuild(report: Pick<Report, 'unmanaged'>, statements: readonly string[]) {
  const rebuilt = rebuiltTables(statements)
  return (report.unmanaged ?? [])
    .filter((one) => rebuilt.has(one.table))
    .map((one) => {
      const parts = [
        ...(one.triggers.length === 0 ? [] : [`its triggers (${one.triggers.join(', ')})`]),
        ...(one.checks.length === 0
          ? []
          : [`its CHECK constraints (${one.checks.map((check) => check.clause).join('; ')})`]),
      ]
      return `The migration rebuilds ${one.table}: ${parts.join(' and ')} are not in the new table, and go with the old one. Write them into the migration again, after the table is renamed into place.`
    })
}

/**
 * What `hekireki migrate check` found, as the plan reads it: the report of `runMigrateCheck`
 * satisfies this, and naming only the parts used keeps the plan testable without a database.
 */
export type Report = {
  readonly database: { readonly dialect: Dialect; readonly cockroach: boolean }
  readonly rewrite: Omit<
    Parameters<typeof rewriteMigration>[0],
    'dialect' | 'migration' | 'cockroach'
  >
  readonly fixes: readonly {
    readonly subject: string
    /** `nulls`, `values`, `duplicates`, `orphans`, `invalid`, `convert` or `fill`. */
    readonly kind?: string
    readonly action: string
    readonly statements: readonly string[]
    readonly inMigration: boolean
    readonly rows: number | null
    /** The statement in two halves, when the plan can run it a batch of rows at a time. */
    readonly parts?: {
      readonly head: string
      readonly table: string
      readonly where: string
    } | null
  }[]
  /** The tables with triggers or CHECK constraints, which Prisma's schema does not describe. */
  readonly unmanaged?: readonly {
    readonly table: string
    readonly triggers: readonly string[]
    readonly checks: readonly { readonly name: string; readonly clause: string }[]
  }[]
  /** Decisions set aside because they no longer fit the schema or the database, each with why. */
  readonly unfit?: readonly {
    readonly kind: string
    readonly modelName: string
    readonly field: string
    readonly choice: string
    readonly value: string | null
    readonly reasons: readonly string[]
  }[]
  readonly results: readonly {
    readonly kind: string
    readonly model: string
    readonly subject: string
    readonly what: string
    readonly hint: string
    readonly status: string
    readonly count: number | null
    readonly error: string | null
    readonly facts?: Readonly<Record<string, string>>
    /** A query for the rows and values the change loses, as the database holds them now; absent when it loses none. */
    readonly lost?: string | null
    readonly suggestion?: {
      readonly choice: string
      readonly value: string | null
      readonly reason: string
    } | null
    /** Where the values of a dropped column could go, the likeliest first. */
    readonly candidates?: readonly {
      readonly choice: string
      readonly value: string | null
      readonly reason: string
    }[]
    /** Every column the migration adds that the values of a dropped column could go to. */
    readonly destinations?: readonly {
      readonly choice: string
      readonly value: string
      readonly type: string
      readonly fits: boolean
      readonly relation: string
      readonly via: string | null
      readonly created: boolean
    }[]
  }[]
}

/**
 * The statements of a fix, a batch of rows at a time when `--batch` asks for it and the fix is
 * one statement over its table: the statement as many times as the rows the check counted need,
 * each taking at most `batch` of the rows still to change, and then the statement as it is, which
 * takes whatever was written since the check. Run one after the other outside a transaction, as
 * Prisma runs a migration and as Studio runs a step, each holds its locks for its own rows only.
 *
 * A dialect names "some of the rows" its own way: MySQL, MariaDB and CockroachDB take a `LIMIT`
 * on the statement itself; PostgreSQL and SQLite do not, and name the rows by where they are
 * stored (`ctid`, `rowid`).
 *
 * @example
 * ```sql
 * -- 12 rows counted, --batch 5, on PostgreSQL
 * UPDATE "User" SET "name" = 'unknown' WHERE ctid IN (SELECT ctid FROM "User" WHERE "name" IS NULL LIMIT 5);
 * UPDATE "User" SET "name" = 'unknown' WHERE ctid IN (SELECT ctid FROM "User" WHERE "name" IS NULL LIMIT 5);
 * UPDATE "User" SET "name" = 'unknown' WHERE ctid IN (SELECT ctid FROM "User" WHERE "name" IS NULL LIMIT 5);
 * UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL;
 * -- on MySQL
 * UPDATE `User` SET `name` = 'unknown' WHERE `name` IS NULL LIMIT 5;
 * ```
 */
export function batchedStatements(
  database: Report['database'],
  fix: Report['fixes'][number],
  batch: number | null,
) {
  const { parts } = fix
  if (batch === null || parts === null || parts === undefined || (fix.rows ?? 0) <= batch) {
    return fix.statements
  }
  const row =
    database.dialect === 'mysql' || database.cockroach
      ? null
      : database.dialect === 'postgresql'
        ? 'ctid'
        : 'rowid'
  const limited =
    row === null
      ? `${parts.head} WHERE ${parts.where} LIMIT ${batch}`
      : `${parts.head} WHERE ${row} IN (SELECT ${row} FROM ${parts.table} WHERE ${parts.where} LIMIT ${batch})`
  return [
    ...Array.from({ length: Math.ceil((fix.rows ?? 0) / batch) }, () => limited),
    ...fix.statements,
  ]
}

/**
 * The migration with the fixes the decisions of the Migrate page make: the rows changed before
 * the schema is, and Prisma's own statements rewritten where a decision says what becomes of the
 * values — a rename kept as a rename, a conversion cast, a new required column filled.
 *
 * Without them a migration that adds a required column copies the rows without it and the
 * database refuses the copy, which is what the plan would otherwise walk into.
 *
 * @param report - what the check found, against the rows the database holds now
 * @param migration - the migration Prisma Migrate would write for the schema
 * @param batch - `batchedStatements`: a fix over more rows than this runs that many at a time
 * @returns the steps, what still blocks, and what the person running them needs to know
 */
export function makePlan(
  report: Report,
  migration: string,
  /** The most rows a statement of a fix changes at a time; null for all of them at once. */
  batch: number | null = null,
) {
  const rewritten = rewriteMigration({
    dialect: report.database.dialect,
    migration,
    cockroach: report.database.cockroach,
    renames: report.rewrite.renames,
    tables: report.rewrite.tables,
    after: report.rewrite.after,
    nullable: report.rewrite.nullable,
  })
  // A fix the migration itself makes is written into Prisma's statements above, not run before them.
  const before = report.fixes.filter((fix) => !fix.inMigration)
  const steps = [
    ...before.map((fix) => ({
      title: `${fix.subject}: ${fix.action}`,
      kind: 'fix' as const,
      // Studio runs a step a statement at a time, each its own transaction: a batch holds its
      // locks for its own rows only, on PostgreSQL as elsewhere.
      statements: batchedStatements(report.database, fix, batch),
      changes: describeStep(fix.statements),
      destructive: isLossyFix(fix),
      rows: fix.rows,
      subject: fix.subject,
      fixKind: fix.kind ?? null,
    })),
    ...blocksOf(rewritten.sql).map((block) => ({
      title: block.title ?? 'Change the schema',
      kind: 'migration' as const,
      statements: block.statements,
      changes: describeStep(block.statements),
      destructive: isDestructiveStep(block.statements),
      rows: null,
      subject: null,
      fixKind: null,
    })),
  ]
  // A check's kind is any string; the choices are keyed by the kinds a decision can answer.
  const choices: Readonly<Record<string, readonly string[]>> = CHOICES
  const blocked = report.results.filter((result) => result.status === 'blocking')
  const destructive = steps.filter((step) => step.destructive).length
  return {
    steps,
    unfit: report.unfit ?? [],
    checks: report.results.map((result) => ({
      kind: result.kind,
      modelName: result.model,
      subject: result.subject,
      what: result.what,
      hint: result.hint,
      status: result.status,
      count: result.count,
      error: result.error,
      field: fieldOf(result),
      choices: choices[result.kind] ?? [],
      facts: result.facts ?? {},
      lost: result.lost ?? null,
      suggestion: result.suggestion ?? null,
      candidates: result.candidates ?? [],
      destinations: result.destinations ?? [],
    })),
    // What the person running the plan needs to know before they start.
    notes: [
      ...lostInRebuild(report, splitStatements(rewritten.sql)),
      'Each step is run on its own, and its statements in order. None of the three databases undoes a DDL statement already done, so a step that fails leaves what ran before it done.',
      ...(destructive === 0
        ? []
        : [
            `${destructive} of the steps drop something, delete rows or write over what a column holds. Look at the rows before running them.`,
          ]),
      ...(before.length === 0
        ? []
        : [
            `${before.length} of the steps change rows before the schema changes, as the decisions say to.`,
          ]),
    ],
    errors: [
      ...rewritten.errors,
      ...blocked.map(
        (result) =>
          `${result.subject}: ${result.what} — ${result.count ?? 0} rows block the migration. Decide what becomes of them in the checks above.`,
      ),
    ],
  }
}
