import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

import { formatSql } from '../../../sql/index.js'
import { createStudioApp } from '../app.js'
import { createProjectClient, createStudioState, disconnectedDatabase } from '../services/index.js'

// The Prisma Client page against a client `prisma generate` really wrote, on a real SQLite file:
// what Studio shows is what Prisma Client does, so this is where a Prisma release that changes
// its query events, its generated files or its types shows up. The project is a temporary
// directory whose node_modules links the packages a project would install: @prisma/client, the
// SQLite driver adapter, and TypeScript 5 (the line with a language service API).

const PACKAGE = path.resolve(import.meta.dirname, '../../../..')
const ROOT = path.resolve(PACKAGE, '../..')
const PRISMA = path.join(PACKAGE, 'node_modules', '.bin', 'prisma')

const SCHEMA = `datasource db {
  provider = "sqlite"
}

generator client {
  provider = "prisma-client"
  output   = "generated/client"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
  role  Role    @default(VIEWER)
  posts Post[]
}

model Post {
  id        Int     @id @default(autoincrement())
  title     String
  published Boolean @default(false)
  authorId  Int
  author    User    @relation(fields: [authorId], references: [id])
}

enum Role {
  ADMIN
  VIEWER
}
`

const project: {
  dir: string
  call: (url: string, body?: unknown) => Promise<{ status: number; json: unknown }>
  reload: () => Promise<unknown>
  close: () => Promise<void>
} = {
  dir: '',
  call: () => Promise.reject(new Error('not set up')),
  reload: () => Promise.reject(new Error('not set up')),
  close: () => Promise.resolve(),
}

function link(dir: string, name: string, target: string) {
  const at = path.join(dir, 'node_modules', ...name.split('/'))
  mkdirSync(path.dirname(at), { recursive: true })
  symlinkSync(realpathSync(target), at, 'dir')
}

function generate(schemaPath: string) {
  const result = spawnSync(PRISMA, ['generate', '--schema', schemaPath], { encoding: 'utf8' })
  expect(result.status, `prisma generate\n${result.stderr}`).toBe(0)
}

/** How many rows the table has, read straight from the file rather than through Studio. */
function countOf(table: string) {
  const db = new DatabaseSync(path.join(project.dir, 'dev.db'))
  try {
    return Number(db.prepare(`SELECT count(*) AS n FROM "${table}"`).get()?.n)
  } finally {
    db.close()
  }
}

function labelsOf(json: unknown) {
  return typeof json === 'object' && json !== null && 'items' in json && Array.isArray(json.items)
    ? json.items.map((item: { label: string }) => item.label)
    : []
}

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-prisma-'))
  project.dir = dir
  link(dir, '@prisma/client', path.join(ROOT, 'node_modules', '@prisma', 'client'))
  link(
    dir,
    '@prisma/adapter-better-sqlite3',
    path.join(ROOT, 'node_modules', '@prisma', 'adapter-better-sqlite3'),
  )
  link(dir, 'typescript', path.join(PACKAGE, 'node_modules', 'typescript-5'))
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, SCHEMA)
  generate(schemaPath)
  const db = new DatabaseSync(path.join(dir, 'dev.db'))
  db.exec(`
    CREATE TABLE "User" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "email" TEXT NOT NULL UNIQUE,
      "name" TEXT,
      "role" TEXT NOT NULL DEFAULT 'VIEWER'
    );
    CREATE TABLE "Post" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "title" TEXT NOT NULL,
      "published" BOOLEAN NOT NULL DEFAULT false,
      "authorId" INTEGER NOT NULL REFERENCES "User"("id")
    );
    INSERT INTO "User" ("email", "name", "role") VALUES
      ('ada@example.com', 'Ada', 'ADMIN'),
      ('bob@example.com', 'Bob', 'VIEWER'),
      ('cy@example.org', NULL, 'VIEWER');
    INSERT INTO "Post" ("title", "published", "authorId") VALUES
      ('Hello', 1, 1),
      ('Draft', 0, 1),
      ('Notes', 1, 2);
  `)
  db.close()
  const state = createStudioState({ schemaPath })
  const reload = () => Effect.runPromise(Effect.provide(state.reload(), NodeFileSystem.layer))
  await reload()
  const client = createProjectClient({
    target: { url: 'file:./dev.db', dialect: 'sqlite' },
    reason: null,
    schemaDir: dir,
    cwd: dir,
  })
  const app = createStudioApp(state, dir, disconnectedDatabase(), client)
  project.reload = reload
  project.close = () => Effect.runPromise(client.close)
  project.call = async (url, body) => {
    const response = await app.request(
      url,
      body === undefined
        ? { method: 'GET' }
        : {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
          },
    )
    const json: unknown = await response.json()
    return { status: response.status, json }
  }
}, 120_000)

afterAll(async () => {
  await project.close()
  rmSync(project.dir, { recursive: true, force: true })
})

describe('the Prisma Client page on a generated client', () => {
  it('loads the client from the generator output with TypeScript for the editor', async () => {
    expect(await project.call('/api/client')).toStrictEqual({
      status: 200,
      json: {
        available: true,
        source: 'generated/client',
        error: null,
        typescript: expect.stringMatching(/^5\./u),
        typesError: null,
      },
    })
  })

  it('returns the rows and the statements Prisma Client sent for them, in order', async () => {
    const { status, json } = await project.call('/api/client/run', {
      query:
        'prisma.user.findMany({ where: { email: { endsWith: "example.com" } }, orderBy: { id: "asc" }, include: { posts: { where: { published: true }, select: { title: true } } } })',
    })
    expect(status).toBe(200)
    expect(json).toMatchObject({
      result: [
        {
          id: 1,
          email: 'ada@example.com',
          name: 'Ada',
          role: 'ADMIN',
          posts: [{ title: 'Hello' }],
        },
        {
          id: 2,
          email: 'bob@example.com',
          name: 'Bob',
          role: 'VIEWER',
          posts: [{ title: 'Notes' }],
        },
      ],
      rowCount: 2,
      truncated: false,
    })
    const queries =
      typeof json === 'object' && json !== null && 'queries' in json && Array.isArray(json.queries)
        ? (json.queries as {
            sql: string
            formatted: string
            params: unknown[]
            durationMs: number
          }[])
        : []
    // The users, then their posts: `include` is a second statement, and both are Prisma's own.
    expect(queries).toHaveLength(2)
    expect(queries[0]?.sql).toMatch(/^SELECT .+ FROM `main`\.`User` WHERE .+ LIKE .+ ORDER BY /u)
    expect(queries[0]?.params[0]).toBe('example.com')
    expect(queries[1]?.sql).toMatch(/^SELECT .+ FROM `main`\.`Post` WHERE .+ IN \(/u)
    expect(queries[1]?.params).toStrictEqual(expect.arrayContaining([true, 1, 2]))
    for (const query of queries) {
      // The layout follows the connected database's dialect; here Studio's own connection is off.
      expect(query.formatted).toBe(formatSql(query.sql, null))
      expect(query.formatted.split('\n').length).toBeGreaterThan(3)
      expect(query.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('previews the statements a read sends as the run sends them, and changes nothing for a write', async () => {
    const query =
      'prisma.user.findMany({ where: { role: "VIEWER" }, include: { posts: { select: { title: true } } } })'
    const sqlOf = (json: unknown) =>
      typeof json === 'object' && json !== null && 'queries' in json && Array.isArray(json.queries)
        ? json.queries.map((entry: { sql: string; params: unknown[] }) => [entry.sql, entry.params])
        : null
    const preview = await project.call('/api/client/preview', { query })
    const run = await project.call('/api/client/run', { query })
    expect(preview.status).toBe(200)
    expect(sqlOf(preview.json)).toHaveLength(2)
    expect(sqlOf(preview.json)).toStrictEqual(sqlOf(run.json))
    expect(preview.json).not.toHaveProperty('result')

    const posts = async () => {
      const { json } = await project.call('/api/client/run', { query: 'prisma.post.count()' })
      return typeof json === 'object' && json !== null && 'result' in json ? json.result : null
    }
    const before = await posts()
    expect(before).toBeGreaterThan(0)
    const refused = await project.call('/api/client/preview', { query: 'prisma.post.deleteMany()' })
    expect(refused.status).toBe(422)
    expect(await posts()).toBe(before)
  })

  it('names the models a call touches through its relations, with the fields it names', async () => {
    expect(
      await project.call('/api/client/analyze', {
        query:
          'prisma.user.findMany({ where: { posts: { some: { published: true } } }, include: { posts: { select: { title: true } } } })',
      }),
    ).toMatchObject({
      status: 200,
      json: {
        touched: [
          { model: 'User', fields: ['posts'] },
          { model: 'Post', fields: ['published', 'title'] },
        ],
      },
    })
    expect(
      await project.call('/api/client/analyze', {
        query:
          'prisma.$transaction([prisma.post.count({ where: { author: { role: "ADMIN" } } }), prisma.user.count()])',
      }),
    ).toMatchObject({
      status: 200,
      json: {
        touched: [
          { model: 'Post', fields: ['author'] },
          { model: 'User', fields: ['role'] },
        ],
      },
    })
  })

  it('runs a batch $transaction: the write reaches the database, and its INSERT is listed', async () => {
    const before = countOf('Post')
    const { status, json } = await project.call('/api/client/run', {
      query:
        'prisma.$transaction([prisma.post.create({ data: { title: "Batch", authorId: 3 } }), prisma.post.count({ where: { authorId: 3 } })])',
    })
    expect(status).toBe(200)
    expect(json).toMatchObject({
      result: [{ title: 'Batch', published: false, authorId: 3 }, 1],
      rowCount: 2,
    })
    const statements =
      typeof json === 'object' && json !== null && 'queries' in json && Array.isArray(json.queries)
        ? json.queries.map((query: { sql: string }) => query.sql.split(' ')[0])
        : []
    expect(statements).toContain('INSERT')
    expect(countOf('Post')).toBe(before + 1)
  })

  it('reports what Prisma Client refuses, in its own words, and changes nothing', async () => {
    const unknown = await project.call('/api/client/run', {
      query: 'prisma.user.findMany({ where: { nope: 1 } })',
    })
    expect(unknown.status).toBe(422)
    expect(unknown.json).toMatchObject({
      detail: expect.stringContaining('Unknown argument `nope`'),
    })
    const duplicate = await project.call('/api/client/run', {
      query: 'prisma.user.create({ data: { email: "ada@example.com" } })',
    })
    expect(duplicate.status).toBe(422)
    expect(duplicate.json).toMatchObject({
      detail: expect.stringContaining('Unique constraint failed'),
    })
    expect(countOf('User')).toBe(3)
  })

  it('completes, explains and checks the query against the types prisma generate wrote', async () => {
    const where = await project.call('/api/client/complete', {
      query: 'prisma.user.findMany({ where: { ',
      offset: 33,
    })
    expect(where.status).toBe(200)
    expect(labelsOf(where.json)).toStrictEqual(
      expect.arrayContaining(['id', 'email', 'name', 'role', 'posts', 'AND', 'OR', 'NOT']),
    )
    const related = await project.call('/api/client/complete', {
      query: 'prisma.user.findMany({ where: { posts: { some: { ',
      offset: 51,
    })
    expect(labelsOf(related.json)).toStrictEqual(
      expect.arrayContaining(['title', 'published', 'author']),
    )
    expect(
      await project.call('/api/client/complete/detail', {
        query: 'prisma.user.findMany({ where: { ',
        offset: 33,
        name: 'posts',
      }),
    ).toStrictEqual({
      status: 200,
      json: {
        detail: '(property) posts?: PostListRelationFilter | undefined',
        documentation: null,
      },
    })
    const hover = await project.call('/api/client/hover', {
      query: 'prisma.user.findMany({ take: 1 })',
      offset: 14,
    })
    expect(hover.json).toMatchObject({
      contents: expect.stringContaining('PrismaPromise'),
      range: { start: 12, end: 20 },
    })
    expect(
      await project.call('/api/client/check', {
        query: 'prisma.user.findMany({ where: { nope: 1 }, take: 10n })',
      }),
    ).toStrictEqual({
      status: 200,
      json: {
        diagnostics: [
          {
            message:
              "Object literal may only specify known properties, and 'nope' does not exist in type 'UserWhereInput'.",
            severity: 'error',
            range: { start: 32, end: 36 },
          },
          {
            message: "Type 'bigint' is not assignable to type 'number'.",
            severity: 'error',
            range: { start: 43, end: 47 },
          },
        ],
      },
    })
    expect(
      await project.call('/api/client/check', {
        query: 'await prisma.post.create({ data: { title: "x", authorId: 1 } })',
      }),
    ).toStrictEqual({ status: 200, json: { diagnostics: [] } })
    const signature = await project.call('/api/client/signature', {
      query: 'prisma.post.create(',
      offset: 19,
    })
    expect(signature.json).toMatchObject({
      signatures: [{ label: expect.stringContaining('data: XOR<PostCreateInput') }],
      activeParameter: 0,
    })
  })

  it('completes against what prisma generate writes next, without a restart', async () => {
    const schemaPath = path.join(project.dir, 'schema.prisma')
    writeFileSync(
      schemaPath,
      SCHEMA.replace('  name  String?', '  name  String?\n  nickname String?'),
    )
    generate(schemaPath)
    await project.reload()
    const where = await project.call('/api/client/complete', {
      query: 'prisma.user.findMany({ where: { ',
      offset: 33,
    })
    expect(labelsOf(where.json)).toContain('nickname')
  })
})
