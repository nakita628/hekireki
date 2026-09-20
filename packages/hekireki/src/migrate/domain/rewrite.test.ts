import { describe, expect, it } from 'vite-plus/test'

import { BLOCK_QUOTE, rewriteMigration } from './rewrite.js'

// What `prisma migrate diff --script` wrote for the change below: nickname becomes displayName,
// views turns from String to Int, EDITOR goes and WRITER comes, a required token is added.
const POSTGRES = `-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'VIEWER', 'WRITER');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
COMMIT;

-- DropIndex
DROP INDEX "User_nickname_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "nickname",
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "token" TEXT NOT NULL,
DROP COLUMN "views",
ADD COLUMN     "views" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_displayName_key" ON "User"("displayName");
`

const MYSQL = `-- DropIndex
DROP INDEX \`User_nickname_key\` ON \`User\`;

-- AlterTable
ALTER TABLE \`User\` DROP COLUMN \`nickname\`,
    ADD COLUMN \`displayName\` VARCHAR(191) NULL,
    ADD COLUMN \`score\` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN \`token\` VARCHAR(191) NOT NULL,
    MODIFY \`views\` INTEGER NULL,
    MODIFY \`role\` ENUM('ADMIN', 'VIEWER', 'WRITER') NOT NULL DEFAULT 'VIEWER';

-- CreateIndex
CREATE UNIQUE INDEX \`User_displayName_key\` ON \`User\`(\`displayName\`);
`

const SQLITE = `-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "displayName" TEXT,
    "views" INTEGER,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "token" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_User" ("id", "role", "views") SELECT "id", "role", "views" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
`

// CockroachDB: one ALTER TABLE per clause, the enum changed in place.
const COCKROACH = `-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'WRITER';
ALTER TYPE "Role"DROP VALUE 'EDITOR';

-- DropIndex
DROP INDEX "User_nickname_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "nickname";
ALTER TABLE "User" ADD COLUMN     "displayName" STRING;
ALTER TABLE "User" ADD COLUMN     "score" INT4 NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN     "token" STRING NOT NULL;
ALTER TABLE "User" DROP COLUMN "views";
ALTER TABLE "User" ADD COLUMN     "views" INT4;

-- CreateIndex
CREATE UNIQUE INDEX "User_displayName_key" ON "User"("displayName");
`

const table = { schema: null, table: 'User' }
const renames = [{ table, from: 'nickname', to: 'displayName' }]

function changes(convert: string, fill: string, enumMaps = true) {
  return [
    {
      table,
      converts: [{ column: 'views', sql: convert }],
      enumMaps: enumMaps
        ? [
            {
              column: 'role',
              type: 'Role',
              mapping: [{ from: 'EDITOR', to: 'WRITER' }],
              existing: ['ADMIN', 'EDITOR', 'VIEWER'],
              members: ['ADMIN', 'VIEWER', 'WRITER'],
            },
          ]
        : [],
      fills: [{ column: 'token', sql: fill }],
    },
  ]
}

/** The comment lines of a script, in order. */
function commentsOf(sql: string) {
  return sql
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('--'))
}

/** The rewrite keeps Prisma's comments where they were, and writes none of its own. */
function expectPrismaComments(migration: string, sql: string) {
  expect(commentsOf(sql)).toStrictEqual(commentsOf(migration))
}

describe('rewriteMigration', () => {
  it('writes the rename, the conversion, the fill and the mapped cast into the PostgreSQL migration', () => {
    const { sql, errors, transaction } = rewriteMigration({
      dialect: 'postgresql',
      migration: POSTGRES,
      renames,
      tables: changes("CAST(NULLIF(views, '') AS INTEGER)", `('t-' || id)`),
      nullable: () => false,
    })
    expect(errors).toStrictEqual([])
    // One statement for the caller to put around it: Prisma's own BEGIN and COMMIT go, and the
    // comment above the BEGIN stays with the statement after it.
    expect(transaction).toBe(true)
    expectPrismaComments(POSTGRES, sql)
    expect(sql).toBe(`-- AlterEnum
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'VIEWER', 'WRITER');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (CASE "role"::text WHEN 'EDITOR' THEN 'WRITER' ELSE "role"::text END)::"Role_new";
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'VIEWER';

-- DropIndex
DROP INDEX "User_nickname_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "token" TEXT;
UPDATE "User" SET "token" = ('t-' || id);
ALTER TABLE "User" ALTER COLUMN "views" DROP DEFAULT, ALTER COLUMN "views" SET DATA TYPE INTEGER USING (CAST(NULLIF(views, '') AS INTEGER)), ALTER COLUMN "views" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "nickname" DROP DEFAULT, ALTER COLUMN "nickname" SET DATA TYPE TEXT;
ALTER TABLE "User" RENAME COLUMN "nickname" TO "displayName";
ALTER TABLE "User" ALTER COLUMN "displayName" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ALTER COLUMN "token" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_displayName_key" ON "User"("displayName");
`)
  })

  it('writes CHANGE COLUMN, the conversion before the MODIFY and a widened ENUM into the MySQL migration', () => {
    const { sql, errors, transaction } = rewriteMigration({
      dialect: 'mysql',
      migration: MYSQL,
      renames,
      tables: changes("CAST(NULLIF(views, '') AS SIGNED)", "CONCAT('t-', id)"),
      nullable: () => false,
    })
    expect(errors).toStrictEqual([])
    // MySQL commits each change of a table as it runs: no one statement to make of it.
    expect(transaction).toBe(false)
    expectPrismaComments(MYSQL, sql)
    expect(sql).toBe(`-- DropIndex
DROP INDEX \`User_nickname_key\` ON \`User\`;

-- AlterTable
ALTER TABLE \`User\` ADD COLUMN \`token\` VARCHAR(191) NULL;
UPDATE \`User\` SET \`token\` = CONCAT('t-', id);
ALTER TABLE \`User\` MODIFY \`role\` ENUM('ADMIN', 'EDITOR', 'VIEWER', 'WRITER') NOT NULL;
UPDATE \`User\` SET \`role\` = CASE \`role\` WHEN 'EDITOR' THEN 'WRITER' ELSE \`role\` END WHERE \`role\` IN ('EDITOR');
UPDATE \`User\` SET \`views\` = (CAST(NULLIF(views, '') AS SIGNED));
ALTER TABLE \`User\` ADD COLUMN \`score\` INTEGER NOT NULL DEFAULT 0,
    MODIFY \`views\` INTEGER NULL,
    MODIFY \`role\` ENUM('ADMIN', 'VIEWER', 'WRITER') NOT NULL DEFAULT 'VIEWER',
    CHANGE COLUMN \`nickname\` \`displayName\` VARCHAR(191) NULL;
ALTER TABLE \`User\` MODIFY \`token\` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX \`User_displayName_key\` ON \`User\`(\`displayName\`);
`)
  })

  it('carries the renamed, converted and filled columns over in the copy SQLite makes of the table', () => {
    const { sql, errors, transaction } = rewriteMigration({
      dialect: 'sqlite',
      migration: SQLITE,
      renames,
      tables: changes("CAST(NULLIF(views, '') AS INTEGER)", `('t-' || id)`, false),
      nullable: () => false,
    })
    expect(errors).toStrictEqual([])
    expect(transaction).toBe(false)
    expectPrismaComments(SQLITE, sql)
    expect(sql).toBe(`-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "displayName" TEXT,
    "views" INTEGER,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "token" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_User" ("id", "role", "views", "displayName", "token") SELECT "id", "role", (CAST(NULLIF(views, '') AS INTEGER)), "nickname", ('t-' || id) FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
`)
  })

  it('fills a nullable column SQLite adds in place right after the ALTER TABLE', () => {
    const migration = `-- AlterTable
ALTER TABLE "User" ADD COLUMN "token" TEXT;
`
    const { sql, errors } = rewriteMigration({
      dialect: 'sqlite',
      migration,
      renames: [],
      tables: [
        { table, converts: [], enumMaps: [], fills: [{ column: 'token', sql: "'t-' || id" }] },
      ],
      nullable: () => true,
    })
    expect(errors).toStrictEqual([])
    expectPrismaComments(migration, sql)
    expect(sql).toBe(`-- AlterTable
ALTER TABLE "User" ADD COLUMN "token" TEXT;
UPDATE "User" SET "token" = 't-' || id;
`)
  })

  it('maps the enum between the ADD VALUE and the DROP VALUE of CockroachDB, and writes one clause per ALTER TABLE', () => {
    const { sql, errors, transaction } = rewriteMigration({
      dialect: 'postgresql',
      cockroach: true,
      migration: COCKROACH,
      renames,
      tables: changes("CAST(NULLIF(views, '') AS INT4)", `('t-' || id::STRING)`),
      nullable: () => false,
    })
    expect(errors).toStrictEqual([])
    // CockroachDB runs a migration a statement at a time.
    expect(transaction).toBe(false)
    expectPrismaComments(COCKROACH, sql)
    expect(sql).toBe(`-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'WRITER';
UPDATE "User" SET "role" = CASE "role"::STRING WHEN 'EDITOR' THEN 'WRITER' ELSE "role"::STRING END::"Role" WHERE "role"::STRING IN ('EDITOR');
ALTER TYPE "Role"DROP VALUE 'EDITOR';

-- DropIndex
DROP INDEX "User_nickname_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "token" STRING;
UPDATE "User" SET "token" = ('t-' || id::STRING);
ALTER TABLE "User" ALTER COLUMN "views" DROP DEFAULT;
SET use_declarative_schema_changer = on;
ALTER TABLE "User" ALTER COLUMN "views" SET DATA TYPE INT4 USING (CAST(NULLIF(views, '') AS INT4));
SET use_declarative_schema_changer = off;
ALTER TABLE "User" ALTER COLUMN "views" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "nickname" DROP DEFAULT;
SET use_declarative_schema_changer = on;
ALTER TABLE "User" ALTER COLUMN "nickname" SET DATA TYPE STRING;
SET use_declarative_schema_changer = off;
ALTER TABLE "User" RENAME COLUMN "nickname" TO "displayName";
ALTER TABLE "User" ALTER COLUMN "displayName" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN     "score" INT4 NOT NULL DEFAULT 0;
ALTER TABLE "User" ALTER COLUMN "token" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_displayName_key" ON "User"("displayName");
`)
  })

  it('puts the declarative schema changer around a change of type Prisma writes on CockroachDB, keeping its comment first', () => {
    const migration = `-- AlterTable
ALTER TABLE "User" ALTER COLUMN "score" SET DATA TYPE INT4;
`
    const { sql } = rewriteMigration({
      dialect: 'postgresql',
      cockroach: true,
      migration,
      renames: [],
      tables: [],
      nullable: () => false,
    })
    expectPrismaComments(migration, sql)
    expect(sql).toBe(`-- AlterTable
SET use_declarative_schema_changer = on;
ALTER TABLE "User" ALTER COLUMN "score" SET DATA TYPE INT4;
SET use_declarative_schema_changer = off;
`)
  })

  describe('one statement on PostgreSQL', () => {
    const run = (migration: string, fill = "'x'") =>
      rewriteMigration({
        dialect: 'postgresql',
        migration,
        renames: [],
        tables: [{ table, converts: [], enumMaps: [], fills: [{ column: 'token', sql: fill }] }],
        nullable: () => false,
      })
    const ADD_TOKEN = 'ALTER TABLE "User" ADD COLUMN     "token" TEXT NOT NULL;\n'

    it('holds a migration of schema changes and writes', () => {
      expect(run(ADD_TOKEN).transaction).toBe(true)
    })

    it('does not hold an enum value added, which PostgreSQL cannot use in the transaction that adds it', () => {
      const migration = `-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'WRITER';

-- AlterTable
${ADD_TOKEN}`
      const { sql, transaction } = run(migration)
      expect(transaction).toBe(false)
      expectPrismaComments(migration, sql)
    })

    it('does not hold an index made CONCURRENTLY', () => {
      expect(
        run(`${ADD_TOKEN}CREATE INDEX CONCURRENTLY "User_token_idx" ON "User"("token");\n`)
          .transaction,
      ).toBe(false)
    })

    it('does not hold a SELECT, which a DO block does not run as it is', () => {
      expect(run(`${ADD_TOKEN}SELECT setval('"User_id_seq"', 10);\n`).transaction).toBe(false)
    })

    it('does not hold SQL with the quote of the block in it', () => {
      expect(run(ADD_TOKEN, `${BLOCK_QUOTE}x${BLOCK_QUOTE}`).transaction).toBe(false)
    })

    it("keeps Prisma's BEGIN and COMMIT where the migration is not held as one statement", () => {
      const migration = `-- AlterEnum
ALTER TYPE "Tier" ADD VALUE 'GOLD';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'VIEWER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
COMMIT;
`
      const { sql, transaction } = rewriteMigration({
        dialect: 'postgresql',
        migration,
        renames: [],
        tables: [],
        nullable: () => false,
      })
      expect(transaction).toBe(false)
      expect(sql).toBe(migration)
    })
  })

  it('quotes the names it writes as the database needs them, a schema of their own included', () => {
    const inAuth = { schema: 'auth', table: 'Us"er' }
    const migration = `-- AlterTable
ALTER TABLE "auth"."Us""er" DROP COLUMN "ni""ck",
ADD COLUMN     "display name" TEXT;
`
    const { sql, errors } = rewriteMigration({
      dialect: 'postgresql',
      migration,
      renames: [{ table: inAuth, from: 'ni"ck', to: 'display name' }],
      tables: [],
      nullable: () => false,
    })
    expect(errors).toStrictEqual([])
    expectPrismaComments(migration, sql)
    expect(sql).toBe(`-- AlterTable
ALTER TABLE "auth"."Us""er" ALTER COLUMN "ni""ck" DROP DEFAULT, ALTER COLUMN "ni""ck" SET DATA TYPE TEXT;
ALTER TABLE "auth"."Us""er" RENAME COLUMN "ni""ck" TO "display name";
ALTER TABLE "auth"."Us""er" ALTER COLUMN "display name" DROP NOT NULL;
`)
  })

  it('renames several columns of one table and another, and converts one it renames', () => {
    const post = { schema: null, table: 'Post' }
    const migration = `-- AlterTable
ALTER TABLE "Post" DROP COLUMN "body",
ADD COLUMN     "content" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "nickname",
DROP COLUMN "views",
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "viewCount" INTEGER;
`
    const { sql, errors } = rewriteMigration({
      dialect: 'postgresql',
      migration,
      renames: [
        { table, from: 'nickname', to: 'displayName' },
        { table, from: 'views', to: 'viewCount' },
        { table: post, from: 'body', to: 'content' },
      ],
      tables: [
        {
          table,
          converts: [{ column: 'views', sql: "CAST(NULLIF(views, '') AS INTEGER)" }],
          enumMaps: [],
          fills: [],
        },
      ],
      nullable: () => false,
    })
    expect(errors).toStrictEqual([])
    expectPrismaComments(migration, sql)
    expect(sql).toBe(`-- AlterTable
ALTER TABLE "Post" ALTER COLUMN "body" DROP DEFAULT, ALTER COLUMN "body" SET DATA TYPE TEXT;
ALTER TABLE "Post" RENAME COLUMN "body" TO "content";
ALTER TABLE "Post" ALTER COLUMN "content" SET NOT NULL, ALTER COLUMN "content" SET DEFAULT '';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "nickname" DROP DEFAULT, ALTER COLUMN "nickname" SET DATA TYPE TEXT;
ALTER TABLE "User" RENAME COLUMN "nickname" TO "displayName";
ALTER TABLE "User" ALTER COLUMN "displayName" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "views" DROP DEFAULT, ALTER COLUMN "views" SET DATA TYPE INTEGER USING (CAST(NULLIF(views, '') AS INTEGER));
ALTER TABLE "User" RENAME COLUMN "views" TO "viewCount";
ALTER TABLE "User" ALTER COLUMN "viewCount" DROP NOT NULL;
`)
  })

  it('converts a column MySQL renames before CHANGE COLUMN changes its type', () => {
    const migration = `-- AlterTable
ALTER TABLE \`User\` DROP COLUMN \`views\`,
    ADD COLUMN \`viewCount\` INTEGER NULL;
`
    const { sql, errors } = rewriteMigration({
      dialect: 'mysql',
      migration,
      renames: [{ table, from: 'views', to: 'viewCount' }],
      tables: [
        {
          table,
          converts: [{ column: 'views', sql: "CAST(NULLIF(views, '') AS SIGNED)" }],
          enumMaps: [],
          fills: [],
        },
      ],
      nullable: () => false,
    })
    expect(errors).toStrictEqual([])
    expectPrismaComments(migration, sql)
    expect(sql).toBe(`-- AlterTable
UPDATE \`User\` SET \`views\` = (CAST(NULLIF(views, '') AS SIGNED));
ALTER TABLE \`User\` CHANGE COLUMN \`views\` \`viewCount\` INTEGER NULL;
`)
  })

  it('writes enum values with quotes and backslashes as MySQL reads them', () => {
    const migration = `-- AlterTable
ALTER TABLE \`User\` MODIFY \`tag\` ENUM('a', 'd\\\\e') NOT NULL;
`
    const { sql, errors } = rewriteMigration({
      dialect: 'mysql',
      migration,
      renames: [],
      tables: [
        {
          table,
          converts: [],
          enumMaps: [
            {
              column: 'tag',
              type: 'Tag',
              mapping: [{ from: "b'c", to: 'd\\e' }],
              existing: ['a', "b'c"],
              members: ['a', 'd\\e'],
            },
          ],
          fills: [],
        },
      ],
      nullable: () => false,
    })
    expect(errors).toStrictEqual([])
    expect(sql).toBe(`-- AlterTable
ALTER TABLE \`User\` MODIFY \`tag\` ENUM('a', 'b''c', 'd\\\\e') NOT NULL;
UPDATE \`User\` SET \`tag\` = CASE \`tag\` WHEN 'b''c' THEN 'd\\\\e' ELSE \`tag\` END WHERE \`tag\` IN ('b''c');
ALTER TABLE \`User\` MODIFY \`tag\` ENUM('a', 'd\\\\e') NOT NULL;
`)
  })

  it('leaves a migration with nothing to rewrite as Prisma wrote it, an empty one included', () => {
    const empty = '-- This is an empty migration.\n'
    for (const dialect of ['postgresql', 'mysql', 'sqlite'] as const) {
      const { sql, errors } = rewriteMigration({
        dialect,
        migration: empty,
        renames: [],
        tables: [],
        nullable: () => false,
      })
      expect(errors).toStrictEqual([])
      expect(sql).toBe(empty)
    }
    // A comment after the last statement keeps its place and gets no semicolon.
    const trailing = 'DROP INDEX "User_nickname_key";\n\n-- The end\n'
    expect(
      rewriteMigration({
        dialect: 'postgresql',
        migration: trailing,
        renames: [],
        tables: [],
        nullable: () => false,
      }).sql,
    ).toBe(trailing)
    for (const [dialect, migration] of [
      ['postgresql', POSTGRES],
      ['mysql', MYSQL],
      ['sqlite', SQLITE],
    ] as const) {
      const { sql } = rewriteMigration({
        dialect,
        migration,
        renames: [],
        tables: [],
        nullable: () => false,
      })
      expectPrismaComments(migration, sql)
    }
  })

  it('says what it cannot find, rather than rewriting a migration that is not the one for the schema', () => {
    const { errors } = rewriteMigration({
      dialect: 'postgresql',
      migration: 'ALTER TABLE "User" ADD COLUMN "other" TEXT;\n',
      renames,
      tables: changes('views::int', "'x'"),
      nullable: () => false,
    })
    expect(errors).toStrictEqual([
      'rename "User".nickname to displayName: no DROP COLUMN nickname and ADD COLUMN displayName in one ALTER TABLE',
      'fill "User".token: no ADD COLUMN token',
      'convert "User".views: no change of its type',
      'map "User".role: no change of its enum',
    ])
    expect(
      rewriteMigration({
        dialect: 'mysql',
        migration: 'ALTER TABLE `User` ADD COLUMN `other` TEXT;\n',
        renames,
        tables: changes('views', "'x'"),
        nullable: () => false,
      }).errors,
    ).toStrictEqual([
      'rename `User`.nickname to displayName: no DROP COLUMN nickname and ADD COLUMN displayName in one ALTER TABLE',
      'fill `User`.token: no ADD COLUMN token',
      'convert `User`.views: no change of its type',
      'map `User`.role: no change of its enum',
    ])
    expect(
      rewriteMigration({
        dialect: 'sqlite',
        migration: 'CREATE TABLE "Other" ("id" INTEGER NOT NULL PRIMARY KEY);\n',
        renames,
        tables: changes('views', "'x'", false),
        nullable: () => false,
      }).errors,
    ).toStrictEqual([
      'rename "User".nickname to displayName: Prisma does not copy "User"',
      'fill "User".token: no copy of "User" and no ADD COLUMN token',
      'convert "User".views: Prisma does not copy "User"',
    ])
  })
})
