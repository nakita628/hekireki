import { splitStatements } from '../../sql/index.js'
import { batchedStatements, isDestructiveStep, isLossyFix, lostInRebuild } from './plan.js'
import type { Report } from './plan.js'
import { BLOCK_QUOTE, rewriteMigration } from './rewrite.js'

/** `1 row`, `2 rows`. */
export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** The rows of one fix from which the plan says to pick a quiet moment for it. */
const HEAVY_ROWS = 100_000

/**
 * The one comment a plan has, its first line: what tells a plan from the migration Prisma wrote,
 * so that the plan is not written into its own output, which would make every change twice.
 */
const GENERATED = '-- hekireki migrate plan'

/**
 * `hekireki migrate plan`: the fixes of the decisions as SQL, in the order the check applied
 * them, to run before the migration Prisma writes for the schema. Given that migration, the
 * whole of it: the fixes, then Prisma's statements with what the migration itself has to do
 * written in (a rename, a conversion, an added column filled, an enum value mapped in its cast).
 * The SQL is statements only, Prisma's own comments kept and none added but the first line;
 * `notes` is what a person needs to know about running it, for the command to print.
 * `errors` says what the plan cannot do: a change the migration has to make, with no migration
 * given, or one the migration given has no statement for.
 *
 * @example
 * ```sql
 * -- without --migration: the marker, then one block per fix, to run before the migration
 * -- hekireki migrate plan
 *
 * UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL;
 *
 * -- with --migration on PostgreSQL: the fixes and Prisma's statements as one DO block
 * -- hekireki migrate plan
 *
 * DO $hekireki$
 * #variable_conflict use_column
 * BEGIN
 * UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL;
 *
 * -- AlterTable
 * ALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL;
 * END $hekireki$;
 * ```
 */
export function planSql(
  report: Report,
  migration: { readonly path: string; readonly sql: string } | null = null,
  /** `--batch`: the most rows a statement of a fix changes at a time; null for all of them at once. */
  batch: number | null = null,
) {
  const inMigration =
    report.rewrite.renames.length +
    report.rewrite.tables.reduce(
      (sum, t) => sum + t.converts.length + t.enumMaps.length + t.fills.length,
      0,
    ) +
    (report.rewrite.after?.length ?? 0)
  const rewritten =
    migration === null
      ? null
      : rewriteMigration({
          dialect: report.database.dialect,
          migration: migration.sql,
          cockroach: report.database.cockroach,
          renames: report.rewrite.renames,
          tables: report.rewrite.tables,
          after: report.rewrite.after,
          nullable: report.rewrite.nullable,
        })
  const again = migration?.sql.split('\n').some((line) => line.trim() === GENERATED) === true
  const errors = again
    ? [
        `${migration?.path ?? 'migration.sql'}: already written by hekireki migrate plan. Pass the migration.sql Prisma wrote (\`prisma migrate diff --script\` writes it again).`,
      ]
    : rewritten !== null
      ? rewritten.errors.map((error) => `${migration?.path ?? 'migration.sql'}: ${error}.`)
      : inMigration > 0
        ? [
            `The decisions ask the migration itself for ${plural(inMigration, 'change')} (a rename, a conversion, an added column filled, an enum value mapped in its cast or values moved to another table): pass --migration with the migration.sql Prisma wrote for this schema.`,
          ]
        : []
  const transaction = rewritten?.transaction === true
  const postgres = report.database.dialect === 'postgresql' && !report.database.cockroach
  const before = report.fixes.filter((fix) => !fix.inMigration)
  // A fix over this many rows is one to plan for: one UPDATE or DELETE, one long lock.
  const heavy = before.filter((fix) => (fix.rows ?? 0) >= HEAVY_ROWS)
  const lossy =
    before.some(isLossyFix) ||
    (rewritten !== null && isDestructiveStep(splitStatements(rewritten.sql)))
  const notes = [
    ...(migration === null
      ? before.length === 0
        ? ['No fixes decided: nothing to run before the migration.']
        : [
            'Put it at the top of the migration Prisma writes for the schema (`prisma migrate dev --create-only` writes one to edit), or pass that migration with --migration.',
          ]
      : ['Put it in place of the migration.sql Prisma wrote.']),
    transaction
      ? 'One statement, a DO block PostgreSQL runs whole or not at all: if a statement in it fails, none of it is done, the fixes included.'
      : 'Prisma runs a migration a statement at a time, with no transaction around it: if a statement fails, the ones before it, the fixes included, stay done.',
    ...(postgres && migration === null && before.length > 0
      ? [
          'With --migration, the plan runs the fixes and the migration as one statement, whole or not at all.',
        ]
      : postgres && migration !== null && !transaction
        ? [
            'Not as one statement here: PostgreSQL cannot use an enum value in the transaction that adds it or make an index CONCURRENTLY in one, and a DO block does not run a SELECT as it is.',
          ]
        : []),
    // What the check cannot promise: it counted the rows as they were when it ran.
    ...(before.length === 0 && rewritten === null
      ? []
      : [
          'The check counted the rows as they were when it ran. Rows written since are not in it: stop what writes to these tables while the plan runs, or run `hekireki migrate check` again right before it.',
        ]),
    ...heavy.map((fix) =>
      batch !== null && !transaction && fix.parts !== null && fix.parts !== undefined
        ? `${fix.subject}: ${plural(fix.rows ?? 0, 'row')}, ${batch} at a time. Each statement holds its locks only for its own rows; the last one takes whatever was written since the check.`
        : `${fix.subject}: ${plural(fix.rows ?? 0, 'row')} in one statement, which holds its locks until it ends. On a table in use, run it while the table is quiet${transaction || fix.parts === null || fix.parts === undefined ? '' : ', or pass --batch to run it some rows at a time'}.`,
    ),
    ...(batch !== null && transaction
      ? [
          '--batch changes nothing here: the DO block is one transaction, which holds every lock until it ends however its statements are cut.',
        ]
      : []),
    ...(rewritten === null ? [] : lostInRebuild(report, splitStatements(rewritten.sql))),
    ...(lossy
      ? [
          transaction
            ? 'It deletes rows, drops what holds them or writes over values. The DO block undoes itself only if it fails: once it has run, a backup taken before it is the only way back.'
            : 'It deletes rows, drops what holds them or writes over values, and nothing here undoes a statement that has run: take a backup before it.',
        ]
      : []),
  ]
  // A fix to a block of statements; the blocks, and the migration, apart by an empty line.
  const blocks = [
    ...before.map((fix) =>
      (transaction ? fix.statements : batchedStatements(report.database, fix, batch))
        .map((statement) => `${statement};`)
        .join('\n'),
    ),
    ...(rewritten === null ? [] : [rewritten.sql.trimEnd()]),
  ]
  // `use_column`: a column named like a PL/pgSQL variable (found) is read as the column.
  const statements = transaction
    ? [
        `DO ${BLOCK_QUOTE}\n#variable_conflict use_column\nBEGIN\n${blocks.join('\n\n')}\nEND ${BLOCK_QUOTE};`,
      ]
    : blocks
  return {
    sql: `${[GENERATED, ...statements].join('\n\n')}\n`,
    errors,
    notes,
  }
}
