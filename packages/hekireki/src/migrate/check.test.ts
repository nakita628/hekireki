import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../file/index.js'
import { DECISIONS_FILE } from './adapter/decisions-file.js'
import { runMigrateCheck } from './check.js'
import { planSql } from './domain/plan-sql.js'
import { checkBanner, checkJson, summarize } from './report.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The database as the old schema left it, with rows that break the new one. Foreign keys are off
// while the rows go in, as on any connection that does not turn them on, so an orphan is there.
const OLD_DATABASE = `
CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "email" TEXT NOT NULL, "name" TEXT, "nickname" TEXT, "role" TEXT NOT NULL DEFAULT 'VIEWER');
CREATE TABLE "Post" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "title" TEXT NOT NULL, "authorId" INTEGER, "views" TEXT, CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE);
CREATE TABLE "Legacy" ("id" INTEGER NOT NULL PRIMARY KEY, "note" TEXT NOT NULL);
INSERT INTO "User" ("id", "email", "name", "nickname", "role") VALUES
  (1, 'a@example.com', 'Ann', NULL, 'ADMIN'),
  (2, 'a@example.com', NULL, 'annie', 'EDITOR'),
  (3, 'b@example.com', NULL, NULL, 'VIEWER'),
  (4, 'b@example.com', 'Dan', NULL, 'EDITOR'),
  (5, 'c@example.com', 'Eve', NULL, 'VIEWER');
INSERT INTO "Post" ("id", "title", "authorId", "views") VALUES (1, 'p', 1, '10'), (2, 'q', 99, NULL), (3, 'r', NULL, 'many');
INSERT INTO "Legacy" VALUES (1, 'old');
`

// The schema about to be migrated: EDITOR goes, email turns unique, name turns required, bio is
// added without a default, nickname and Legacy go, views turns Int.
const NEW_SCHEMA = `datasource db {
  provider = "sqlite"
}

enum Role {
  ADMIN
  VIEWER
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String
  role  Role   @default(VIEWER)
  bio   String
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int?
  author   User?  @relation(fields: [authorId], references: [id], onDelete: SetNull)
  views    Int?
}

model Tag {
  id    Int    @id @default(autoincrement())
  label String @unique
}
`

function project(schema: string, sql: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-migrate-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'schema.prisma'), schema)
  const db = new DatabaseSync(path.join(dir, 'dev.db'), { enableForeignKeyConstraints: false })
  db.exec(sql)
  db.close()
  return dir
}

/** Writes the decisions the Migrate page would keep beside the schema. */
function decide(dir: string, decisions: readonly Readonly<Record<string, string | null>>[]) {
  const file = path.join(dir, DECISIONS_FILE)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ decisions }))
}

function check(dir: string, url: string | null = 'file:./dev.db') {
  return Effect.runPromiseExit(
    Effect.provide(
      runMigrateCheck({
        schemaPath: path.join(dir, 'schema.prisma'),
        url,
        decisions: null,
        timeout: null,
        cwd: dir,
        env: {},
      }),
      fileSystemLayer,
    ),
  )
}

async function report(dir: string) {
  const exit = await check(dir, 'file:./dev.db')
  if (Exit.isFailure(exit)) throw new Error(String(exit.cause))
  return exit.value
}

describe('runMigrateCheck', () => {
  it('counts the rows that stand in the way of the new schema, and the data it drops', async () => {
    const dir = project(NEW_SCHEMA, OLD_DATABASE)
    const result = await report(dir)
    expect(
      result.results
        .filter((r) => r.status !== 'passed' && r.status !== 'guaranteed')
        .map((r) => [r.status, r.subject, r.what, r.count]),
    ).toStrictEqual([
      ['blocking', 'User.name', 'column becomes NOT NULL', 2],
      ['blocking', 'User.role', 'values outside enum Role', 2],
      ['blocking', 'User.bio', 'required column added without a database default', 5],
      ['blocking', 'User.email', 'unique', 2],
      ['warning', 'User.nickname', 'column dropped', 1],
      ['warning', 'Post.views', 'type changes from TEXT to Int', 2],
      ['blocking', 'Post.author → User', 'foreign key', 1],
      ['warning', 'Legacy', 'table dropped', 1],
    ])
    expect(result.added).toStrictEqual(['Tag'])
    expect(summarize(result)).toStrictEqual({
      blocking: 5,
      warning: 3,
      failed: 0,
      passed: 0,
      guaranteed: 7,
      fixes: 0,
      ok: false,
    })
    expect(result.database).toStrictEqual({
      dialect: 'sqlite',
      url: 'file:./dev.db',
      mariadb: false,
      cockroach: false,
    })
  })

  it('reads the data as clear once the rows are fixed, and never writes a row itself', async () => {
    const dir = project(
      NEW_SCHEMA.replace('  bio   String\n', '  bio   String @default("")\n'),
      `${OLD_DATABASE}
UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL;
UPDATE "User" SET "role" = 'VIEWER' WHERE "role" = 'EDITOR';
UPDATE "User" SET "email" = 'a2@example.com' WHERE "id" = 2;
UPDATE "User" SET "email" = 'b2@example.com' WHERE "id" = 4;
UPDATE "Post" SET "authorId" = NULL WHERE "authorId" = 99;
`,
    )
    const dump = () => {
      const db = new DatabaseSync(path.join(dir, 'dev.db'))
      const rows = ['User', 'Post', 'Legacy'].map((table) =>
        db.prepare(`SELECT * FROM "${table}"`).all(),
      )
      db.close()
      return rows
    }
    const before = dump()
    const result = await report(dir)
    expect(summarize(result)).toMatchObject({ blocking: 0, warning: 3, failed: 0, ok: true })
    expect(result.results.filter((r) => r.status === 'passed').map((r) => r.subject)).toStrictEqual(
      ['User.name', 'User.role', 'User.email', 'Post.author → User'],
    )
    expect(dump()).toStrictEqual(before)
    expect(checkBanner(result).split('\n')[0]).toBe(
      '⚡️ Migration check: nothing blocks, 3 warnings',
    )
  })

  it('says the data is ready when the schema changes nothing', async () => {
    const dir = project(
      `datasource db {
  provider = "sqlite"
}

model Legacy {
  id   Int    @id
  note String
}
`,
      'CREATE TABLE "Legacy" ("id" INTEGER NOT NULL PRIMARY KEY, "note" TEXT NOT NULL); INSERT INTO "Legacy" VALUES (1, \'x\');',
    )
    const result = await report(dir)
    expect(summarize(result)).toStrictEqual({
      blocking: 0,
      warning: 0,
      failed: 0,
      passed: 0,
      guaranteed: 3,
      fixes: 0,
      ok: true,
    })
    expect(checkBanner(result).split('\n')[0]).toBe(
      '⚡️ Migration check: the data is ready for this schema (3 checks)',
    )
  })

  it('refuses a database of another dialect than the schema is written for', async () => {
    const dir = project(NEW_SCHEMA.replace('provider = "sqlite"', 'provider = "postgresql"'), '')
    const exit = await check(dir)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(String(exit)).toContain(
      'The schema is written for postgresql, but the database URL points at sqlite.',
    )
  })

  it('says where to put a URL when there is none', async () => {
    const dir = project(NEW_SCHEMA, '')
    const exit = await check(dir, null)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(String(exit)).toContain('No database URL found.')
  })
})

describe('checkBanner', () => {
  it('lists what blocks, then the warnings, each with what to do about it', async () => {
    const dir = project(NEW_SCHEMA, OLD_DATABASE)
    const banner = checkBanner(await report(dir))
    expect(banner.split('\n').slice(0, 4)).toStrictEqual([
      '⚡️ Migration check: 5 blocking problems, 3 warnings',
      `   Schema: ${path.join(dir, 'schema.prisma')}`,
      '   Database: sqlite file:./dev.db',
      "   Checks: 0 passed, 7 already guaranteed by the database's constraints",
    ])
    expect(banner).toContain(
      '   ✗ User.email          unique                                            2 duplicate groups\n     Merge or remove the duplicates before the constraint is created, or say which to keep on the Migrate page of hekireki studio.',
    )
    expect(banner).toContain(
      '   ✗ Post.author → User  foreign key                                       1 orphan row\n',
    )
    expect(banner).toContain(
      '   ! Post.views          type changes from TEXT to Int                     2 values\n     SQLite copies the values as they are: make sure each one reads back as Int, or say how each converts on the Migrate page of hekireki studio.',
    )
    expect(banner).toContain(
      '   ! Legacy              table dropped                                     1 row\n',
    )
    expect(banner).toContain('   New tables, nothing to check until they exist: Tag')
  })
})

describe('checkJson', () => {
  it('gives CI every check with its status, count and SQL', async () => {
    const dir = project(NEW_SCHEMA, OLD_DATABASE)
    const parsed: unknown = JSON.parse(checkJson(await report(dir)))
    expect(parsed).toMatchObject({
      ok: false,
      summary: { blocking: 5, warning: 3 },
      added: ['Tag'],
    })
    expect(parsed).toHaveProperty(
      'checks.4',
      expect.objectContaining({
        kind: 'enum',
        status: 'blocking',
        count: 2,
        sql: 'SELECT COUNT(*) AS "count" FROM "User" WHERE "role" IS NOT NULL AND "role" NOT IN (?, ?)',
        params: ['ADMIN', 'VIEWER'],
      }),
    )
  })
})

describe('fixes from the decisions of the Migrate page', () => {
  const FIXABLE = NEW_SCHEMA.replace('  bio   String\n', '  bio   String @default("")\n')
  // Role is mapped before name is filled, so the SQL that fills name reads the mapped role.
  const DECISIONS = [
    { kind: 'enum', modelName: 'User', field: 'role', choice: 'map', value: 'EDITOR=VIEWER' },
    {
      kind: 'not-null',
      modelName: 'User',
      field: 'name',
      choice: 'sql',
      value: `'user-' || "role" || '-' || "id"`,
    },
    { kind: 'unique', modelName: 'User', field: 'email', choice: 'keep-last-delete', value: 'id' },
    { kind: 'foreign-key', modelName: 'Post', field: 'author', choice: 'delete', value: null },
  ]

  function rows(file: string, sql: string) {
    const db = new DatabaseSync(file)
    // node:sqlite rows have no prototype; copied, they compare with plain objects.
    const found = db
      .prepare(sql)
      .all()
      .map((row) => structuredClone(row))
    db.close()
    return found
  }

  it('counts what is left once the fixes have run, and says how many rows each one changes', async () => {
    const dir = project(FIXABLE, OLD_DATABASE)
    decide(dir, DECISIONS)
    const result = await report(dir)
    expect(result.fixes.map((fix) => [fix.subject, fix.action, fix.rows])).toStrictEqual([
      ['User.role', 'values mapped: EDITOR → VIEWER', 2],
      ['User.name', `NULLs set to SQL 'user-' || "role" || '-' || "id"`, 2],
      ['User.email', 'duplicates: the last by id kept, the others deleted', 2],
      // Post 2 points at no user. Post 1 pointed at user 1, a duplicate the fix before deletes,
      // but Post.authorId is ON DELETE SET NULL: the database clears it, and it is no orphan.
      ['Post.author → User', 'orphans deleted', 1],
    ])
    expect(summarize(result)).toMatchObject({ blocking: 0, failed: 0, fixes: 4, ok: true })
    expect(checkBanner(result)).toContain(
      '   ✓ User.email          duplicates: the last by id kept, the others deleted  2 rows',
    )
  })

  it('writes a plan that leaves each table as the check previewed it', async () => {
    const dir = project(FIXABLE, OLD_DATABASE)
    // Keeping the first of each email deletes users 2 and 4, which no post points at.
    decide(
      dir,
      DECISIONS.map((decision) =>
        decision.kind === 'unique' ? { ...decision, choice: 'keep-first-delete' } : decision,
      ),
    )
    const result = await report(dir)
    // The statements alone: a marker for the plan to know its own output, no comment else.
    expect(planSql(result)).toStrictEqual({
      sql: `-- hekireki migrate plan

UPDATE "User" SET "role" = CASE "role" WHEN 'EDITOR' THEN 'VIEWER' ELSE "role" END WHERE "role" IN ('EDITOR');

UPDATE "User" SET "name" = ('user-' || "role" || '-' || "id") WHERE "name" IS NULL;

DELETE FROM "User" WHERE "id" IN (SELECT "id" FROM (SELECT "id", "email", ROW_NUMBER() OVER (PARTITION BY "email" ORDER BY "id" ASC) AS "hk_rank" FROM "User") AS "hk_ranked" WHERE "hk_rank" > 1 AND "email" IS NOT NULL);

DELETE FROM "Post" AS "hk_child" WHERE "hk_child"."authorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" AS "hk_parent" WHERE "hk_parent"."id" = "hk_child"."authorId");
`,
      errors: [],
      notes: [
        'Put it at the top of the migration Prisma writes for the schema (`prisma migrate dev --create-only` writes one to edit), or pass that migration with --migration.',
        'Prisma runs a migration a statement at a time, with no transaction around it: if a statement fails, the ones before it, the fixes included, stay done.',
        'The check counted the rows as they were when it ran. Rows written since are not in it: stop what writes to these tables while the plan runs, or run `hekireki migrate check` again right before it.',
        'It deletes rows, drops what holds them or writes over values, and nothing here undoes a statement that has run: take a backup before it.',
      ],
    })
    // On PostgreSQL, given the migration, the fixes and the migration are one DO block.
    const index = '-- CreateIndex\nCREATE UNIQUE INDEX "User_email_key" ON "User"("email");\n'
    expect(
      planSql(
        { ...result, database: { ...result.database, dialect: 'postgresql' } },
        { path: 'migration.sql', sql: index },
      ),
    ).toStrictEqual({
      sql: `-- hekireki migrate plan

DO $hekireki$
#variable_conflict use_column
BEGIN
UPDATE "User" SET "role" = CASE "role" WHEN 'EDITOR' THEN 'VIEWER' ELSE "role" END WHERE "role" IN ('EDITOR');

UPDATE "User" SET "name" = ('user-' || "role" || '-' || "id") WHERE "name" IS NULL;

DELETE FROM "User" WHERE "id" IN (SELECT "id" FROM (SELECT "id", "email", ROW_NUMBER() OVER (PARTITION BY "email" ORDER BY "id" ASC) AS "hk_rank" FROM "User") AS "hk_ranked" WHERE "hk_rank" > 1 AND "email" IS NOT NULL);

DELETE FROM "Post" AS "hk_child" WHERE "hk_child"."authorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" AS "hk_parent" WHERE "hk_parent"."id" = "hk_child"."authorId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
END $hekireki$;
`,
      errors: [],
      notes: [
        'Put it in place of the migration.sql Prisma wrote.',
        'One statement, a DO block PostgreSQL runs whole or not at all: if a statement in it fails, none of it is done, the fixes included.',
        'The check counted the rows as they were when it ran. Rows written since are not in it: stop what writes to these tables while the plan runs, or run `hekireki migrate check` again right before it.',
        'It deletes rows, drops what holds them or writes over values. The DO block undoes itself only if it fails: once it has run, a backup taken before it is the only way back.',
      ],
    })
    // Without the migration, PostgreSQL gets the fixes alone, and the note says what --migration adds.
    expect(
      planSql({ ...result, database: { ...result.database, dialect: 'postgresql' } }).notes,
    ).toStrictEqual([
      'Put it at the top of the migration Prisma writes for the schema (`prisma migrate dev --create-only` writes one to edit), or pass that migration with --migration.',
      'Prisma runs a migration a statement at a time, with no transaction around it: if a statement fails, the ones before it, the fixes included, stay done.',
      'With --migration, the plan runs the fixes and the migration as one statement, whole or not at all.',
      'The check counted the rows as they were when it ran. Rows written since are not in it: stop what writes to these tables while the plan runs, or run `hekireki migrate check` again right before it.',
      'It deletes rows, drops what holds them or writes over values, and nothing here undoes a statement that has run: take a backup before it.',
    ])
    expect(
      result.results.filter((r) => r.kind.startsWith('delete-') && r.status !== 'passed'),
    ).toStrictEqual([])
    const database = path.join(dir, 'dev.db')
    const predicted = result.previews.map((preview) => rows(database, preview.sql))
    const copy = path.join(dir, 'fixed.db')
    copyFileSync(database, copy)
    const db = new DatabaseSync(copy)
    db.exec(planSql(result).sql)
    db.close()
    expect(predicted).toStrictEqual([
      rows(copy, 'SELECT * FROM "User" ORDER BY "id"'),
      rows(copy, 'SELECT * FROM "Post" ORDER BY "id"'),
    ])
    expect(predicted[0]).toStrictEqual([
      { id: 1, email: 'a@example.com', name: 'Ann', nickname: null, role: 'ADMIN' },
      { id: 3, email: 'b@example.com', name: 'user-VIEWER-3', nickname: null, role: 'VIEWER' },
      { id: 5, email: 'c@example.com', name: 'Eve', nickname: null, role: 'VIEWER' },
    ])
    // The fixed copy needs no fixes: every blocking check passes on its rows as they are.
    rmSync(path.join(dir, DECISIONS_FILE))
    const again = await Effect.runPromise(
      Effect.provide(
        runMigrateCheck({
          schemaPath: path.join(dir, 'schema.prisma'),
          url: 'file:./fixed.db',
          decisions: null,
          timeout: null,
          cwd: dir,
          env: {},
        }),
        fileSystemLayer,
      ),
    )
    expect(summarize(again)).toMatchObject({ blocking: 0, failed: 0, ok: true })
    // The check's own connection is read only: none of this reached the database it read.
    expect(rows(database, 'SELECT COUNT(*) AS n FROM "User"')).toStrictEqual([{ n: 5 }])
  })

  it("counts the rows the database's own ON DELETE rules change, and blocks on those it refuses", async () => {
    // Keeping the last of each email deletes user 1, and post 1 points at it: Post.authorId is
    // ON DELETE SET NULL, so the database clears it before the orphans are settled, and the
    // check reads the rows as the database leaves them.
    const dir = project(FIXABLE, OLD_DATABASE)
    decide(dir, DECISIONS)
    const result = await report(dir)
    const database = path.join(dir, 'dev.db')
    const predicted = result.previews.map((preview) => rows(database, preview.sql))
    const copy = path.join(dir, 'fixed.db')
    copyFileSync(database, copy)
    const db = new DatabaseSync(copy)
    db.exec(planSql(result).sql)
    db.close()
    expect(predicted).toStrictEqual([
      rows(copy, 'SELECT * FROM "User" ORDER BY "id"'),
      rows(copy, 'SELECT * FROM "Post" ORDER BY "id"'),
    ])
    expect(predicted[1]).toStrictEqual([
      { id: 1, title: 'p', authorId: null, views: '10' },
      { id: 3, title: 'r', authorId: null, views: 'many' },
    ])
    expect(
      result.results
        .filter((r) => r.kind.startsWith('delete-'))
        .map((r) => [r.status, r.subject, r.what, r.count]),
    ).toStrictEqual([
      ['warning', 'Post.authorId → User.email', 'ON DELETE SET NULL clears their key', 1],
    ])
    const restricted = project(
      FIXABLE,
      OLD_DATABASE.replace('ON DELETE SET NULL', 'ON DELETE RESTRICT'),
    )
    decide(restricted, DECISIONS)
    const refused = await report(restricted)
    expect(
      refused.results.filter((r) => r.kind.startsWith('delete-')).map((r) => [r.status, r.count]),
    ).toStrictEqual([['blocking', 1]])
    expect(summarize(refused).ok).toBe(false)
  })

  it('stops on a decision that names what the schema does not have', async () => {
    const dir = project(FIXABLE, OLD_DATABASE)
    decide(dir, [
      { kind: 'not-null', modelName: 'User', field: 'nmae', choice: 'value', value: 'x' },
    ])
    const exit = await check(dir)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(String(exit)).toContain('User.nmae: User has no field nmae.')
  })
})

describe('planSql with the migration Prisma wrote', () => {
  // What `prisma migrate diff --script` writes on SQLite for nickname becoming displayName and a
  // required token being added: a copy of the table that carries neither over.
  const MIGRATION = `-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "displayName" TEXT,
    "token" TEXT NOT NULL
);
INSERT INTO "new_User" ("id") SELECT "id" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
`

  it('writes the rename and the fill into the copy, and will not rewrite its own output again', async () => {
    const dir = project(
      `datasource db {
  provider = "sqlite"
}

model User {
  id          Int     @id
  displayName String?
  token       String
}
`,
      `CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY, "nickname" TEXT);
INSERT INTO "User" VALUES (1, 'ann'), (2, NULL);
`,
    )
    decide(dir, [
      {
        kind: 'column-dropped',
        modelName: 'User',
        field: 'nickname',
        choice: 'rename',
        value: 'displayName',
      },
      {
        kind: 'column-added',
        modelName: 'User',
        field: 'token',
        choice: 'sql',
        value: "'t-' || id",
      },
    ])
    const result = await report(dir)
    expect(summarize(result)).toMatchObject({ blocking: 0, ok: true })
    // Without the migration, the plan cannot make the rename or the fill.
    expect(planSql(result).errors).toHaveLength(1)
    const plan = planSql(result, { path: 'migration.sql', sql: MIGRATION })
    expect(plan).toStrictEqual({
      sql: `-- hekireki migrate plan

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "displayName" TEXT,
    "token" TEXT NOT NULL
);
INSERT INTO "new_User" ("id", "displayName", "token") SELECT "id", "nickname", ('t-' || id) FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
`,
      errors: [],
      notes: [
        'Put it in place of the migration.sql Prisma wrote.',
        'Prisma runs a migration a statement at a time, with no transaction around it: if a statement fails, the ones before it, the fixes included, stay done.',
        'The check counted the rows as they were when it ran. Rows written since are not in it: stop what writes to these tables while the plan runs, or run `hekireki migrate check` again right before it.',
      ],
    })
    const db = new DatabaseSync(path.join(dir, 'dev.db'))
    db.exec(plan.sql)
    expect(
      db
        .prepare('SELECT * FROM "User" ORDER BY "id"')
        .all()
        .map((row) => structuredClone(row)),
    ).toStrictEqual([
      { id: 1, displayName: 'ann', token: 't-1' },
      { id: 2, displayName: null, token: 't-2' },
    ])
    db.close()
    // Decisions with nothing to fix before the migration: the plan has nothing but its marker.
    expect(planSql({ ...result, fixes: [] }).notes[0]).toBe(
      'No fixes decided: nothing to run before the migration.',
    )
    expect(planSql(result, { path: 'migration.sql', sql: plan.sql }).errors).toStrictEqual([
      'migration.sql: already written by hekireki migrate plan. Pass the migration.sql Prisma wrote (`prisma migrate diff --script` writes it again).',
    ])
  })
})

describe('values moved to a related model', () => {
  // What `prisma migrate diff --script` writes on SQLite for bio and website moving from User to
  // a new Profile, and authorName moving from Post up to User: the one table created, the other
  // two copied without the columns that move.
  const MIGRATION = `-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "bio" TEXT,
    "website" TEXT,
    CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "authorName" TEXT
);
INSERT INTO "new_User" ("email", "id") SELECT "email", "id" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "new_Post" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("authorId", "id", "title") SELECT "authorId", "id", "title" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");
`

  const SCHEMA = `datasource db {
  provider = "sqlite"
}

model User {
  id         Int      @id @default(autoincrement())
  email      String   @unique
  authorName String?
  posts      Post[]
  profile    Profile?
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}

model Profile {
  id      String  @id @default(cuid())
  userId  Int     @unique
  user    User    @relation(fields: [userId], references: [id])
  bio     String?
  website String?
}
`

  const DATABASE = `
CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "email" TEXT NOT NULL, "bio" TEXT, "website" TEXT);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Post" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "title" TEXT NOT NULL, "authorName" TEXT, "authorId" INTEGER NOT NULL, CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE);
INSERT INTO "User" VALUES (1, 'ada@example.com', 'Analyst', 'https://ada.dev'), (2, 'bob@example.com', NULL, 'https://bob.dev'), (3, 'cy@example.com', NULL, NULL);
INSERT INTO "Post" VALUES (1, 'Hello', 'Ada L.', 1), (2, 'Again', 'Ada Lovelace', 1), (3, 'Hi', NULL, 2);
`

  const MOVES = [
    {
      kind: 'column-dropped',
      modelName: 'User',
      field: 'bio',
      choice: 'move',
      value: 'Profile.bio',
    },
    {
      kind: 'column-dropped',
      modelName: 'User',
      field: 'website',
      choice: 'move',
      value: 'Profile.website',
    },
    {
      kind: 'column-dropped',
      modelName: 'Post',
      field: 'authorName',
      choice: 'move',
      value: 'User.authorName',
    },
  ]

  it('keeps the values, makes the rows of the new table from them, and loses none', async () => {
    const dir = project(SCHEMA, DATABASE)
    decide(dir, MOVES)
    const result = await report(dir)
    expect(summarize(result)).toMatchObject({ blocking: 0, ok: true })
    // What would have been lost is not: the columns move, and no check says they are dropped.
    expect(result.results.filter((one) => one.kind === 'column-dropped')).toStrictEqual([])
    expect(result.fixes.map((fix) => [fix.subject, fix.kind, fix.rows])).toStrictEqual([
      ['User.authorName', 'move', 2],
      ['Profile.bio', 'move', 1],
      ['Profile.website', 'move', 2],
    ])
    // Two posts of one user name their author differently: one value is kept, and it is said.
    expect(
      result.results
        .filter((one) => one.kind === 'move-ambiguous')
        .map((one) => [one.subject, one.status, one.count]),
    ).toStrictEqual([['User.authorName', 'warning', 1]])
    // Without the migration there is nowhere to write the values into.
    expect(planSql(result).errors).toHaveLength(1)
    const plan = planSql(result, { path: 'migration.sql', sql: MIGRATION })
    expect(plan.errors).toStrictEqual([])
    const db = new DatabaseSync(path.join(dir, 'dev.db'))
    db.exec(plan.sql)
    const rows = (sql: string) =>
      db
        .prepare(sql)
        .all()
        .map((row) => structuredClone(row))
    expect(rows('SELECT "id", "email", "authorName" FROM "User" ORDER BY "id"')).toStrictEqual([
      { id: 1, email: 'ada@example.com', authorName: 'Ada L.' },
      { id: 2, email: 'bob@example.com', authorName: null },
      { id: 3, email: 'cy@example.com', authorName: null },
    ])
    // A profile for every user with something to move; none for one with nothing.
    expect(
      rows(
        'SELECT "userId", "bio", "website", length("id") > 0 AS "hasId" FROM "Profile" ORDER BY "userId"',
      ),
    ).toStrictEqual([
      { userId: 1, bio: 'Analyst', website: 'https://ada.dev', hasId: 1 },
      { userId: 2, bio: null, website: 'https://bob.dev', hasId: 1 },
    ])
    // The kept values go with the migration.
    expect(rows("SELECT name FROM sqlite_master WHERE name LIKE 'hk_%'")).toStrictEqual([])
    db.close()
  })

  it('keeps the value of the row with the smallest key that has one, in the preview and in the plan alike', async () => {
    const dir = project(
      SCHEMA,
      `${DATABASE}
DELETE FROM "Post";
INSERT INTO "Post" VALUES (1, 'Hello', NULL, 1), (2, 'Again', 'Zed', 1), (3, 'Once more', 'Ada', 1), (4, 'Hi', 'Bob', 2);
`,
    )
    decide(dir, MOVES)
    const result = await report(dir)
    const db = new DatabaseSync(path.join(dir, 'dev.db'))
    const rows = (sql: string) =>
      db
        .prepare(sql)
        .all()
        .map((row) => structuredClone(row))
    // What the check says the rows will be, read before anything is written.
    const preview = result.previews.find((one) => one.model === 'User')
    const previewed = rows(preview?.sql ?? '').map((row) => [row.id, row.authorName])
    expect(previewed).toStrictEqual([
      [1, 'Zed'],
      [2, 'Bob'],
      [3, null],
    ])
    db.exec(planSql(result, { path: 'migration.sql', sql: MIGRATION }).sql)
    expect(
      rows('SELECT "id", "authorName" FROM "User" ORDER BY "id"').map((row) => [
        row.id,
        row.authorName,
      ]),
    ).toStrictEqual(previewed)
    db.close()
  })

  it('refuses to write over the kept values a plan that did not finish left behind', async () => {
    const dir = project(
      SCHEMA,
      `${DATABASE}
CREATE TABLE "hk_move_Post_authorName" ("hk_key" INTEGER, "hk_value" TEXT);
`,
    )
    decide(dir, MOVES)
    const exit = await check(dir)
    expect(Exit.isFailure(exit) ? String(exit.cause) : '').toContain(
      'User.authorName: the database has a table hk_move_Post_authorName, left by a plan that did not finish.',
    )
  })

  it('refuses a move between models that nothing relates', async () => {
    const dir = project(
      `datasource db {
  provider = "sqlite"
}

model User {
  id Int @id
}

model Note {
  id  Int     @id
  bio String?
}
`,
      `CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY, "bio" TEXT);
CREATE TABLE "Note" ("id" INTEGER NOT NULL PRIMARY KEY);
`,
    )
    decide(dir, [
      {
        kind: 'column-dropped',
        modelName: 'User',
        field: 'bio',
        choice: 'move',
        value: 'Note.bio',
      },
    ])
    const exit = await check(dir)
    expect(Exit.isFailure(exit) ? String(exit.cause) : '').toContain(
      'Note.bio: Note and User are not related by a foreign key over one column',
    )
  })
})

describe("the database's own ON DELETE and ON UPDATE rules", () => {
  // A tree of categories: deleting the duplicate 2 takes its child 3 and grandchild 4 with it
  // (Category.parentId is ON DELETE CASCADE), their products go too (Product.categoryId is ON
  // DELETE CASCADE), and the reviews of those products lose their product (ON DELETE SET NULL).
  const TREE = `
CREATE TABLE "Category" ("id" INTEGER NOT NULL PRIMARY KEY, "slug" TEXT NOT NULL, "parentId" INTEGER, CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "Product" ("id" INTEGER NOT NULL PRIMARY KEY, "categoryId" INTEGER NOT NULL, CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "Review" ("id" INTEGER NOT NULL PRIMARY KEY, "productId" INTEGER, CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE);
INSERT INTO "Category" VALUES (1, 'a', NULL), (2, 'a', NULL), (3, 'b', 2), (4, 'c', 3), (5, 'd', 1);
INSERT INTO "Product" VALUES (1, 1), (2, 2), (3, 4), (4, 5);
INSERT INTO "Review" VALUES (1, 1), (2, 2), (3, 3), (4, NULL);
`
  const TREE_SCHEMA = `datasource db {
  provider = "sqlite"
}

model Category {
  id       Int        @id
  slug     String     @unique
  parentId Int?
  parent   Category?  @relation("tree", fields: [parentId], references: [id], onDelete: Cascade)
  children Category[] @relation("tree")
  products Product[]
}

model Product {
  id         Int      @id
  categoryId Int
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  reviews    Review[]
}

model Review {
  id        Int      @id
  productId Int?
  product   Product? @relation(fields: [productId], references: [id], onDelete: SetNull)
}
`
  const KEEP_FIRST = [
    {
      kind: 'unique',
      modelName: 'Category',
      field: 'slug',
      choice: 'keep-first-delete',
      value: null,
    },
  ]

  function rows(file: string, sql: string) {
    const db = new DatabaseSync(file)
    const found = db
      .prepare(sql)
      .all()
      .map((row) => structuredClone(row))
    db.close()
    return found
  }

  it('follows a cascade down a tree, into the tables that point at it, and a SET NULL beyond', async () => {
    const dir = project(TREE_SCHEMA, TREE)
    decide(dir, KEEP_FIRST)
    const result = await report(dir)
    expect(
      result.results
        .filter((r) => r.kind.startsWith('delete-'))
        .map((r) => [r.status, r.subject, r.what, r.count]),
    ).toStrictEqual([
      ['warning', 'Category.parentId → Category.slug', 'ON DELETE CASCADE deletes them too', 2],
      ['warning', 'Product.categoryId → Category.slug', 'ON DELETE CASCADE deletes them too', 2],
      [
        'warning',
        'Review.productId → Product.categoryId → Category.slug',
        'ON DELETE SET NULL clears their key',
        2,
      ],
    ])
    expect(summarize(result)).toMatchObject({ blocking: 0, ok: true })
    const database = path.join(dir, 'dev.db')
    const predicted = result.previews.map((preview) => [preview.model, rows(database, preview.sql)])
    const copy = path.join(dir, 'fixed.db')
    copyFileSync(database, copy)
    const db = new DatabaseSync(copy)
    db.exec(planSql(result).sql)
    db.close()
    expect(predicted).toStrictEqual(
      result.previews.map((preview) => [
        preview.model,
        rows(copy, `SELECT * FROM "${preview.model}" ORDER BY "id"`),
      ]),
    )
    expect(predicted).toStrictEqual([
      [
        'Category',
        [
          { id: 1, slug: 'a', parentId: null },
          { id: 5, slug: 'd', parentId: 1 },
        ],
      ],
      [
        'Product',
        [
          { id: 1, categoryId: 1 },
          { id: 4, categoryId: 5 },
        ],
      ],
      [
        'Review',
        [
          { id: 1, productId: 1 },
          { id: 2, productId: null },
          { id: 3, productId: null },
          { id: 4, productId: null },
        ],
      ],
    ])
  })

  it('blocks a delete a RESTRICT key refuses, as the database does when the plan runs', async () => {
    const dir = project(
      TREE_SCHEMA,
      TREE.replace(
        '"Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE',
        '"Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT',
      ),
    )
    decide(dir, KEEP_FIRST)
    const result = await report(dir)
    expect(
      result.results
        .filter((r) => r.kind === 'delete-refused')
        .map((r) => [r.status, r.subject, r.count]),
    ).toStrictEqual([['blocking', 'Product.categoryId → Category.slug', 2]])
    expect(summarize(result).ok).toBe(false)
    const db = new DatabaseSync(path.join(dir, 'dev.db'))
    expect(() => {
      db.exec(planSql(result).sql)
    }).toThrow(/FOREIGN KEY constraint failed/u)
    db.close()
  })

  it('follows a changed key down ON UPDATE CASCADE, and on to an ON UPDATE SET NULL beyond', async () => {
    // BRONZE goes from the enum and becomes SILVER in Plan.tier: the subscription on BRONZE
    // follows it (ON UPDATE CASCADE), and so its tier does not block, and the note on that
    // subscription loses its key (ON UPDATE SET NULL).
    const dir = project(
      `datasource db {
  provider = "sqlite"
}

enum Tier {
  GOLD
  SILVER
}

model Plan {
  id   Int    @id
  tier Tier   @unique
  subs Sub[]
}

model Sub {
  id    Int    @id
  tier  Tier   @unique
  plan  Plan   @relation(fields: [tier], references: [tier], onUpdate: Cascade)
  notes Note[]
}

model Note {
  id      Int   @id
  subTier Tier?
  sub     Sub?  @relation(fields: [subTier], references: [tier], onUpdate: SetNull)
}
`,
      `
CREATE TABLE "Plan" ("id" INTEGER NOT NULL PRIMARY KEY, "tier" TEXT NOT NULL);
CREATE UNIQUE INDEX "Plan_tier_key" ON "Plan"("tier");
CREATE TABLE "Sub" ("id" INTEGER NOT NULL PRIMARY KEY, "tier" TEXT NOT NULL, CONSTRAINT "Sub_tier_fkey" FOREIGN KEY ("tier") REFERENCES "Plan" ("tier") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE UNIQUE INDEX "Sub_tier_key" ON "Sub"("tier");
CREATE TABLE "Note" ("id" INTEGER NOT NULL PRIMARY KEY, "subTier" TEXT, CONSTRAINT "Note_subTier_fkey" FOREIGN KEY ("subTier") REFERENCES "Sub" ("tier") ON DELETE SET NULL ON UPDATE SET NULL);
INSERT INTO "Plan" VALUES (1, 'GOLD'), (2, 'BRONZE');
INSERT INTO "Sub" VALUES (1, 'BRONZE'), (2, 'GOLD');
INSERT INTO "Note" VALUES (1, 'BRONZE'), (2, 'GOLD'), (3, NULL);
`,
    )
    decide(dir, [
      { kind: 'enum', modelName: 'Plan', field: 'tier', choice: 'map', value: 'BRONZE=SILVER' },
    ])
    const result = await report(dir)
    expect(
      result.results
        .filter((r) => r.kind.startsWith('update-'))
        .map((r) => [r.status, r.subject, r.what, r.count]),
    ).toStrictEqual([
      ['warning', 'Sub.tier → Plan.tier', 'ON UPDATE CASCADE gives them the new key', 1],
      ['warning', 'Note.subTier → Sub.tier → Plan.tier', 'ON UPDATE SET NULL clears their key', 1],
    ])
    expect(summarize(result)).toMatchObject({ blocking: 0, ok: true })
    const database = path.join(dir, 'dev.db')
    const predicted = result.previews.map((preview) => [preview.model, rows(database, preview.sql)])
    const copy = path.join(dir, 'fixed.db')
    copyFileSync(database, copy)
    const db = new DatabaseSync(copy)
    db.exec(planSql(result).sql)
    db.close()
    expect(predicted).toStrictEqual(
      result.previews.map((preview) => [
        preview.model,
        rows(copy, `SELECT * FROM "${preview.model}" ORDER BY "id"`),
      ]),
    )
    expect(predicted).toStrictEqual([
      [
        'Plan',
        [
          { id: 1, tier: 'GOLD' },
          { id: 2, tier: 'SILVER' },
        ],
      ],
      [
        'Sub',
        [
          { id: 1, tier: 'SILVER' },
          { id: 2, tier: 'GOLD' },
        ],
      ],
      [
        'Note',
        [
          { id: 1, subTier: null },
          { id: 2, subTier: 'GOLD' },
          { id: 3, subTier: null },
        ],
      ],
    ])
  })

  it('blocks a fix that changes a value an ON UPDATE RESTRICT key points at', async () => {
    const dir = project(
      `datasource db {
  provider = "sqlite"
}

model Category {
  id       Int       @id
  slug     String?   @unique
  products Product[]
}

model Product {
  id           Int       @id
  categorySlug String?
  category     Category? @relation(fields: [categorySlug], references: [slug])
}
`,
      `
CREATE TABLE "Category" ("id" INTEGER NOT NULL PRIMARY KEY, "slug" TEXT);
CREATE UNIQUE INDEX "Category_slug_old" ON "Category"("id", "slug");
CREATE TABLE "Product" ("id" INTEGER NOT NULL PRIMARY KEY, "categorySlug" TEXT, CONSTRAINT "Product_fkey" FOREIGN KEY ("categorySlug") REFERENCES "Category" ("slug") ON DELETE SET NULL ON UPDATE RESTRICT);
INSERT INTO "Category" VALUES (1, 'a'), (2, 'a');
INSERT INTO "Product" VALUES (1, 'a');
`,
    )
    decide(dir, [
      {
        kind: 'unique',
        modelName: 'Category',
        field: 'slug',
        choice: 'keep-first-null',
        value: null,
      },
    ])
    const result = await report(dir)
    expect(
      result.results
        .filter((r) => r.kind === 'update-refused')
        .map((r) => [r.status, r.subject, r.count]),
    ).toStrictEqual([['blocking', 'Product.categorySlug → Category.slug', 1]])
  })
})

describe('what the schema does not describe: CHECK constraints and triggers', () => {
  const SCHEMA = `datasource db {
  provider = "sqlite"
}

model User {
  id   Int    @id
  name String
}
`
  // `name` turns required; the table refuses an empty name, and logs every change of one.
  const DATABASE = `
CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY, "name" TEXT CHECK ("name" <> ''));
CREATE TABLE "Log" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "note" TEXT);
CREATE TRIGGER "User_renamed" AFTER UPDATE OF "name" ON "User" BEGIN INSERT INTO "Log" ("note") VALUES (new."name"); END;
INSERT INTO "User" VALUES (1, 'Ann'), (2, NULL), (3, NULL);
`
  const filled = (value: string) => [
    { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value },
  ]

  it('blocks a fix the CHECK constraint of the table refuses, which the database would stop the plan at', async () => {
    const dir = project(SCHEMA, DATABASE)
    decide(dir, filled(''))
    const result = await report(dir)
    expect(
      result.results
        .filter((one) => one.kind === 'check-constraint')
        .map((one) => [one.subject, one.status, one.count, one.what]),
    ).toStrictEqual([
      [
        'User CHECK 1',
        'blocking',
        2,
        `the fixes leave rows the CHECK constraint refuses: "name" <> ''`,
      ],
    ])
    expect(summarize(result).ok).toBe(false)
    // And it is so: the database refuses the statement of the plan.
    const db = new DatabaseSync(path.join(dir, 'dev.db'))
    expect(() => {
      db.exec(planSql(result).sql)
    }).toThrow(/CHECK constraint failed/u)
    db.close()
  })

  it('passes a fix the constraint takes, and says the table has a trigger the checks do not follow', async () => {
    const dir = project(SCHEMA, DATABASE)
    decide(dir, filled('unknown'))
    const result = await report(dir)
    expect(
      result.results
        .filter((one) => one.kind === 'check-constraint' || one.kind === 'trigger-unfollowed')
        .map((one) => [one.kind, one.subject, one.status, one.count]),
    ).toStrictEqual([
      ['check-constraint', 'User CHECK 1', 'passed', 0],
      ['trigger-unfollowed', 'User', 'warning', 1],
    ])
    expect(summarize(result)).toMatchObject({ ok: true, blocking: 0 })
  })

  it('says what a table rebuilt by the migration loses, which SQLite drops without a word', async () => {
    const dir = project(SCHEMA, DATABASE)
    decide(dir, filled('unknown'))
    const result = await report(dir)
    const plan = planSql(result, {
      path: 'migration.sql',
      sql: `-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);
INSERT INTO "new_User" ("id", "name") SELECT "id", "name" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
`,
    })
    expect(plan.errors).toStrictEqual([])
    expect(plan.notes.filter((note) => note.startsWith('The migration rebuilds'))).toStrictEqual([
      `The migration rebuilds User: its triggers (User_renamed) and its CHECK constraints ("name" <> '') are not in the new table, and go with the old one. Write them into the migration again, after the table is renamed into place.`,
    ])
    // And it is so: once the plan has run, the trigger is gone and an empty name is taken.
    const db = new DatabaseSync(path.join(dir, 'dev.db'))
    db.exec(plan.sql)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all()).toStrictEqual(
      [],
    )
    db.exec(`INSERT INTO "User" VALUES (9, '')`)
    db.close()
  })

  it('asks nothing of a table no fix writes to', async () => {
    const dir = project(SCHEMA, DATABASE)
    const result = await report(dir)
    expect(
      result.results.filter(
        (one) => one.kind === 'check-constraint' || one.kind === 'trigger-unfollowed',
      ),
    ).toStrictEqual([])
  })
})
