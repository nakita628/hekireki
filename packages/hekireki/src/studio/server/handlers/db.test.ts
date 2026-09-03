import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { createStudioApp } from '../app.js'
import { connectDatabase, createStudioState } from '../services/index.js'
import type { disconnectedDatabase } from '../services/index.js'

const dirs: string[] = []
const states: ReturnType<typeof disconnectedDatabase>[] = []

afterEach(async () => {
  await Effect.runPromise(Effect.all(states.splice(0).map((db) => db.close)))
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const SCHEMA = `datasource db {
  provider = "sqlite"
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique @map("email_address")
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  posts     Post[]

  @@map("users")
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int    @map("author_id")
  author   User   @relation(fields: [authorId], references: [id])
}

enum Visibility {
  PUBLIC    @map("public")
  LINK_ONLY @map("link_only")
}

model Note {
  id         Int        @id @default(autoincrement())
  title      String
  visibility Visibility @default(PUBLIC)
}

model Session {
  id        String   @id @default(uuid(7))
  token     String   @unique @default(cuid())
  startedAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
`

// The driver message, with the way out Studio appends to it.
const MISSING_TABLE_HINT =
  'no such table: missing — the database has not been migrated to this schema; run `prisma db push` (or `prisma migrate dev`) with the same DATABASE_URL, then reload.'

const ROWS_META = { key: ['id'], columns: ['id', 'email', 'active', 'createdAt'] }

async function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-db-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, SCHEMA)
  writeFileSync(path.join(dir, '.env'), 'DATABASE_URL="file:./dev.db"\n')
  const state = createStudioState({ schemaPath })
  const snapshot = await Effect.runPromise(Effect.provide(state.reload(), fileSystemLayer))
  const db = await Effect.runPromise(
    Effect.provide(
      connectDatabase({
        explicitUrl: null,
        schemaProvider: snapshot.schema?.provider ?? null,
        cwd: dir,
        schemaDir: dir,
        env: {},
      }),
      fileSystemLayer,
    ),
  )
  states.push(db)
  const app = createStudioApp(state, dir, db)
  const call = async (url: string, method: string, body?: unknown) => {
    const response = await app.request(
      url,
      body === undefined
        ? { method }
        : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
    )
    const json: unknown = await response.json()
    return { status: response.status, json }
  }
  await call('/api/db/sql', 'POST', {
    sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email_address TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT "2026-01-01T00:00:00.000Z")',
  })
  await call('/api/db/sql', 'POST', {
    sql: 'CREATE TABLE "Post" (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, author_id INTEGER NOT NULL)',
  })
  await call('/api/db/sql', 'POST', {
    sql: 'CREATE TABLE "Note" (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, visibility TEXT NOT NULL)',
  })
  // No database defaults: Prisma would generate these values in the client.
  await call('/api/db/sql', 'POST', {
    sql: 'CREATE TABLE "Session" (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, startedAt TEXT NOT NULL, updatedAt TEXT NOT NULL)',
  })
  return { call, dir }
}

describe('data routes over sqlite', () => {
  it('reports the connection', async () => {
    const { call } = await setup()
    expect(await call('/api/db', 'GET')).toStrictEqual({
      status: 200,
      json: {
        connected: true,
        dialect: 'sqlite',
        url: 'file:./dev.db',
        source: 'env',
        error: null,
      },
    })
  })

  it('inserts, lists, updates, searches and deletes rows through field names', async () => {
    const { call } = await setup()
    expect(
      await call('/api/db/rows/User', 'POST', {
        values: { email: 'ann@example.com', active: false, createdAt: '2026-01-01T00:00:00.000Z' },
      }),
    ).toStrictEqual({ status: 200, json: { affected: 1 } })
    expect(
      await call('/api/db/rows/User', 'POST', {
        values: { email: 'bob@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
      }),
    ).toStrictEqual({
      status: 200,
      json: { affected: 1 },
    })
    expect(await call('/api/db/rows/User', 'GET')).toStrictEqual({
      status: 200,
      json: {
        rows: [
          { id: 1, email: 'ann@example.com', active: 0, createdAt: '2026-01-01T00:00:00.000Z' },
          { id: 2, email: 'bob@example.com', active: 1, createdAt: '2026-01-01T00:00:00.000Z' },
        ],
        total: 2,
        skip: 0,
        take: 100,
        ...ROWS_META,
      },
    })
    expect(
      await call('/api/db/rows/User', 'PATCH', { where: { id: 1 }, values: { active: true } }),
    ).toStrictEqual({ status: 200, json: { affected: 1 } })
    expect(await call('/api/db/rows/User?search=ann&take=1', 'GET')).toStrictEqual({
      status: 200,
      json: {
        rows: [
          { id: 1, email: 'ann@example.com', active: 1, createdAt: '2026-01-01T00:00:00.000Z' },
        ],
        total: 1,
        skip: 0,
        take: 1,
        ...ROWS_META,
      },
    })
    expect(await call('/api/db/rows/User?skip=1&take=1', 'GET')).toStrictEqual({
      status: 200,
      json: {
        rows: [
          { id: 2, email: 'bob@example.com', active: 1, createdAt: '2026-01-01T00:00:00.000Z' },
        ],
        total: 2,
        skip: 1,
        take: 1,
        ...ROWS_META,
      },
    })
    expect(await call('/api/db/rows/User', 'DELETE', { where: { id: 2 } })).toStrictEqual({
      status: 200,
      json: { affected: 1 },
    })
    expect(await call('/api/db/counts', 'GET')).toStrictEqual({
      status: 200,
      json: { counts: { User: 1, Post: 0, Session: 0, Note: 0 } },
    })
  })

  it('stores a mapped enum member under its database name and reads it back by its Prisma name', async () => {
    const { call } = await setup()
    expect(
      await call('/api/db/rows/Note', 'POST', {
        values: { title: 'Mapped', visibility: 'LINK_ONLY' },
      }),
    ).toStrictEqual({ status: 200, json: { affected: 1 } })
    // The column holds the @map name...
    expect(
      await call('/api/db/sql', 'POST', { sql: 'SELECT visibility FROM "Note"' }),
    ).toStrictEqual({
      status: 200,
      json: {
        columns: ['visibility'],
        rows: [{ visibility: 'link_only' }],
        rowCount: 1,
        durationMs: expect.any(Number),
      },
    })
    // ...while the data browser shows the name written in the schema.
    const listed = await call('/api/db/rows/Note', 'GET')
    expect((listed.json as { rows: Record<string, string>[] }).rows).toStrictEqual([
      { id: 1, title: 'Mapped', visibility: 'LINK_ONLY' },
    ])
    expect(
      await call('/api/db/rows/Note', 'PATCH', {
        where: { id: 1 },
        values: { visibility: 'PUBLIC' },
      }),
    ).toStrictEqual({ status: 200, json: { affected: 1 } })
    expect(
      await call('/api/db/sql', 'POST', { sql: 'SELECT visibility FROM "Note"' }),
    ).toStrictEqual({
      status: 200,
      json: {
        columns: ['visibility'],
        rows: [{ visibility: 'public' }],
        rowCount: 1,
        durationMs: expect.any(Number),
      },
    })
  })

  it('generates the client-side defaults Prisma would, so an empty row inserts', async () => {
    const { call } = await setup()
    expect(await call('/api/db/rows/Session', 'POST', { values: {} })).toStrictEqual({
      status: 200,
      json: { affected: 1 },
    })
    const listed = await call('/api/db/rows/Session', 'GET')
    const row = (listed.json as { rows: Record<string, string>[] }).rows[0]
    expect(row?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
    expect(row?.token).toMatch(/^c[0-9a-z]{24}$/u)
    expect(row?.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
    expect(row?.updatedAt).toBe(row?.startedAt)
  })

  it('explains a missing table and a missing value', async () => {
    const { call } = await setup()
    await call('/api/db/sql', 'POST', { sql: 'DROP TABLE "Post"' })
    const missing = await call('/api/db/rows/Post', 'GET')
    expect(missing.status).toBe(503)
    expect((missing.json as { detail: string }).detail).toContain('prisma db push')
    const noValue = await call('/api/db/rows/User', 'POST', { values: { active: true } })
    expect(noValue.status).toBe(503)
    expect((noValue.json as { detail: string }).detail).toContain('fill the field in')
  })

  it('answers problem+json for unknown models, empty keys and malformed bodies', async () => {
    const { call } = await setup()
    expect(await call('/api/db/rows/Nope', 'GET')).toStrictEqual({
      status: 404,
      json: {
        type: '/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'Unknown model "Nope".',
        instance: '/api/db/rows/Nope',
      },
    })
    expect(await call('/api/db/rows/User', 'PATCH', { where: {}, values: {} })).toStrictEqual({
      status: 422,
      json: {
        type: '/problems/validation-failed',
        title: 'Validation Failed',
        status: 422,
        detail: 'where must name at least one key field.',
        instance: '/api/db/rows/User',
        errors: [{ field: 'where', message: 'must name at least one key field' }],
      },
    })
    expect(await call('/api/db/rows/User', 'DELETE', {})).toStrictEqual({
      status: 422,
      json: {
        type: '/problems/validation-failed',
        title: 'Validation Failed',
        status: 422,
        detail: 'The request failed validation. See `errors` for the offending fields.',
        instance: '/api/db/rows/User',
        errors: [{ field: 'where', message: 'Invalid input: expected record, received undefined' }],
      },
    })
    const malformed = await call('/api/db/rows/User', 'POST', { nope: 1 })
    expect(malformed.status).toBe(422)
  })

  it('turns database failures into problem responses without crashing', async () => {
    const { call } = await setup()
    await call('/api/db/rows/User', 'POST', { values: { email: 'dup@example.com' } })
    const duplicate = await call('/api/db/rows/User', 'POST', {
      values: { email: 'dup@example.com' },
    })
    expect(duplicate).toStrictEqual({
      status: 503,
      json: {
        type: '/problems/service-unavailable',
        title: 'Service Unavailable',
        status: 503,
        detail: 'UNIQUE constraint failed: users.email_address',
        instance: '/api/db/rows/User',
      },
    })
  })

  it('runs arbitrary SQL and returns rows or affected counts', async () => {
    const { call } = await setup()
    const inserted = await call('/api/db/sql', 'POST', {
      sql: "INSERT INTO users (email_address) VALUES ('sql@example.com')",
    })
    expect(inserted).toStrictEqual({
      status: 200,
      json: { columns: [], rows: [], rowCount: 1, durationMs: expect.any(Number) },
    })
    expect(
      await call('/api/db/sql', 'POST', { sql: 'SELECT id, email_address AS email FROM users' }),
    ).toStrictEqual({
      status: 200,
      json: {
        columns: ['id', 'email'],
        rows: [{ id: 1, email: 'sql@example.com' }],
        rowCount: 1,
        durationMs: expect.any(Number),
      },
    })
    expect(await call('/api/db/sql', 'POST', { sql: 'SELECT * FROM missing' })).toStrictEqual({
      status: 422,
      json: {
        type: '/problems/validation-failed',
        title: 'Validation Failed',
        status: 422,
        detail: MISSING_TABLE_HINT,
        instance: '/api/db/sql',
        errors: [{ field: 'sql', message: MISSING_TABLE_HINT }],
      },
    })
    const empty = await call('/api/db/sql', 'POST', { sql: '' })
    expect(empty.status).toBe(422)
  })
})
