import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import mysql from 'mysql2/promise'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

// The Prisma Client page of the built `hekireki studio` against real PostgreSQL and MySQL: the
// call runs through a client `prisma generate` wrote and the driver adapter of the dialect, the
// statements on the page are the ones Prisma Client sent (and run the same through the SQL page),
// and the editor completes against the generated types. Each target needs the connection string
// test/db/seed.test.ts reads and is skipped without one; the Seed DB workflow provides both, and
// examples/compose.yaml starts the two locally.
//
//   HEKIREKI_SEED_PG=postgresql://postgres:postgres@localhost:5432/seed
//   HEKIREKI_SEED_MYSQL=mysql://root:root@localhost:3306/seed
//
// The tables live apart from everything else on the server: in a schema (PostgreSQL) or a
// database (MySQL) named for this run, which `prisma db push` creates empty — so nothing is ever
// reset — and which the check drops again when it is done.

const root = resolve(import.meta.dirname, '..', '..')
const pkg = join(root, 'packages', 'hekireki')
const cli = join(pkg, 'dist', 'bin', 'hekireki.js')
const prisma = join(pkg, 'node_modules', '.bin', 'prisma')

/** The schema or database of this run: new, so it holds nothing but what the check puts there. */
const APART = `hekireki_studio_client_${process.pid}_${Date.now()}`

type Target = {
  readonly dialect: 'postgresql' | 'mysql'
  readonly url: string | undefined
  /** The URL of the tables this check owns. */
  readonly isolate: (url: string) => string
  /** The packages a project of this dialect installs: the adapter, and the driver Studio opens. */
  readonly packages: readonly string[]
  readonly table: (name: string) => string
  readonly port: number
  /** Removes the schema or database of this run, and nothing else. */
  readonly drop: (url: string) => Promise<void>
}

const TARGETS: readonly Target[] = [
  {
    dialect: 'postgresql',
    url: process.env.HEKIREKI_SEED_PG,
    isolate: (url) => `${url}${url.includes('?') ? '&' : '?'}schema=${APART}`,
    packages: ['@prisma/adapter-pg', 'pg'],
    table: (name) => `"${name}"`,
    port: 5911,
    drop: async (url) => {
      const client = new Client({ connectionString: url })
      await client.connect()
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${APART}" CASCADE`)
      } finally {
        await client.end()
      }
    },
  },
  {
    dialect: 'mysql',
    url: process.env.HEKIREKI_SEED_MYSQL,
    isolate: (url) => {
      const isolated = new URL(url)
      isolated.pathname = `/${APART}`
      return isolated.toString()
    },
    packages: ['@prisma/adapter-mariadb', 'mysql2'],
    table: (name) => `\`${name}\``,
    port: 5912,
    drop: async (url) => {
      const connection = await mysql.createConnection(url)
      try {
        await connection.query(`DROP DATABASE IF EXISTS \`${APART}\``)
      } finally {
        await connection.end()
      }
    },
  },
]

function schemaOf(provider: string) {
  return `datasource db {
  provider = "${provider}"
}

generator client {
  provider = "prisma-client"
  output   = "generated/client"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id        Int     @id @default(autoincrement())
  title     String
  published Boolean @default(false)
  authorId  Int
  author    User    @relation(fields: [authorId], references: [id])
}
`
}

function link(dir: string, name: string, target: string) {
  const at = join(dir, 'node_modules', ...name.split('/'))
  mkdirSync(join(at, '..'), { recursive: true })
  symlinkSync(realpathSync(target), at, 'dir')
}

/** Runs a command to completion; what went wrong when it did not exit with 0, else null. */
function run(command: string, args: readonly string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  return result.status === 0
    ? null
    : `${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`
}

/** Whether Studio answers yet, asked again every 200 ms until the deadline. */
async function serving(url: string, deadline: number): Promise<boolean> {
  const up = await fetch(url).then(
    (response) => response.ok,
    () => false,
  )
  if (up) return true
  if (Date.now() > deadline) return false
  await new Promise((_resolve) => {
    setTimeout(_resolve, 200)
  })
  return serving(url, deadline)
}

type Response = { readonly status: number; readonly json: unknown }

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function listOf(json: unknown, key: string): readonly unknown[] {
  const value = isRecord(json) ? json[key] : undefined
  return Array.isArray(value) ? value : []
}

type Statement = { readonly sql: string; readonly formatted: string; readonly params: unknown[] }

function isStatement(value: unknown): value is Statement {
  return isRecord(value) && typeof value.sql === 'string' && Array.isArray(value.params)
}

describe.each(TARGETS)('the Prisma Client page on $dialect', (target) => {
  // Setup cannot assert; what it could not do is kept here, and every test checks it first.
  const state: { dir: string; studio: ChildProcess | null; failure: string | null } = {
    dir: '',
    studio: null,
    failure: null,
  }
  const base = `http://127.0.0.1:${target.port}`

  const call = async (path: string, body?: unknown): Promise<Response> => {
    const response = await fetch(
      `${base}${path}`,
      body === undefined
        ? {}
        : {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
          },
    )
    return { status: response.status, json: await response.json() }
  }

  /** A write through the page's API, which asks no question (the page's dialog is the UI's); what it answered when it refused. */
  const write = async (query: string) => {
    const response = await call('/api/client/run', { query })
    return response.status === 200 ? null : JSON.stringify(response.json)
  }

  /** The number of rows, counted by Studio's own driver through the SQL page's API. */
  const countOf = async (table: string) => {
    const response = await call('/api/db/sql', {
      sql: `SELECT count(*) AS n FROM ${target.table(table)}`,
    })
    const [row] = listOf(response.json, 'rows')
    return Number(isRecord(row) ? row.n : Number.NaN)
  }

  beforeAll(async () => {
    if (target.url === undefined) return
    const url = target.isolate(target.url)
    const dir = mkdtempSync(join(tmpdir(), `hekireki-studio-${target.dialect}-`))
    state.dir = dir
    for (const name of ['@prisma/client', ...target.packages]) {
      link(dir, name, join(root, 'node_modules', name))
    }
    link(dir, 'typescript', join(pkg, 'node_modules', 'typescript-5'))
    const schema = join(dir, 'schema.prisma')
    writeFileSync(schema, schemaOf(target.dialect))
    const prepared =
      run(prisma, ['generate', '--schema', schema], dir) ??
      run(prisma, ['db', 'push', '--schema', schema, '--url', url], dir)
    if (prepared !== null) {
      state.failure = prepared
      return
    }
    state.studio = spawn(
      'node',
      [cli, 'studio', '--schema', schema, '--url', url, '-p', String(target.port)],
      {
        cwd: dir,
        stdio: 'ignore',
      },
    )
    if (!(await serving(`${base}/api/schema`, Date.now() + 30_000))) {
      state.failure = 'hekireki studio did not start'
      return
    }
    state.failure =
      (await write(
        'prisma.user.createMany({ data: [{ email: "ada@example.com", name: "Ada" }, { email: "bob@example.com", name: "Bob" }, { email: "cy@example.org" }] })',
      )) ??
      (await write(
        'prisma.post.createMany({ data: [{ title: "Hello", published: true, authorId: 1 }, { title: "Draft", authorId: 1 }, { title: "Notes", published: true, authorId: 2 }] })',
      ))
  })

  afterAll(async () => {
    state.studio?.kill()
    if (state.dir !== '') rmSync(state.dir, { recursive: true, force: true })
    if (target.url !== undefined) await target.drop(target.url)
  })

  it.skipIf(target.url === undefined)(
    'loads the generated client through the adapter, with TypeScript for the editor',
    async () => {
      expect(state.failure).toBeNull()
      expect(await call('/api/client')).toStrictEqual({
        status: 200,
        json: {
          available: true,
          source: 'generated/client',
          error: null,
          typescript: expect.stringMatching(/^5\./u),
          typesError: null,
        },
      })
    },
  )

  it.skipIf(target.url === undefined)(
    'returns the rows with the statements Prisma Client sent, which run the same on the SQL page',
    async () => {
      expect(state.failure).toBeNull()
      const response = await call('/api/client/run', {
        query:
          'prisma.user.findMany({ where: { email: { endsWith: "example.com" } }, orderBy: { id: "asc" }, include: { posts: { where: { published: true }, select: { title: true } } } })',
      })
      expect(response.status).toBe(200)
      expect(response.json).toMatchObject({
        result: [
          { id: 1, email: 'ada@example.com', name: 'Ada', posts: [{ title: 'Hello' }] },
          { id: 2, email: 'bob@example.com', name: 'Bob', posts: [{ title: 'Notes' }] },
        ],
        rowCount: 2,
      })
      const statements = listOf(response.json, 'queries').filter(isStatement)
      expect(statements.length).toBeGreaterThan(0)
      const [users] = statements
      expect(users?.sql).toMatch(/^SELECT /u)
      expect(users?.sql).toContain(target.table('User'))
      expect(users?.params).toContain('example.com')
      for (const statement of statements) {
        expect(statement.formatted.replaceAll(/\s+/gu, '')).toBe(
          statement.sql.replaceAll(/\s+/gu, ''),
        )
      }
      // What the page shows, with the values it shows, is a statement the database runs.
      const replays = await Promise.all(
        statements.map((statement) =>
          call('/api/db/sql', { sql: statement.sql, params: statement.params }),
        ),
      )
      expect(replays.map((replay) => replay.status)).toStrictEqual(statements.map(() => 200))
      const replayed = await call('/api/db/sql', { sql: users?.sql, params: users?.params })
      expect(replayed.json).toMatchObject({ rowCount: 2 })
    },
  )

  it.skipIf(target.url === undefined)(
    'previews the statements a read sends as its run sends them, and runs no write for its SQL',
    async () => {
      expect(state.failure).toBeNull()
      const query =
        'prisma.post.findMany({ where: { published: true }, include: { author: { select: { email: true } } } })'
      const statementsOf = (json: unknown) =>
        listOf(json, 'queries')
          .filter(isStatement)
          .map((statement) => [statement.sql, statement.params])
      const previewed = await call('/api/client/preview', { query })
      const ran = await call('/api/client/run', { query })
      expect(previewed.status).toBe(200)
      expect(statementsOf(previewed.json).length).toBeGreaterThan(0)
      expect(statementsOf(previewed.json)).toStrictEqual(statementsOf(ran.json))
      // The placeholders are the dialect's own: `$1` on PostgreSQL, `?` on MySQL.
      const first = listOf(previewed.json, 'queries').find(isStatement)
      expect(first?.sql).toMatch(target.dialect === 'postgresql' ? /\$1/u : /\?/u)
      expect(await call('/api/client/analyze', { query })).toMatchObject({
        json: {
          touched: [
            { model: 'Post', fields: ['published', 'author'] },
            { model: 'User', fields: ['email'] },
          ],
        },
      })

      const before = await countOf('Post')
      const refused = await call('/api/client/preview', { query: 'prisma.post.deleteMany()' })
      expect(refused.status).toBe(422)
      expect(await countOf('Post')).toBe(before)
    },
  )

  it.skipIf(target.url === undefined)(
    'runs a batch $transaction: the INSERT is listed and the row is in the database',
    async () => {
      expect(state.failure).toBeNull()
      const before = await countOf('Post')
      const response = await call('/api/client/run', {
        query:
          'prisma.$transaction([prisma.post.create({ data: { title: "Batch", authorId: 3 } }), prisma.post.count({ where: { authorId: 3 } })])',
      })
      expect(response.status).toBe(200)
      expect(response.json).toMatchObject({
        result: [{ title: 'Batch', published: false, authorId: 3 }, 1],
      })
      expect(
        listOf(response.json, 'queries')
          .filter(isStatement)
          .some((statement) => statement.sql.startsWith('INSERT')),
      ).toBe(true)
      expect(await countOf('Post')).toBe(before + 1)
    },
  )

  it.skipIf(target.url === undefined)(
    'reports a constraint the database enforces, in Prisma Client’s words',
    async () => {
      expect(state.failure).toBeNull()
      const response = await call('/api/client/run', {
        query: 'prisma.user.create({ data: { email: "ada@example.com" } })',
      })
      expect(response.status).toBe(422)
      expect(response.json).toMatchObject({
        detail: expect.stringContaining('Unique constraint failed'),
      })
      expect(await countOf('User')).toBe(3)
    },
  )

  it.skipIf(target.url === undefined)(
    'completes and checks the call against the generated types',
    async () => {
      expect(state.failure).toBeNull()
      const completions = await call('/api/client/complete', {
        query: 'prisma.user.findMany({ where: { ',
        offset: 33,
      })
      expect(
        listOf(completions.json, 'items').map((item) => (isRecord(item) ? item.label : null)),
      ).toStrictEqual(expect.arrayContaining(['id', 'email', 'name', 'posts', 'AND']))
      expect(
        await call('/api/client/check', { query: 'prisma.post.findMany({ where: { nope: 1 } })' }),
      ).toStrictEqual({
        status: 200,
        json: {
          diagnostics: [
            {
              message:
                "Object literal may only specify known properties, and 'nope' does not exist in type 'PostWhereInput'.",
              severity: 'error',
              range: { start: 32, end: 36 },
            },
          ],
        },
      })
    },
  )
})
