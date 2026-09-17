import { describe, expect, it } from 'vite-plus/test'

import { planSql } from './plan-sql.js'

/** A check report with nothing in it, for a test to change the one part it is about. */
const REPORT = {
  database: { dialect: 'mysql' as const, cockroach: false },
  rewrite: { renames: [], tables: [], nullable: () => true },
  fixes: [],
  results: [],
}

describe('the notes of planSql', () => {
  it('says nothing about rows when there is nothing to run', () => {
    expect(planSql(REPORT).notes).toStrictEqual([
      'No fixes decided: nothing to run before the migration.',
      'Prisma runs a migration a statement at a time, with no transaction around it: if a statement fails, the ones before it, the fixes included, stay done.',
    ])
  })

  it('names a fix over many rows as one to pick a quiet moment for, and a fix that deletes as one to back up before', () => {
    const { notes } = planSql({
      ...REPORT,
      fixes: [
        {
          subject: 'Event.name',
          action: 'NULLs set to "unknown"',
          statements: ["UPDATE `Event` SET `name` = 'unknown' WHERE `name` IS NULL"],
          inMigration: false,
          rows: 250_000,
        },
        {
          subject: 'Event.session → Session',
          action: 'orphans deleted',
          statements: [
            'DELETE `hk_child` FROM `Event` AS `hk_child` WHERE `hk_child`.`sessionId` IS NOT NULL',
          ],
          inMigration: false,
          rows: 12,
        },
      ],
    })
    expect(notes.slice(2)).toStrictEqual([
      'The check counted the rows as they were when it ran. Rows written since are not in it: stop what writes to these tables while the plan runs, or run `hekireki migrate check` again right before it.',
      'Event.name: 250000 rows in one statement, which holds its locks until it ends. On a table in use, run it while the table is quiet.',
      'It deletes rows, drops what holds them or writes over values, and nothing here undoes a statement that has run: take a backup before it.',
    ])
  })
})

describe('planSql with --batch', () => {
  const fix = {
    subject: 'User.name',
    action: 'NULLs set to "unknown"',
    statements: [`UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL`],
    parts: {
      head: `UPDATE "User" SET "name" = 'unknown'`,
      table: '"User"',
      where: '"name" IS NULL',
    },
    inMigration: false,
    rows: 12,
  }
  const planned = (dialect: 'postgresql' | 'mysql' | 'sqlite', cockroach = false) =>
    planSql({ ...REPORT, database: { dialect, cockroach }, fixes: [fix] }, null, 5).sql

  it('runs a fix as many times as its rows need, each a batch of them, and once more as it is', () => {
    expect(planned('postgresql')).toBe(`-- hekireki migrate plan

UPDATE "User" SET "name" = 'unknown' WHERE ctid IN (SELECT ctid FROM "User" WHERE "name" IS NULL LIMIT 5);
UPDATE "User" SET "name" = 'unknown' WHERE ctid IN (SELECT ctid FROM "User" WHERE "name" IS NULL LIMIT 5);
UPDATE "User" SET "name" = 'unknown' WHERE ctid IN (SELECT ctid FROM "User" WHERE "name" IS NULL LIMIT 5);
UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL;
`)
  })

  it('names some of the rows as each database does', () => {
    expect(planned('sqlite').split('\n')[2]).toBe(
      `UPDATE "User" SET "name" = 'unknown' WHERE rowid IN (SELECT rowid FROM "User" WHERE "name" IS NULL LIMIT 5);`,
    )
    expect(planned('mysql').split('\n')[2]).toBe(
      `UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL LIMIT 5;`,
    )
    // CockroachDB has no ctid, and takes a LIMIT as MySQL does.
    expect(planned('postgresql', true).split('\n')[2]).toBe(
      `UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL LIMIT 5;`,
    )
  })

  it('leaves a fix of fewer rows than a batch, and one it cannot cut, as one statement', () => {
    expect(
      planSql({ ...REPORT, fixes: [{ ...fix, rows: 5 }] }, null, 5)
        .sql.split('\n')
        .slice(2),
    ).toStrictEqual([`UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL;`, ''])
    expect(
      planSql({ ...REPORT, fixes: [{ ...fix, parts: null }] }, null, 5)
        .sql.split('\n')
        .slice(2),
    ).toStrictEqual([`UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL;`, ''])
  })

  it('cuts nothing inside the one DO block of PostgreSQL, and says why', () => {
    const plan = planSql(
      { ...REPORT, database: { dialect: 'postgresql', cockroach: false }, fixes: [fix] },
      {
        path: 'migration.sql',
        sql: '-- AlterTable\nALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL;\n',
      },
      5,
    )
    expect(plan.sql.match(/LIMIT/gu)).toBeNull()
    expect(plan.notes.some((note) => note.startsWith('--batch changes nothing here'))).toBe(true)
  })
})
