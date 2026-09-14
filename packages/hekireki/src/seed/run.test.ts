import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../file/index.js'
import { runSeed, seedBanner } from './run.js'
import type { SeedOverrides, SeedReport } from './run.js'

const SCHEMA = `datasource db {
  provider = "sqlite"
}

enum Role {
  ADMIN
  VIEWER
}

model User {
  id        Int       @id @default(autoincrement())
  email     String    @unique
  name      String?
  role      Role      @default(VIEWER)
  createdAt DateTime  @default(now())
  posts     Post[]
}

model Post {
  id       Int     @id @default(autoincrement())
  title    String
  authorId Int
  author   User    @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
`

const DDL = `
CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "email" TEXT NOT NULL, "name" TEXT, "role" TEXT NOT NULL DEFAULT 'VIEWER', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Post" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "title" TEXT NOT NULL, "authorId" INTEGER NOT NULL, CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
`

const NONE: SeedOverrides = {
  config: null,
  schema: null,
  url: null,
  output: null,
  seed: null,
  count: null,
  locale: null,
  reset: false,
}

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A project directory with the schema, an empty SQLite database and, when given, a config. */
function project(config: string | null) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-seed-run-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'schema.prisma'), SCHEMA)
  const db = new DatabaseSync(path.join(dir, 'dev.db'))
  db.exec(DDL)
  db.close()
  if (config !== null) writeFileSync(path.join(dir, 'hekireki.config.mjs'), config)
  return dir
}

function run(overrides: Partial<SeedOverrides>, cwd: string) {
  return Effect.runPromiseExit(
    runSeed({ ...NONE, ...overrides }, cwd).pipe(Effect.provide(fileSystemLayer)),
  )
}

function counts(dir: string) {
  const db = new DatabaseSync(path.join(dir, 'dev.db'))
  const row = db
    .prepare(
      'SELECT (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Post") AS posts',
    )
    .get()
  const orphans = db
    .prepare('SELECT count(*) AS n FROM "Post" WHERE "authorId" NOT IN (SELECT "id" FROM "User")')
    .get()
  db.close()
  return { ...row, orphans: orphans?.n }
}

function failure(exit: Exit.Exit<unknown, unknown>) {
  if (!Exit.isFailure(exit)) throw new Error('expected a failure')
  return String(exit.cause)
}

describe('runSeed', () => {
  it('reads hekireki.config.mjs next to the schema and inserts into the database', async () => {
    const dir = project(`export default {
  schema: 'schema.prisma',
  seed: 5,
  count: 4,
  models: { User: { count: 3, fields: { role: { values: ['ADMIN'] } } } },
}
`)
    const exit = await run({ url: 'file:./dev.db' }, dir)
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.tables).toStrictEqual([
      { name: 'User', table: 'User', rows: 3 },
      { name: 'Post', table: 'Post', rows: 4 },
    ])
    expect(exit.value.target).toStrictEqual({
      kind: 'database',
      dialect: 'sqlite',
      url: 'file:./dev.db',
    })
    expect(exit.value.configPath).toBe(path.join(dir, 'hekireki.config.mjs'))
    expect(counts(dir)).toStrictEqual({ users: 3, posts: 4, orphans: 0 })
    const db = new DatabaseSync(path.join(dir, 'dev.db'))
    expect(
      db
        .prepare('SELECT DISTINCT role FROM "User"')
        .all()
        .map((row) => row.role),
    ).toStrictEqual(['ADMIN'])
    db.close()
  })

  it('refuses to insert twice without --reset and empties the tables with it', async () => {
    const dir = project(null)
    expect(Exit.isSuccess(await run({ url: 'file:./dev.db', count: 2 }, dir))).toBe(true)
    const again = await run({ url: 'file:./dev.db', count: 2 }, dir)
    expect(failure(again)).toContain(
      'The tables already hold rows; pass --reset to empty the seeded tables first.',
    )
    expect(counts(dir)).toStrictEqual({ users: 2, posts: 2, orphans: 0 })
    expect(Exit.isSuccess(await run({ url: 'file:./dev.db', count: 3, reset: true }, dir))).toBe(
      true,
    )
    expect(counts(dir)).toStrictEqual({ users: 3, posts: 3, orphans: 0 })
  })

  it('writes through the Prisma Client the config returns, in one transaction', async () => {
    const dir = project(`import { writeFileSync } from 'node:fs'
const delegate = (model) => ({
  createMany: (args) => ({ op: 'createMany', model, rows: args.data.length }),
  deleteMany: () => ({ op: 'deleteMany', model }),
  update: (args) => ({ op: 'update', model, args }),
})
export default {
  schema: 'schema.prisma',
  count: 3,
  reset: true,
  client: () => ({
    $transaction: async (operations) => {
      writeFileSync(new URL('./operations.json', import.meta.url), JSON.stringify(operations))
    },
    $executeRawUnsafe: (sql) => ({ op: 'raw', sql }),
    $disconnect: async () => {},
    user: delegate('User'),
    post: delegate('Post'),
  }),
}
`)
    const exit = await run({}, dir)
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.target).toStrictEqual({ kind: 'client', models: 2, operations: 4 })
    expect(JSON.parse(readFileSync(path.join(dir, 'operations.json'), 'utf8'))).toStrictEqual([
      { op: 'deleteMany', model: 'Post' },
      { op: 'deleteMany', model: 'User' },
      { op: 'createMany', model: 'User', rows: 3 },
      { op: 'createMany', model: 'Post', rows: 3 },
    ])
    expect(counts(dir)).toStrictEqual({ users: 0, posts: 0, orphans: 0 })
  })

  it('writes a SQL file instead when --sql is given, the same for the same seed', async () => {
    const dir = project(null)
    const first = await run({ output: 'out/seed.sql', seed: 3, count: 2 }, dir)
    expect(Exit.isSuccess(first)).toBe(true)
    if (!Exit.isSuccess(first)) return
    expect(first.value.target).toStrictEqual({ kind: 'sql', path: path.join(dir, 'out/seed.sql') })
    const sql = readFileSync(path.join(dir, 'out/seed.sql'), 'utf8')
    expect(
      sql.startsWith('-- Generated by hekireki seed (seed 3, locale en)\n-- User: 2, Post: 2\n'),
    ).toBe(true)
    expect(counts(dir)).toStrictEqual({ users: 0, posts: 0, orphans: 0 })
    const db = new DatabaseSync(path.join(dir, 'dev.db'))
    db.exec(sql)
    db.close()
    expect(counts(dir)).toStrictEqual({ users: 2, posts: 2, orphans: 0 })
    await run({ output: 'out/again.sql', seed: 3, count: 2 }, dir)
    expect(readFileSync(path.join(dir, 'out/again.sql'), 'utf8')).toBe(sql)
  })

  it('lets the command line override the config, locale included', async () => {
    const dir = project(
      `export default { schema: 'schema.prisma', seed: 1, count: 9, locale: 'en' }\n`,
    )
    const exit = await run({ output: 'seed.sql', seed: 2, count: 1, locale: 'ja, en' }, dir)
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.seed).toBe(2)
    expect(exit.value.locale).toStrictEqual(['ja', 'en'])
    expect(exit.value.tables.map((t) => t.rows)).toStrictEqual([1, 1])
  })

  it('explains a missing schema, a missing database and an unknown locale', async () => {
    const dir = project(null)
    expect(failure(await run({ schema: 'nope.prisma' }, dir))).toContain(
      'Schema not found: nope.prisma',
    )
    expect(failure(await run({ output: 'seed.sql', locale: 'xx' }, dir))).toContain(
      'Unknown faker locale: xx.',
    )
    const empty = mkdtempSync(path.join(tmpdir(), 'hekireki-seed-empty-'))
    dirs.push(empty)
    expect(failure(await run({ output: 'seed.sql' }, empty))).toContain(
      'No Prisma schema found (looked for prisma/schema.prisma, schema.prisma).',
    )
    writeFileSync(path.join(empty, 'schema.prisma'), SCHEMA)
    expect(failure(await run({ schema: 'schema.prisma' }, empty))).toContain(
      'Pass --url <connection-string>, or --sql <file> to write the rows as SQL instead.',
    )
  })
})

describe('seedBanner', () => {
  it('lists the target and every table with its row count', () => {
    const report: SeedReport = {
      seed: 42,
      locale: ['ja', 'en'],
      schemaPath: '/app/prisma/schema.prisma',
      configPath: '/app/hekireki.config.ts',
      tables: [
        { name: 'User', table: 'users', rows: 100 },
        { name: 'Post', table: 'posts', rows: 2500 },
      ],
      target: { kind: 'database', dialect: 'postgresql', url: 'postgresql://app@localhost/app' },
    }
    expect(seedBanner(report)).toBe(
      `⚡️ Seeded 2600 rows (seed 42, locale ja, en)
   Schema: /app/prisma/schema.prisma
   Config: /app/hekireki.config.ts
   Database: postgresql postgresql://app@localhost/app
   User     100 rows
   Post    2500 rows`,
    )
    expect(
      seedBanner({ ...report, configPath: null, target: { kind: 'sql', path: '/app/seed.sql' } }),
    ).toBe(
      `⚡️ Seeded 2600 rows (seed 42, locale ja, en)
   Schema: /app/prisma/schema.prisma
   SQL: /app/seed.sql
   User     100 rows
   Post    2500 rows`,
    )
    expect(
      seedBanner({ ...report, target: { kind: 'client', models: 2, operations: 5 } }),
    ).toContain('   Prisma Client: 5 writes in one transaction')
  })
})
