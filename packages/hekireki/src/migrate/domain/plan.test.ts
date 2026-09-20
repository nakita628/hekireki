import { describe, expect, it } from 'vite-plus/test'

import { describeStep, isDestructiveStatement, isDestructiveStep, makePlan } from './plan.js'

// What Prisma Migrate writes for PostgreSQL: a comment per group, one or two statements each.
const POSTGRES = `-- AlterTable
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
`

// What it writes for SQLite, which has no ALTER for most changes: the table is rebuilt.
const SQLITE = `-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL
);
INSERT INTO "new_User" ("email", "id") SELECT "email", "id" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
`

/** A check report with nothing in it, for a test to change the one part it is about. */
const REPORT = {
  database: { dialect: 'postgresql' as const, cockroach: false },
  rewrite: { renames: [], tables: [], nullable: () => true },
  fixes: [],
  results: [],
}

describe('isDestructiveStatement', () => {
  it('knows the statements that lose what the database holds', () => {
    expect(isDestructiveStatement('DROP TABLE "User"')).toBe(true)
    expect(isDestructiveStatement('ALTER TABLE "User" DROP COLUMN "name"')).toBe(true)
    expect(isDestructiveStatement('DELETE FROM "User" WHERE "email" IS NULL')).toBe(true)
    expect(isDestructiveStatement('TRUNCATE "User"')).toBe(true)
    // MySQL's DELETE over an alias names it before FROM.
    expect(
      isDestructiveStatement(
        'DELETE `hk_child` FROM `Post` AS `hk_child` WHERE `hk_child`.`authorId` IS NOT NULL',
      ),
    ).toBe(true)
  })

  it('leaves the ones that only add alone', () => {
    expect(isDestructiveStatement('ALTER TABLE "User" ADD COLUMN "name" TEXT')).toBe(false)
    expect(isDestructiveStatement('CREATE UNIQUE INDEX "i" ON "User"("email")')).toBe(false)
    // The word appears, but as part of a name.
    expect(isDestructiveStatement('CREATE TABLE "Dropped" ("id" INTEGER)')).toBe(false)
  })
})

describe('the steps of makePlan', () => {
  it('makes a step of each group Prisma Migrate wrote, with the comment as its title', () => {
    const steps = makePlan(REPORT, POSTGRES).steps
    expect(steps.map((step) => step.title)).toStrictEqual([
      'AlterTable',
      'CreateTable',
      'CreateIndex',
      'AddForeignKey',
    ])
    expect(steps.every((step) => step.kind === 'migration')).toBe(true)
    expect(steps.every((step) => step.statements.length === 1)).toBe(true)
    expect(steps.every((step) => !step.destructive)).toBe(true)
  })

  it('keeps a SQLite table rebuild in one step, so the copy cannot be skipped', () => {
    const steps = makePlan(REPORT, SQLITE).steps
    expect(steps).toHaveLength(1)
    expect(steps[0]?.title).toBe('RedefineTables')
    // Every statement of the rebuild, in order: the copy before the drop.
    expect(steps[0]?.statements).toHaveLength(8)
    expect(steps[0]?.statements[3]).toBe(
      'INSERT INTO "new_User" ("email", "id") SELECT "email", "id" FROM "User"',
    )
    expect(steps[0]?.statements[4]).toBe('DROP TABLE "User"')
    // The DROP is how SQLite alters a table, not a loss: the rows were copied first.
    expect(steps[0]?.destructive).toBe(false)
  })

  it('has no steps for an empty migration', () => {
    expect(makePlan(REPORT, '').steps).toStrictEqual([])
    expect(makePlan(REPORT, '-- nothing to do\n').steps).toStrictEqual([])
  })
})

describe('the notes of makePlan', () => {
  it('says how a failed step leaves the database, and counts the destructive ones', () => {
    const { notes } = makePlan(REPORT, 'DROP TABLE "Post";\nDROP TABLE "Tag";\nSELECT 1;\n')
    expect(notes).toHaveLength(2)
    expect(notes[0]).toContain('undoes a DDL statement already done')
    expect(notes[1]).toContain('1 of the steps')
  })

  it('says nothing about losing data when no step does', () => {
    expect(makePlan(REPORT, POSTGRES).notes).toHaveLength(1)
  })
})

describe('makePlan', () => {
  it('runs the fixes of the decisions before the migration, each with the rows it will change', () => {
    const plan = makePlan(
      {
        ...REPORT,
        fixes: [
          {
            subject: 'User.name',
            action: 'NULLs set to unknown',
            statements: [`UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL`],
            inMigration: false,
            rows: 3,
          },
        ],
      },
      POSTGRES,
    )
    expect(plan.steps[0]).toMatchObject({
      kind: 'fix',
      title: 'User.name: NULLs set to unknown',
      rows: 3,
      destructive: false,
    })
    expect(plan.steps.slice(1).every((step) => step.kind === 'migration')).toBe(true)
    expect(plan.notes.some((note) => note.includes('as the decisions say to'))).toBe(true)
  })

  it('leaves out a fix the migration itself makes, because it is written into its statements', () => {
    const plan = makePlan(
      {
        ...REPORT,
        fixes: [
          {
            subject: 'Post.slug',
            action: 'filled from the title',
            statements: ['UPDATE "Post" SET "slug" = "title"'],
            inMigration: true,
            rows: 4,
          },
        ],
      },
      POSTGRES,
    )
    expect(plan.steps.every((step) => step.kind === 'migration')).toBe(true)
  })

  it('reports what still blocks, so the plan is not run into a database that will refuse it', () => {
    const plan = makePlan(
      {
        ...REPORT,
        results: [
          {
            kind: 'unique',
            model: 'User',
            subject: 'User.email',
            what: 'unique',
            hint: 'Delete the duplicates, or say which stays with `duplicates`.',
            status: 'blocking',
            count: 2,
            error: null,
          },
          {
            kind: 'column-dropped',
            model: 'Post',
            subject: 'Post.views',
            what: 'column dropped',
            hint: 'The column goes, and what it holds with it.',
            status: 'warning',
            count: 9,
            error: null,
          },
        ],
      },
      POSTGRES,
    )
    expect(plan.errors).toHaveLength(1)
    expect(plan.errors[0]).toContain('User.email')
    expect(plan.errors[0]).toContain('2 rows')
    // Every check reaches the page, so a warning can be seen as well as acted on.
    expect(plan.checks).toHaveLength(2)
  })

  it('has no errors and no fix steps when the database is ready for the migration', () => {
    const plan = makePlan(REPORT, POSTGRES)
    expect(plan.errors).toStrictEqual([])
    expect(plan.checks).toStrictEqual([])
    expect(plan.steps.map((step) => step.title)).toStrictEqual([
      'AlterTable',
      'CreateTable',
      'CreateIndex',
      'AddForeignKey',
    ])
    expect(plan.steps.every((step) => step.rows === null)).toBe(true)
  })
})

describe('describeStep', () => {
  it('says what a table rebuild does, and does not call it a loss', () => {
    const steps = makePlan(REPORT, SQLITE).steps
    expect(steps[0]?.changes).toStrictEqual([
      { kind: 'rebuild-table', table: 'User', columns: [], target: null },
    ])
    // The DROP in the middle of a rebuild is how SQLite alters a table: the rows were copied
    // to the new one first, so nothing goes.
    expect(steps[0]?.destructive).toBe(false)
  })

  it('reads each group of a PostgreSQL migration as the changes it makes to the schema', () => {
    const steps = makePlan(REPORT, POSTGRES).steps
    expect(steps.map((step) => step.changes)).toStrictEqual([
      [{ kind: 'add-column', table: 'User', columns: ['displayName'], target: null }],
      [{ kind: 'create-table', table: 'Category', columns: [], target: null }],
      [{ kind: 'unique', table: 'User', columns: ['email'], target: null }],
      [{ kind: 'foreign-key', table: 'Post', columns: ['categoryId'], target: 'Category' }],
    ])
    expect(steps.every((step) => !step.destructive)).toBe(true)
  })

  it('still calls a real drop what it is', () => {
    expect(describeStep(['DROP TABLE "Post"'])).toStrictEqual([
      { kind: 'drop-table', table: 'Post', columns: [], target: null },
    ])
    expect(isDestructiveStep(['DROP TABLE "Post"'])).toBe(true)
    expect(describeStep(['ALTER TABLE "User" DROP COLUMN "name"'])).toStrictEqual([
      { kind: 'drop-column', table: 'User', columns: ['name'], target: null },
    ])
    expect(isDestructiveStep(['ALTER TABLE "User" DROP COLUMN "name"'])).toBe(true)
  })

  it('says nothing about the statements that only set the session up', () => {
    expect(describeStep(['PRAGMA foreign_keys=OFF', 'SET statement_timeout = 0'])).toStrictEqual([])
  })
})
