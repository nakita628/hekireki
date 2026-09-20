import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import mysql from 'mysql2/promise'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

import { decide } from './migrate-harness.ts'

// `hekireki migrate check` against real PostgreSQL and MySQL, held to what Prisma Migrate does.
//
// The report: the tables of an old schema come from `prisma db push`, rows that break a new
// schema go in, and the check has to count each of them, then pass once they are fixed. The new
// schema pushed to empty tables of its own has every check guaranteed by the constraints Prisma
// created, which holds the catalogue queries to what Prisma writes.
//
// The ground truth: each problem the check calls blocking is put alone in tables of its own,
// and the migration Prisma writes for the change (`prisma migrate diff --script`) has to fail on
// it, and go through without it. On PostgreSQL the migration runs in a transaction that is
// always rolled back; on MySQL, whose DDL cannot be rolled back, the change drops nothing, so
// running it loses no row. Nothing here asks Prisma to lose data. Each target needs the
// connection string test/db/seed.test.ts reads and is skipped without one.
//
//   HEKIREKI_SEED_PG=postgresql://postgres:postgres@localhost:5432/seed
//   HEKIREKI_SEED_MYSQL=mysql://root:root@localhost:3306/seed
//   HEKIREKI_SEED_COCKROACH=postgresql://root@localhost:26257/defaultdb?sslmode=disable
//
// CockroachDB runs Prisma's migration as \`prisma migrate deploy\` does, a statement at a time on
// a session set up like Prisma's, in a database of its own that is not rolled back. Its changes
// of a column's type run with the declarative schema changer, as \`hekireki migrate plan
// --migration\` writes them: on Prisma's session CockroachDB refuses them whatever the rows
// (prisma/prisma#26864).
//
// The tables live in schemas (PostgreSQL) or databases (MySQL) named for this run, which
// `prisma db push` creates empty and the check drops again when it is done.

const root = resolve(import.meta.dirname, '..', '..')
const pkg = join(root, 'packages', 'hekireki')
const cli = join(pkg, 'dist', 'bin', 'hekireki.js')
const prisma = join(pkg, 'node_modules', '.bin', 'prisma')

const RUN = `hekireki_migrate_${process.pid}_${Date.now()}`

type Row = Readonly<Record<string, unknown>>

type Dialect = 'postgresql' | 'mysql' | 'cockroachdb'

type Target = {
  readonly dialect: Dialect
  readonly url: string | undefined
  /** The URL of the schema or database of that name. */
  readonly isolate: (url: string, name: string) => string
  readonly q: (name: string) => string
  /** Runs statements, in order, on the tables of the schema or database of that name. */
  readonly exec: (url: string, name: string, sql: readonly string[]) => Promise<void>
  /**
   * Runs a migration there, after the `before` script when there is one, with `queries` read in
   * between: the error it stopped on (null when all went through) and the rows each query found.
   */
  readonly migrate: (
    url: string,
    name: string,
    run: {
      readonly script: string
      readonly before?: string
      readonly queries?: readonly string[]
    },
  ) => Promise<{ readonly error: string | null; readonly rows: readonly (readonly Row[])[] }>
  /** The rows a query finds there. */
  readonly rows: (url: string, name: string, sql: string) => Promise<readonly Row[]>
  /** Removes the schema or database of that name, and nothing else. */
  readonly drop: (url: string, name: string) => Promise<void>
}

/** A MySQL URL naming another database on the same server. */
function databaseUrl(url: string, name: string) {
  const isolated = new URL(url)
  isolated.pathname = `/${name}`
  return isolated.toString()
}

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The statements of a script, one at a time: what CockroachDB runs apart. */
function statementsOf(sql: string) {
  return sql
    .split(/;\s*\n/u)
    .map((statement) => statement.trim())
    .filter((statement) => statement.replaceAll(/^--.*$/gmu, '').trim() !== '')
}

/** The session settings Prisma's schema engine sends when it connects to CockroachDB. */
const PRISMA_COCKROACH_SESSION = [
  'SET enable_implicit_transaction_for_batch_statements = false',
  'SET use_declarative_schema_changer = off',
  'SET enable_experimental_alter_column_type_general = true',
]

/** CockroachDB: the database of that name, on a session like Prisma's. */
async function cockroach(url: string, name: string) {
  const client = new Client({ connectionString: databaseUrl(url, name) })
  await client.connect()
  await client.query(PRISMA_COCKROACH_SESSION.join('; '))
  return client
}

/** Runs statements one after the other, a change of a column's type with the declarative schema changer. */
async function runEach(client: Client, sql: string) {
  for (const statement of statementsOf(sql)) {
    const typed = /ALTER COLUMN \S+ SET DATA TYPE /u.test(statement)
    // oxlint-disable-next-line no-await-in-loop -- one statement after the other, as Prisma runs them
    if (typed) await client.query('SET use_declarative_schema_changer = on')
    // oxlint-disable-next-line no-await-in-loop -- one statement after the other, as Prisma runs them
    await client.query(statement)
    // oxlint-disable-next-line no-await-in-loop -- one statement after the other, as Prisma runs them
    if (typed) await client.query('SET use_declarative_schema_changer = off')
  }
}

const TARGETS: readonly Target[] = [
  {
    dialect: 'postgresql',
    url: process.env.HEKIREKI_SEED_PG,
    isolate: (url, name) => `${url}${url.includes('?') ? '&' : '?'}schema=${name}`,
    q: (name) => `"${name}"`,
    exec: async (url, name, sql) => {
      const client = new Client({ connectionString: url })
      await client.connect()
      try {
        await client.query([`SET search_path TO "${name}"`, ...sql].join(';\n'))
      } finally {
        await client.end()
      }
    },
    migrate: async (url, name, run) => {
      const client = new Client({ connectionString: url })
      await client.connect()
      // Prisma wraps an enum change in a transaction of its own; inside this one, which is
      // rolled back whatever happens, its COMMIT would keep what ran before it.
      const strip = (script: string) =>
        script
          .split('\n')
          .filter((line) => !/^(?:BEGIN|COMMIT);$/u.test(line.trim()))
          .join('\n')
      try {
        await client.query('BEGIN')
        await client.query(`SET LOCAL search_path TO "${name}"`)
        if (run.before !== undefined) await client.query(strip(run.before))
        const rows = await Promise.all(
          (run.queries ?? []).map(async (query) => (await client.query<Row>(query)).rows),
        )
        await client.query(strip(run.script))
        return { error: null, rows }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), rows: [] }
      } finally {
        await client.query('ROLLBACK')
        await client.end()
      }
    },
    rows: async (url, name, sql) => {
      const client = new Client({ connectionString: url })
      await client.connect()
      try {
        await client.query(`SET search_path TO "${name}"`)
        return (await client.query<Row>(sql)).rows
      } finally {
        await client.end()
      }
    },
    drop: async (url, name) => {
      const client = new Client({ connectionString: url })
      await client.connect()
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`)
      } finally {
        await client.end()
      }
    },
  },
  {
    dialect: 'mysql',
    url: process.env.HEKIREKI_SEED_MYSQL,
    isolate: databaseUrl,
    q: (name) => `\`${name}\``,
    exec: async (url, name, sql) => {
      const connection = await mysql.createConnection({
        uri: databaseUrl(url, name),
        multipleStatements: true,
      })
      try {
        await connection.query(sql.join(';\n'))
      } finally {
        await connection.end()
      }
    },
    migrate: async (url, name, run) => {
      const connection = await mysql.createConnection({
        uri: databaseUrl(url, name),
        multipleStatements: true,
      })
      try {
        if (run.before !== undefined) await connection.query(run.before)
        const rows = await Promise.all(
          (run.queries ?? []).map(async (query) => {
            const [found] = await connection.query(query)
            const flat: readonly unknown[] = Array.isArray(found) ? found.flat() : []
            return flat.filter(isRow)
          }),
        )
        await connection.query(run.script)
        return { error: null, rows }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), rows: [] }
      } finally {
        await connection.end()
      }
    },
    rows: async (url, name, sql) => {
      const connection = await mysql.createConnection(databaseUrl(url, name))
      try {
        const [found] = await connection.query(sql)
        const flat: readonly unknown[] = Array.isArray(found) ? found.flat() : []
        return flat.filter(isRow)
      } finally {
        await connection.end()
      }
    },
    drop: async (url, name) => {
      const connection = await mysql.createConnection(url)
      try {
        await connection.query(`DROP DATABASE IF EXISTS \`${name}\``)
      } finally {
        await connection.end()
      }
    },
  },
  {
    dialect: 'cockroachdb',
    url: process.env.HEKIREKI_SEED_COCKROACH,
    isolate: databaseUrl,
    q: (name) => `"${name}"`,
    exec: async (url, name, sql) => {
      const client = await cockroach(url, name)
      try {
        await runEach(client, sql.map((statement) => `${statement};\n`).join(''))
      } finally {
        await client.end()
      }
    },
    migrate: async (url, name, run) => {
      const client = await cockroach(url, name)
      try {
        if (run.before !== undefined) await runEach(client, run.before)
        const rows = await Promise.all(
          (run.queries ?? []).map(async (query) => (await client.query<Row>(query)).rows),
        )
        await runEach(client, run.script)
        return { error: null, rows }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), rows: [] }
      } finally {
        await client.end()
      }
    },
    rows: async (url, name, sql) => {
      const client = await cockroach(url, name)
      try {
        return (await client.query<Row>(sql)).rows
      } finally {
        await client.end()
      }
    },
    drop: async (url, name) => {
      const client = new Client({ connectionString: url })
      await client.connect()
      try {
        await client.query(`DROP DATABASE IF EXISTS "${name}" CASCADE`)
      } finally {
        await client.end()
      }
    },
  },
]

/** CockroachDB counts an Int id up with a sequence; autoincrement() is for its BigInt. */
function increment(provider: string) {
  return provider === 'cockroachdb' ? 'sequence()' : 'autoincrement()'
}

/**
 * The code column: VarChar(100) cut to 5, which the database converts in place and refuses
 * what does not fit. CockroachDB's String(n) has Prisma drop and add the column again, so it
 * keeps its length there.
 */
function codeType(provider: string, length: number) {
  return provider === 'cockroachdb' ? '@db.String(100)' : `@db.VarChar(${length})`
}

// The report: EDITOR goes, email turns unique, name turns required, Post.authorId becomes a
// foreign key, views turns Int, nickname and Legacy go.
function oldSchema(provider: string) {
  return `datasource db {
  provider = "${provider}"
}

enum Role {
  ADMIN
  EDITOR
  VIEWER
}

model User {
  id       Int     @id @default(${increment(provider)})
  email    String
  name     String?
  nickname String?
  role     Role    @default(VIEWER)
}

model Post {
  id       Int     @id @default(${increment(provider)})
  title    String
  authorId Int?
  views    String?
}

model Legacy {
  id   Int    @id
  note String
}
`
}

function newSchema(provider: string) {
  return `datasource db {
  provider = "${provider}"
}

enum Role {
  ADMIN
  VIEWER
}

model User {
  id    Int    @id @default(${increment(provider)})
  email String @unique
  name  String
  role  Role   @default(VIEWER)
  posts Post[]
}

model Post {
  id       Int    @id @default(${increment(provider)})
  title    String
  authorId Int?
  author   User?  @relation(fields: [authorId], references: [id])
  views    Int?
}
`
}

// The ground truth: every change here keeps the rows it has, so the migration drops nothing.
// PostgreSQL has no cast from text to integer and would drop `views`, so it keeps its type there.
function strictOld(provider: string) {
  return `datasource db {
  provider = "${provider}"
}

enum Role {
  ADMIN
  EDITOR
  VIEWER
}

model User {
  id    Int     @id
  email String
  name  String?
  role  Role    @default(VIEWER)
  score BigInt?
  code  String? ${codeType(provider, 100)}
}

model Post {
  id       Int     @id
  authorId Int?
  views    String?
}

model Session {
  id Int @id
}
`
}

function strictNew(provider: string) {
  return `datasource db {
  provider = "${provider}"
}

enum Role {
  ADMIN
  VIEWER
}

model User {
  id    Int     @id
  email String  @unique
  name  String
  role  Role    @default(VIEWER)
  score Int?
  code  String? ${codeType(provider, 5)}
  posts Post[]
}

model Post {
  id       Int     @id
  authorId Int?
  author   User?   @relation(fields: [authorId], references: [id])
  views    ${provider === 'mysql' ? 'Int?' : 'String?'}
}

model Session {
  id    Int    @id
  token String @default(uuid())
}
`
}

/** Rows that fit the strict new schema. */
function strictRows(q: (name: string) => string) {
  return [
    `INSERT INTO ${q('User')} (${q('id')}, ${q('email')}, ${q('name')}, ${q('role')}, ${q('score')}, ${q('code')}) VALUES (1, 'a@example.com', 'Ann', 'ADMIN', 10, 'ab'), (2, 'b@example.com', 'Bo', 'VIEWER', 20, 'cd')`,
    `INSERT INTO ${q('Post')} (${q('id')}, ${q('authorId')}, ${q('views')}) VALUES (1, 1, '5'), (2, NULL, NULL)`,
  ]
}

/** One problem each, the subject and count the check has to report for it, and the rows that make it. */
const BREAKS: readonly {
  readonly name: string
  readonly subject: string
  readonly only?: readonly Dialect[]
  readonly sql: (q: (name: string) => string) => readonly string[]
}[] = [
  {
    name: 'nulls',
    subject: 'User.name',
    sql: (q) => [`UPDATE ${q('User')} SET ${q('name')} = NULL WHERE ${q('id')} = 2`],
  },
  {
    name: 'enum',
    subject: 'User.role',
    sql: (q) => [`UPDATE ${q('User')} SET ${q('role')} = 'EDITOR' WHERE ${q('id')} = 2`],
  },
  {
    name: 'dupes',
    subject: 'User.email',
    sql: (q) => [`UPDATE ${q('User')} SET ${q('email')} = 'a@example.com' WHERE ${q('id')} = 2`],
  },
  {
    name: 'orphan',
    subject: 'Post.author → User',
    sql: (q) => [`UPDATE ${q('Post')} SET ${q('authorId')} = 99 WHERE ${q('id')} = 2`],
  },
  {
    name: 'range',
    subject: 'User.score',
    sql: (q) => [`UPDATE ${q('User')} SET ${q('score')} = 3000000000 WHERE ${q('id')} = 2`],
  },
  {
    name: 'length',
    subject: 'User.code',
    only: ['postgresql', 'mysql'],
    sql: (q) => [`UPDATE ${q('User')} SET ${q('code')} = 'abcdefghij' WHERE ${q('id')} = 2`],
  },
  {
    name: 'convert',
    subject: 'Post.views',
    only: ['mysql'],
    sql: (q) => [`UPDATE ${q('Post')} SET ${q('views')} = 'many' WHERE ${q('id')} = 1`],
  },
  {
    name: 'added',
    subject: 'Session.token',
    sql: (q) => [`INSERT INTO ${q('Session')} (${q('id')}) VALUES (1)`],
  },
]

/** Creates the tables of the schema in an empty schema or database; nothing is there to lose. */
function push(schema: string, url: string, dir: string) {
  const result = spawnSync(prisma, ['db', 'push', '--schema', schema, '--url', url], {
    cwd: dir,
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(`${result.stdout}${result.stderr}`)
}

/**
 * The migration Prisma Migrate writes from one schema to the other. `migrate diff` reads no
 * database for it, but its schema engine is started with the datasource of prisma.config.ts.
 */
function migration(from: string, to: string, url: string, dir: string) {
  const cwd = join(dir, 'diff')
  mkdirSync(cwd, { recursive: true })
  writeFileSync(
    join(cwd, 'prisma.config.ts'),
    `export default { datasource: { url: ${JSON.stringify(url)} } }\n`,
  )
  const result = spawnSync(
    prisma,
    ['migrate', 'diff', '--from-schema', from, '--to-schema', to, '--script'],
    { cwd, encoding: 'utf8' },
  )
  if (result.status !== 0) throw new Error(`${result.stdout}${result.stderr}`)
  const script = result.stdout
    .split('\n')
    .filter((line) => !line.startsWith('Loaded Prisma config'))
    .join('\n')
  if (!script.includes('ALTER TABLE')) throw new Error(`No migration written:\n${result.stdout}`)
  return script
}

/** The built CLI from the repository root, where the pg and mysql2 drivers resolve from. */
function check(schema: string, url: string, decisions: string | null = null) {
  const result = spawnSync(
    'node',
    [
      cli,
      'migrate',
      'check',
      '--schema',
      schema,
      '--url',
      url,
      '--json',
      ...(decisions === null ? [] : ['--decisions', decisions]),
    ],
    { cwd: root, encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' } },
  )
  const report: {
    readonly ok: boolean
    readonly summary: Readonly<Record<string, number>>
    readonly checks: readonly Row[]
    readonly fixes: readonly Row[]
    readonly previews: readonly { readonly model: string; readonly sql: string }[]
    readonly plan: string
  } = JSON.parse(
    result.stdout || '{"ok":false,"summary":{},"checks":[],"fixes":[],"previews":[],"plan":""}',
  )
  return { status: result.status, report, err: result.stderr }
}

function problems(checks: readonly Row[]) {
  return checks
    .filter((c) => c.status !== 'passed' && c.status !== 'guaranteed')
    .map((c) => [c.status, c.subject, c.count])
}

for (const target of TARGETS) {
  describe.skipIf(target.url === undefined)(`hekireki migrate check on ${target.dialect}`, () => {
    const base = target.url ?? ''
    const names = { old: `${RUN}_old`, new: `${RUN}_new` }
    const state = { dir: '', script: '', mariadb: false }
    const scenarios = [...BREAKS.map((b) => b.name), 'rounded', 'clean', 'fixed'].map(
      (name) => `${RUN}_${name}`,
    )

    beforeAll(async () => {
      if (target.url === undefined) return
      state.dir = mkdtempSync(join(tmpdir(), `hekireki-migrate-${target.dialect}-`))
      const file = (name: string, text: string) => {
        writeFileSync(join(state.dir, name), text)
        return join(state.dir, name)
      }
      file('old.prisma', oldSchema(target.dialect))
      file('new.prisma', newSchema(target.dialect))
      const strictFrom = file('strict-old.prisma', strictOld(target.dialect))
      const strictTo = file('strict-new.prisma', strictNew(target.dialect))
      push(join(state.dir, 'old.prisma'), target.isolate(base, names.old), state.dir)
      push(join(state.dir, 'new.prisma'), target.isolate(base, names.new), state.dir)
      for (const name of scenarios) push(strictFrom, target.isolate(base, name), state.dir)
      state.script = migration(strictFrom, strictTo, base, state.dir)
      const { q } = target
      await target.exec(base, names.old, [
        `INSERT INTO ${q('User')} (${q('id')}, ${q('email')}, ${q('name')}, ${q('nickname')}, ${q('role')}) VALUES (1, 'a@example.com', 'Ann', NULL, 'ADMIN'), (2, 'a@example.com', NULL, 'annie', 'EDITOR'), (3, 'b@example.com', NULL, NULL, 'VIEWER'), (4, 'b@example.com', 'Dan', NULL, 'EDITOR'), (5, 'c@example.com', 'Eve', NULL, 'VIEWER')`,
        `INSERT INTO ${q('Post')} (${q('id')}, ${q('title')}, ${q('authorId')}, ${q('views')}) VALUES (1, 'p', 1, '10'), (2, 'q', 99, NULL), (3, 'r', NULL, 'many')`,
        `INSERT INTO ${q('Legacy')} VALUES (1, 'old')`,
      ])
      const rounded = {
        name: 'rounded',
        sql: (quoted: (name: string) => string) => [
          `UPDATE ${quoted('Post')} SET ${quoted('views')} = '10.5' WHERE ${quoted('id')} = 1`,
        ],
      }
      if (target.dialect === 'mysql') {
        const connection = await mysql.createConnection(base)
        const [rows] = await connection.query('SELECT VERSION() AS `version`')
        await connection.end()
        state.mariadb = /mariadb/iu.test(JSON.stringify(rows))
      }
      // Every problem but the added column at once, for the decisions to settle.
      const fixed = {
        name: 'fixed',
        sql: (quoted: (name: string) => string) =>
          BREAKS.filter(
            (b) => b.name !== 'added' && (b.only === undefined || b.only.includes(target.dialect)),
          ).flatMap((b) => b.sql(quoted)),
      }
      // Kept apart from the schemas, and named by --decisions: every other check here runs without them.
      decide(join(state.dir, 'fixed'), [
        { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
        { kind: 'enum', modelName: 'User', field: 'role', choice: 'map', value: 'EDITOR=VIEWER' },
        {
          kind: 'unique',
          modelName: 'User',
          field: 'email',
          choice: 'keep-first-delete',
          value: null,
        },
        {
          kind: 'value-out-of-range',
          modelName: 'User',
          field: 'score',
          choice: 'clamp',
          value: null,
        },
        ...(target.dialect === 'cockroachdb'
          ? []
          : [
              {
                kind: 'value-too-long',
                modelName: 'User',
                field: 'code',
                choice: 'truncate',
                value: null,
              },
            ]),
        ...(target.dialect === 'mysql'
          ? [
              {
                kind: 'value-not-convertible',
                modelName: 'Post',
                field: 'views',
                choice: 'null',
                value: null,
              },
            ]
          : []),
        { kind: 'foreign-key', modelName: 'Post', field: 'author', choice: 'null', value: null },
      ])
      await Promise.all(
        [...BREAKS, rounded, fixed, { name: 'clean', sql: () => [] }].map((scenario) =>
          target.exec(base, `${RUN}_${scenario.name}`, [...strictRows(q), ...scenario.sql(q)]),
        ),
      )
    })

    afterAll(async () => {
      if (target.url !== undefined) {
        await Promise.all(
          [names.old, names.new, ...scenarios].map((name) => target.drop(base, name)),
        )
      }
      if (state.dir !== '') rmSync(state.dir, { recursive: true, force: true })
    })

    it('counts every row that breaks the new schema, and fails', () => {
      const { status, report } = check(
        join(state.dir, 'new.prisma'),
        target.isolate(base, names.old),
      )
      expect(status).toBe(1)
      expect(problems(report.checks)).toStrictEqual([
        ['blocking', 'User.name', 2],
        ['blocking', 'User.role', 2],
        ['blocking', 'User.email', 2],
        ['warning', 'User.nickname', 1],
        // PostgreSQL and CockroachDB drop and re-add the column, losing both values; MySQL converts it in
        // place and refuses 'many'.
        target.dialect !== 'mysql' ? ['warning', 'Post.views', 2] : ['blocking', 'Post.views', 1],
        ['blocking', 'Post.author → User', 1],
        ['warning', 'Legacy', 1],
      ])
    })

    it('passes once the rows are fixed, the drops left as warnings', async () => {
      const { q } = target
      await target.exec(base, names.old, [
        `UPDATE ${q('User')} SET ${q('name')} = 'unknown' WHERE ${q('name')} IS NULL`,
        `UPDATE ${q('User')} SET ${q('role')} = 'VIEWER' WHERE ${q('role')} = 'EDITOR'`,
        `UPDATE ${q('User')} SET ${q('email')} = 'a2@example.com' WHERE ${q('id')} = 2`,
        `UPDATE ${q('User')} SET ${q('email')} = 'b2@example.com' WHERE ${q('id')} = 4`,
        `UPDATE ${q('Post')} SET ${q('authorId')} = NULL WHERE ${q('authorId')} = 99`,
        `UPDATE ${q('Post')} SET ${q('views')} = '3' WHERE ${q('views')} = 'many'`,
      ])
      const { status, report } = check(
        join(state.dir, 'new.prisma'),
        target.isolate(base, names.old),
      )
      expect(status).toBe(0)
      expect(report.summary).toMatchObject({
        blocking: 0,
        warning: target.dialect === 'mysql' ? 2 : 3,
        failed: 0,
      })
    })

    it('finds every check guaranteed by the constraints Prisma creates for the schema', () => {
      const { status, report } = check(
        join(state.dir, 'new.prisma'),
        target.isolate(base, names.new),
      )
      expect(status).toBe(0)
      expect(problems(report.checks)).toStrictEqual([])
      expect(report.summary.guaranteed).toBe(report.checks.length)
    })

    for (const scenario of BREAKS) {
      it.skipIf(scenario.only !== undefined && !scenario.only.includes(target.dialect))(
        `blocks on ${scenario.subject} alone, and Prisma's migration does not go through cleanly`,
        async () => {
          const url = target.isolate(base, `${RUN}_${scenario.name}`)
          const { status, report } = check(join(state.dir, 'strict-new.prisma'), url)
          expect(status).toBe(1)
          expect(problems(report.checks)).toStrictEqual([['blocking', scenario.subject, 1]])
          const { error: failure } = await target.migrate(base, `${RUN}_${scenario.name}`, {
            script: state.script,
          })
          if (target.dialect === 'mysql' && scenario.name === 'added') {
            // MySQL does not refuse the column: it fills the row with '' where Prisma Client
            // would have written a UUID.
            expect(failure).toBeNull()
            const connection = await mysql.createConnection(url)
            const [rows] = await connection.query('SELECT `token` FROM `Session`')
            await connection.end()
            expect(rows).toStrictEqual([{ token: '' }])
          } else {
            expect(failure).not.toBeNull()
          }
        },
      )
    }

    it.skipIf(target.dialect !== 'mysql')(
      'reads 10.5 as the server does: MySQL rounds it into the integer, MariaDB refuses it',
      async () => {
        const url = target.isolate(base, `${RUN}_rounded`)
        const { report } = check(join(state.dir, 'strict-new.prisma'), url)
        const { error: failure } = await target.migrate(base, `${RUN}_rounded`, {
          script: state.script,
        })
        if (state.mariadb) {
          expect(problems(report.checks)).toStrictEqual([['blocking', 'Post.views', 1]])
          expect(failure).not.toBeNull()
        } else {
          // MySQL takes it, and the value changes: the check says so, and nothing blocks.
          expect(problems(report.checks)).toStrictEqual([['warning', 'Post.views', 1]])
          expect(failure).toBeNull()
        }
      },
    )

    it("passes with the decisions, whose plan leaves the rows as previewed and lets Prisma's migration through", async () => {
      const url = target.isolate(base, `${RUN}_fixed`)
      const decisions = join(state.dir, 'fixed', '.hekireki', 'migrate.json')
      const blocked = check(join(state.dir, 'strict-new.prisma'), url)
      expect(blocked.status).toBe(1)
      const { status, report } = check(join(state.dir, 'strict-new.prisma'), url, decisions)
      expect(status).toBe(0)
      expect(problems(report.checks)).toStrictEqual([])
      // The columns are fixed first, one after another, then the duplicates, then the orphans:
      // user 2, the row every problem was put in, is fixed column by column before it goes as
      // a duplicate, and post 2, pointing at user 99, loses its author.
      expect(report.fixes.map((fix) => [fix.subject, fix.rows])).toStrictEqual([
        ['User.name', 1],
        ['User.role', 1],
        ['User.score', 1],
        ...(target.dialect === 'cockroachdb' ? [] : [['User.code', 1]]),
        ['User.email', 1],
        ...(target.dialect === 'mysql' ? [['Post.views', 1]] : []),
        ['Post.author → User', 1],
      ])
      const predicted = await Promise.all(
        report.previews.map((preview) => target.rows(base, `${RUN}_fixed`, preview.sql)),
      )
      const { q } = target
      const ran = await target.migrate(base, `${RUN}_fixed`, {
        before: report.plan,
        queries: [
          `SELECT * FROM ${q('User')} ORDER BY ${q('id')}`,
          `SELECT * FROM ${q('Post')} ORDER BY ${q('id')}`,
        ],
        script: state.script,
      })
      expect(ran.error).toBeNull()
      expect(ran.rows).toStrictEqual(predicted)
    })

    it("passes on rows that fit, and Prisma's migration goes through", async () => {
      const url = target.isolate(base, `${RUN}_clean`)
      const { status, report } = check(join(state.dir, 'strict-new.prisma'), url)
      expect(status).toBe(0)
      expect(problems(report.checks)).toStrictEqual([])
      expect(
        (await target.migrate(base, `${RUN}_clean`, { script: state.script })).error,
      ).toBeNull()
    })
  })
}
