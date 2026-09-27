import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

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

const CLIENT_GENERATOR = `
generator client {
  provider = "prisma-client"
  output   = "generated/client"
}
`

/**
 * A config whose \`client\` records every operation of the transaction into operations.json, so a
 * test reads what would have been written. \`fail\` makes the transaction throw as Prisma does on a
 * unique constraint unless a deleteMany came first.
 */
function recordingConfig(options: string, fail = false) {
  return `import { writeFileSync } from 'node:fs'
const delegate = (model) => ({
  createMany: (args) => ({ op: 'createMany', model, rows: args.data.map((row) => ({ ...row, createdAt: undefined })) }),
  deleteMany: () => ({ op: 'deleteMany', model }),
  update: (args) => ({ op: 'update', model, args }),
})
export default {
  schema: 'schema.prisma',
  ${options}
  client: () => ({
    $transaction: async (operations) => {
      if (${String(fail)} && !operations.some((op) => op.op === 'deleteMany')) {
        throw new Error('Unique constraint failed on the fields: (\`email\`)')
      }
      writeFileSync(new URL('./operations.json', import.meta.url), JSON.stringify(operations))
    },
    $executeRawUnsafe: (sql) => ({ op: 'raw', sql }),
    $disconnect: async () => {},
    user: delegate('User'),
    post: delegate('Post'),
  }),
}
`
}

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

/** A project directory with the schema and, when given, a config. */
function project(config: string | null, schema = SCHEMA) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-seed-run-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'schema.prisma'), schema)
  if (config !== null) writeFileSync(path.join(dir, 'hekireki.config.ts'), config)
  return dir
}

function run(overrides: Partial<SeedOverrides>, cwd: string) {
  return Effect.runPromiseExit(
    runSeed({ ...NONE, ...overrides }, cwd).pipe(Effect.provide(NodeFileSystem.layer)),
  )
}

function operations(dir: string) {
  const recorded: { op: string; model: string; rows?: Record<string, unknown>[] }[] = JSON.parse(
    readFileSync(path.join(dir, 'operations.json'), 'utf8'),
  )
  return recorded
}

function failure(exit: Exit.Exit<unknown, unknown>) {
  if (!Exit.isFailure(exit)) throw new Error('expected a failure')
  return String(exit.cause)
}

describe('runSeed', () => {
  it('reads hekireki.config.ts next to the schema and writes through the client it returns, in one transaction', async () => {
    const dir = project(
      recordingConfig(`seed: 5,
  count: 4,
  models: { User: { count: 3, fields: { role: { values: ['ADMIN'] } } } },`),
    )
    const exit = await run({}, dir)
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.tables).toStrictEqual([
      { name: 'User', table: 'User', rows: 3 },
      { name: 'Post', table: 'Post', rows: 4 },
    ])
    expect(exit.value.target).toStrictEqual({
      kind: 'client',
      source: 'config',
      models: 2,
      operations: 2,
    })
    expect(exit.value.configPath).toBe(path.join(dir, 'hekireki.config.ts'))
    const [users, posts] = operations(dir)
    expect(users?.op).toBe('createMany')
    expect(users?.rows?.map((row) => row.role)).toStrictEqual(['ADMIN', 'ADMIN', 'ADMIN'])
    expect(users?.rows?.map((row) => row.id)).toStrictEqual([1, 2, 3])
    expect(posts?.op).toBe('createMany')
    expect(posts?.rows?.every((row) => [1, 2, 3].includes(Number(row.authorId)))).toBe(true)
    expect(posts?.rows).toHaveLength(4)
  })

  it('appends the --reset hint to a unique constraint failure, and deletes children first with it', async () => {
    const dir = project(recordingConfig('count: 2,', true))
    expect(failure(await run({}, dir))).toContain(
      'Unique constraint failed on the fields: (`email`)\n   The tables already hold rows; pass --reset to empty the seeded tables first.',
    )
    const reset = await run({ reset: true }, dir)
    expect(Exit.isSuccess(reset)).toBe(true)
    expect(operations(dir).map((op) => [op.op, op.model])).toStrictEqual([
      ['deleteMany', 'Post'],
      ['deleteMany', 'User'],
      ['createMany', 'User'],
      ['createMany', 'Post'],
    ])
  })

  it('finds the generated Prisma Client and the project adapter from the schema, and writes through them', async () => {
    const dir = project(
      `export default { schema: 'schema.prisma', count: 2, reset: true }\n`,
      `${SCHEMA}${CLIENT_GENERATOR}`,
    )
    // A stand-in for what \`prisma generate\` writes: TypeScript, importing a sibling without an extension.
    mkdirSync(path.join(dir, 'generated', 'client'), { recursive: true })
    writeFileSync(
      path.join(dir, 'generated', 'client', 'enums.ts'),
      `export const Role = { ADMIN: 'ADMIN', VIEWER: 'VIEWER' } as const\n`,
    )
    writeFileSync(
      path.join(dir, 'generated', 'client', 'client.ts'),
      `import { writeFileSync } from 'node:fs'
import { Role } from './enums'
const delegate = (model: string) => ({
  createMany: (args: { data: readonly unknown[] }) => ({ op: 'createMany', model, rows: args.data.length }),
  deleteMany: () => ({ op: 'deleteMany', model }),
  update: (args: unknown) => ({ op: 'update', model, args }),
})
export class PrismaClient {
  readonly adapter: unknown
  readonly user = delegate('User')
  readonly post = delegate('Post')
  constructor(options: { adapter: unknown }) {
    this.adapter = options.adapter
  }
  $transaction(operations: readonly unknown[]) {
    writeFileSync(new URL('../../operations.json', import.meta.url), JSON.stringify({ roles: Object.keys(Role), adapter: this.adapter, operations }))
    return Promise.resolve(operations)
  }
  $executeRawUnsafe(sql: string) {
    return { op: 'raw', sql }
  }
  $disconnect() {
    return Promise.resolve()
  }
}
`,
    )
    // The adapter package the project would have installed.
    const adapter = path.join(dir, 'node_modules', '@prisma', 'adapter-better-sqlite3')
    mkdirSync(adapter, { recursive: true })
    writeFileSync(
      path.join(adapter, 'package.json'),
      JSON.stringify({ name: '@prisma/adapter-better-sqlite3', type: 'module', main: 'index.js' }),
    )
    writeFileSync(
      path.join(adapter, 'index.js'),
      `export class PrismaBetterSqlite3 { constructor(config) { this.kind = 'better-sqlite3'; this.url = config.url } }\n`,
    )
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'project', type: 'module' }),
    )
    const exit = await run({ url: 'file:./dev.db' }, dir)
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.target).toStrictEqual({
      kind: 'client',
      source: 'generated/client',
      models: 2,
      operations: 4,
    })
    const recorded: unknown = JSON.parse(readFileSync(path.join(dir, 'operations.json'), 'utf8'))
    expect(recorded).toStrictEqual({
      roles: ['ADMIN', 'VIEWER'],
      adapter: { kind: 'better-sqlite3', url: path.join(dir, 'dev.db') },
      operations: [
        { op: 'deleteMany', model: 'Post' },
        { op: 'deleteMany', model: 'User' },
        { op: 'createMany', model: 'User', rows: 2 },
        { op: 'createMany', model: 'Post', rows: 2 },
      ],
    })
  })

  it('stops with the way out when the schema has no client generator, or its output is not there', async () => {
    const plain = project(`export default { schema: 'schema.prisma', count: 1 }\n`)
    expect(failure(await run({ url: 'file:./dev.db' }, plain))).toContain(
      'Prisma Client not found: no prisma-client generator in the schema.\n   Add a `prisma-client` generator to the schema and run `prisma generate`, install @prisma/adapter-better-sqlite3, set `client` in hekireki.config.ts, or pass --sql <file> to write the rows as a script instead.',
    )
    const missingClient = project(
      `export default { schema: 'schema.prisma', count: 1 }\n`,
      `${SCHEMA}${CLIENT_GENERATOR}`,
    )
    const message = failure(await run({ url: 'file:./dev.db' }, missingClient))
    expect(message).toContain(
      'Prisma Client not found: the Prisma Client at generated/client could not be loaded (Cannot find module',
    )
    expect(message).toContain('run `prisma generate`')
  })

  it('stops when no place names a database URL, pointing at --sql as the alternative', async () => {
    const dir = project(
      `export default { schema: 'schema.prisma', count: 1 }\n`,
      `${SCHEMA}${CLIENT_GENERATOR}`,
    )
    expect(failure(await run({}, dir))).toContain(
      'No database URL found.\n   Set `url` in hekireki.config.ts, name the variable in prisma.config.ts (`datasource: { url: env("DATABASE_URL") }`) and set it in .env or the environment, or pass --url <connection string>.\n   Or pass --sql <file> to write the rows as SQL instead.',
    )
  })

  it('reports a client factory that throws or returns something else', async () => {
    const throwing = project(
      `export default { schema: 'schema.prisma', count: 1, client: () => { throw new Error('no engine') } }\n`,
    )
    expect(failure(await run({}, throwing))).toContain('`client` threw: no engine')
    const wrong = project(
      `export default { schema: 'schema.prisma', count: 1, client: () => ({ not: 'a client' }) }\n`,
    )
    expect(failure(await run({}, wrong))).toContain(
      '`client` must return a Prisma Client: an object with $transaction, $executeRawUnsafe and $disconnect.',
    )
  })

  it('writes a SQL file instead when --sql is given, the same for the same seed, and no client is needed', async () => {
    const dir = project(null)
    const first = await run({ output: 'out/seed.sql', seed: 3, count: 2 }, dir)
    expect(Exit.isSuccess(first)).toBe(true)
    if (!Exit.isSuccess(first)) return
    expect(first.value.target).toStrictEqual({ kind: 'sql', path: path.join(dir, 'out/seed.sql') })
    const sql = readFileSync(path.join(dir, 'out/seed.sql'), 'utf8')
    expect(
      sql.startsWith('-- Generated by hekireki seed (seed 3, locale en)\n-- User: 2, Post: 2\n'),
    ).toBe(true)
    // The script is what a database runs: applied to an empty SQLite file it gives the rows back.
    const db = new DatabaseSync(path.join(dir, 'dev.db'))
    db.exec(`
CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "email" TEXT NOT NULL, "name" TEXT, "role" TEXT NOT NULL DEFAULT 'VIEWER', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Post" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "title" TEXT NOT NULL, "authorId" INTEGER NOT NULL, CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
`)
    db.exec(sql)
    const row = db
      .prepare(
        'SELECT (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Post") AS posts, (SELECT count(*) FROM "Post" WHERE "authorId" NOT IN (SELECT "id" FROM "User")) AS orphans',
      )
      .get()
    db.close()
    expect({ ...row }).toStrictEqual({ users: 2, posts: 2, orphans: 0 })
    await run({ output: 'out/again.sql', seed: 3, count: 2 }, dir)
    expect(readFileSync(path.join(dir, 'out/again.sql'), 'utf8')).toBe(sql)
  })

  it('resolves --sql against the working directory and the config `output` against the config', async () => {
    const dir = project(
      `export default { schema: 'schema.prisma', count: 1, output: 'from-config.sql' }\n`,
    )
    const nested = path.join(dir, 'nested')
    mkdirSync(nested)
    const fromConfig = await run({ config: '../hekireki.config.ts' }, nested)
    expect(Exit.isSuccess(fromConfig) ? fromConfig.value.target : null).toStrictEqual({
      kind: 'sql',
      path: path.join(dir, 'from-config.sql'),
    })
    const fromFlag = await run({ config: '../hekireki.config.ts', output: 'from-flag.sql' }, nested)
    expect(Exit.isSuccess(fromFlag) ? fromFlag.value.target : null).toStrictEqual({
      kind: 'sql',
      path: path.join(nested, 'from-flag.sql'),
    })
  })

  it('lets the command line override the config, locale included, --count winning over per-model counts', async () => {
    const dir = project(
      `export default { schema: 'schema.prisma', seed: 1, count: 9, locale: 'en', models: { User: { count: 30 }, Post: { count: 5 } } }\n`,
    )
    const exit = await run({ output: 'seed.sql', seed: 2, count: 1, locale: 'ja, en' }, dir)
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.seed).toBe(2)
    expect(exit.value.locale).toStrictEqual(['ja', 'en'])
    expect(exit.value.tables.map((t) => t.rows)).toStrictEqual([1, 1])
    // Models given as real rows keep them; --count is for faker rows only.
    const withData = project(
      `export default { schema: 'schema.prisma', models: { User: { data: [{ email: 'a@example.com' }, { email: 'b@example.com' }] }, Post: { count: 7 } } }\n`,
    )
    const kept = await run({ output: 'seed.sql', count: 3 }, withData)
    expect(
      Exit.isSuccess(kept) ? kept.value.tables.map((t) => [t.name, t.rows]) : null,
    ).toStrictEqual([
      ['User', 2],
      ['Post', 3],
    ])
  })

  it('explains a missing schema, a schema Prisma rejects, an unknown locale and a provider it cannot write', async () => {
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
    const broken = project(null, 'model User {\n  id Int\n}\n')
    expect(failure(await run({ output: 'seed.sql' }, broken))).toContain(
      'Error validating model "User"',
    )
    const mongo = project(
      null,
      'datasource db {\n  provider = "mongodb"\n}\n\nmodel User {\n  id String @id @map("_id")\n}\n',
    )
    expect(failure(await run({ output: 'seed.sql' }, mongo))).toContain(
      'Cannot write SQL for datasource provider "mongodb".\n   Supported: postgresql, cockroachdb, mysql, sqlite.',
    )
    expect(failure(await run({ url: 'mongodb://localhost/x' }, mongo))).toContain(
      'Cannot seed for datasource provider "mongodb".',
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
      target: { kind: 'client', source: 'generated/client', models: 2, operations: 5 },
    }
    expect(seedBanner(report)).toBe(
      `⚡️ Seeded 2600 rows (seed 42, locale ja, en)
   Schema: /app/prisma/schema.prisma
   Config: /app/hekireki.config.ts
   Prisma Client: generated/client, 5 writes in one transaction
   User     100 rows
   Post    2500 rows`,
    )
    expect(
      seedBanner({
        ...report,
        seed: null,
        locale: [],
        configPath: null,
        target: { kind: 'sql', path: '/app/seed.sql' },
      }),
    ).toBe(
      `⚡️ Seeded 2600 rows (seed random, locale en)
   Schema: /app/prisma/schema.prisma
   SQL: /app/seed.sql
   User     100 rows
   Post    2500 rows`,
    )
  })
})
