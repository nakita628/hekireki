import path from 'node:path'

import type { Effect } from 'effect'

import type { runMigrateCheck } from './check.js'
import { planSql, plural } from './domain/plan-sql.js'

/** How many checks came out each way; the migration is clear when nothing blocks or failed. */
export function summarize(report: Effect.Success<ReturnType<typeof runMigrateCheck>>) {
  const count = (status: string) =>
    report.results.filter((result) => result.status === status).length
  const summary = {
    blocking: count('blocking'),
    warning: count('warning'),
    failed: count('failed') + report.fixes.filter((fix) => fix.rows === null).length,
    passed: count('passed'),
    guaranteed: count('guaranteed'),
    fixes: report.fixes.length,
  }
  return { ...summary, ok: summary.blocking === 0 && summary.failed === 0 }
}

/** The lines `hekireki migrate check` prints. */
export function checkBanner(report: Effect.Success<ReturnType<typeof runMigrateCheck>>) {
  const summary = summarize(report)
  const listed = report.results.filter(
    (result) => result.status !== 'passed' && result.status !== 'guaranteed',
  )
  const width = Math.max(...listed.map((result) => result.subject.length), 1)
  const whatWidth = Math.max(...listed.map((result) => result.what.length), 1)
  const section = (status: string, mark: string, title: string) => {
    const members = listed.filter((result) => result.status === status)
    return members.length === 0
      ? []
      : [
          '',
          `   ${title}`,
          ...members.flatMap((result) =>
            result.error === null
              ? [
                  `   ${mark} ${result.subject.padEnd(width)}  ${result.what.padEnd(whatWidth)}  ${plural(result.count ?? 0, result.unit)}`,
                  `     ${result.hint}`,
                ]
              : [
                  `   ${mark} ${result.subject.padEnd(width)}  ${result.what.padEnd(whatWidth)}  ${result.error}`,
                ],
          ),
        ]
  }
  // The renames are made by the migration itself, with nothing to count before it.
  const renamed = report.rewrite.renames.map((r) => ({
    subject: `${r.table.table}.${r.to}`,
    action: `renamed from ${r.from}: the values stay`,
  }))
  const decided = [...report.fixes, ...renamed]
  const fixWidth = Math.max(...decided.map((fix) => fix.subject.length), 1)
  const actionWidth = Math.max(...decided.map((fix) => fix.action.length), 1)
  const inMigration = [...report.fixes.map((fix) => fix.inMigration), ...renamed.map(() => true)]
  const fixLines =
    decided.length === 0
      ? []
      : [
          '',
          `   Fixes from ${path.relative(process.cwd(), report.decisionsPath) || report.decisionsPath}, counted in: the checks read the rows as they leave them`,
          ...report.fixes.map((fix) => {
            const found =
              fix.rows === null
                ? `not counted: ${fix.error ?? ''}`
                : fix.rows === 0
                  ? 'nothing to fix: drop it once the migration has shipped'
                  : plural(fix.rows, 'row')
            return `   ${fix.rows === null ? '?' : '✓'} ${fix.subject.padEnd(fixWidth)}  ${fix.action.padEnd(actionWidth)}  ${found}`
          }),
          ...renamed.map(
            (rename) =>
              `   ✓ ${rename.subject.padEnd(fixWidth)}  ${rename.action.padEnd(actionWidth)}  in the migration`,
          ),
          inMigration.every(Boolean)
            ? '   `hekireki migrate plan --migration` writes them into the migration Prisma wrote.'
            : inMigration.some(Boolean)
              ? '   `hekireki migrate plan --migration` writes them as SQL: renames, conversions, fills and new enum members into the migration Prisma wrote, the rest before it.'
              : '   `hekireki migrate plan` writes them as SQL to run before the migration.',
        ]
  const headline = summary.ok
    ? summary.warning === 0
      ? `⚡️ Migration check: the data is ready for this schema (${plural(summary.passed + summary.guaranteed, 'check')})`
      : `⚡️ Migration check: nothing blocks, ${plural(summary.warning, 'warning')}`
    : `⚡️ Migration check: ${plural(summary.blocking, 'blocking problem')}${summary.failed === 0 ? '' : `, ${summary.failed} not checked`}${summary.warning === 0 ? '' : `, ${plural(summary.warning, 'warning')}`}`
  return [
    headline,
    `   Schema: ${report.schemaPath}`,
    `   Database: ${report.database.dialect} ${report.database.url}`.trimEnd(),
    `   Checks: ${summary.passed} passed, ${summary.guaranteed} already guaranteed by the database's constraints`,
    ...fixLines,
    ...section(
      'blocking',
      '✗',
      'Blocking: the migration fails on these rows, or leaves them inconsistent',
    ),
    ...section('warning', '!', 'Warnings: the rows and values these drop or change'),
    ...section('failed', '?', 'Not checked: the query failed'),
    ...(report.added.length === 0
      ? []
      : ['', `   New tables, nothing to check until they exist: ${report.added.join(', ')}`]),
  ].join('\n')
}

/** The report as JSON, for CI: every check with its status, count and the SQL that counted it. */
export function checkJson(report: Effect.Success<ReturnType<typeof runMigrateCheck>>) {
  const summary = summarize(report)
  return JSON.stringify(
    {
      ok: summary.ok,
      summary,
      schema: report.schemaPath,
      decisions: report.decisionsPath,
      database: report.database,
      added: report.added,
      fixes: report.fixes.map(({ count, ...fix }) => ({ ...fix, sql: count.sql })),
      renames: report.rewrite.renames,
      // The rows of each fixed table as the fixes leave them: what the plan makes of the data.
      previews: report.previews,
      plan: planSql(report).sql,
      checks: report.results.map(({ statement, ...result }) => ({
        ...result,
        sql: statement.sql,
        params: statement.params,
      })),
    },
    null,
    2,
  )
}
