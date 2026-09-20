import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import mysql from 'mysql2/promise'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

// The Migrate page of `hekireki studio` against real PostgreSQL and MySQL.
//
// What it is for: the schema engine reads the catalogue through an adapter Studio writes over its
// own connection, and every value it hands back is typed by the OID PostgreSQL reports. A type
// read wrongly would not fail loudly — it would make the engine see a column it cannot match and
// write a migration for a difference that is not there. So the check is a round trip:
// `prisma db push` creates the tables of a schema, and the engine asked for the migration to that
// same schema has to find nothing to do. Every column, index and foreign key has to come back as
// Prisma wrote it for that to hold. Then the schema gains a field and the engine has to write
// exactly the migration for it, which has to run.
//
// MySQL is the other half: the wasm engine has no MySQL connector at all, so Studio runs the native
// schema engine `@prisma/engines` installs on the database's URL, as the Prisma CLI does, and the
// same round trip has to hold through it.
//
//   HEKIREKI_SEED_PG=postgresql://postgres:postgres@localhost:5432/seed
//   HEKIREKI_SEED_MYSQL=mysql://root:root@localhost:3306/seed
//
// The tables live in a database named for this run, which the test creates empty and drops again.
// A PostgreSQL schema would not do here: given a connection rather than a URL the engine reads
// `public` by name, so Studio plans a schema other than public from the migrations directory, as
// it does MySQL. Each target is skipped without a URL.

const root = resolve(import.meta.dirname, '..', '..')
const pkg = join(root, 'packages', 'hekireki')
const cli = join(pkg, 'dist', 'bin', 'hekireki.js')
const prisma = join(pkg, 'node_modules', '.bin', 'prisma')

const APART = `hekireki_studio_migrate_${process.pid}_${Date.now()}`

type Target = {
  readonly dialect: 'postgresql' | 'mysql'
  readonly url: string | undefined
  readonly isolate: (url: string) => string
  /** The packages a project of this dialect installs, which Studio opens the database through. */
  readonly packages: readonly string[]
  /** Creates the database of this run, and nothing else. */
  readonly create: (url: string) => Promise<void>
  readonly port: number
  /** Whether Studio can ask a schema engine of this database: the wasm one, or the native one on its URL. */
  readonly migratable: boolean
  /** What the migration for the added field looks like on this database. */
  readonly added: RegExp
  readonly drop: (url: string) => Promise<void>
}

const TARGETS: readonly Target[] = [
  {
    dialect: 'postgresql',
    url: process.env.HEKIREKI_SEED_PG,
    isolate: (url) => {
      const isolated = new URL(url)
      isolated.pathname = `/${APART}`
      return isolated.toString()
    },
    packages: ['pg'],
    create: async (url) => {
      const client = new Client({ connectionString: url })
      await client.connect()
      try {
        await client.query(`CREATE DATABASE "${APART}"`)
      } finally {
        await client.end()
      }
    },
    port: 5921,
    migratable: true,
    added: /ALTER TABLE "User" ADD COLUMN\s+"nickname" TEXT/u,
    drop: async (url) => {
      const client = new Client({ connectionString: url })
      await client.connect()
      try {
        await client.query(`DROP DATABASE IF EXISTS "${APART}"`)
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
    packages: ['mysql2'],
    create: async (url) => {
      const connection = await mysql.createConnection(url)
      try {
        await connection.query(`CREATE DATABASE \`${APART}\``)
      } finally {
        await connection.end()
      }
    },
    port: 5922,
    migratable: true,
    added: /ALTER TABLE `User` ADD COLUMN `nickname` VARCHAR\(191\)/u,
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

/**
 * A schema with something of every family the catalogue reports differently: a text, an integer,
 * a big integer, a float, a decimal, a boolean, an instant, a JSON document, bytes and an enum,
 * with a unique index and a foreign key over them.
 */
function schemaOf(provider: string) {
  return `datasource db {
  provider = "${provider}"
}

enum Role {
  ADMIN
  VIEWER
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  age       Int?
  visits    BigInt?
  rating    Float?
  balance   Decimal?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  profile   Json?
  avatar    Bytes?
  role      Role     @default(VIEWER)
  posts     Post[]

  @@index([name, age])
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])

  @@unique([title, authorId])
}
`
}

/** The same schema with one field added, which is the whole of the migration it should ask for. */
function changedSchemaOf(provider: string) {
  return schemaOf(provider).replace(
    '  name      String?\n',
    '  name      String?\n  nickname  String?\n',
  )
}

/** A package the project resolves as if it had installed it; Studio ships no database drivers. */
function link(dir: string, name: string, target: string) {
  const at = join(dir, 'node_modules', ...name.split('/'))
  mkdirSync(join(at, '..'), { recursive: true })
  symlinkSync(realpathSync(target), at, 'dir')
}

function run(command: string, args: readonly string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  return result.status === 0
    ? null
    : `${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`
}

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

describe.each(TARGETS)('the Migrate page on $dialect', (target) => {
  // Setup cannot assert; what it could not do is kept here, and every test checks it first.
  const state: { dir: string; studio: ChildProcess | null; failure: string | null } = {
    dir: '',
    studio: null,
    failure: null,
  }
  const base = `http://127.0.0.1:${target.port}`
  const schemaFile = () => join(state.dir, 'schema.prisma')

  const call = async (path: string, body?: unknown) => {
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
    return { status: response.status, json: (await response.json()) as Record<string, unknown> }
  }

  beforeAll(async () => {
    if (target.url === undefined) return
    await target.create(target.url)
    const url = target.isolate(target.url)
    const dir = mkdtempSync(join(tmpdir(), `hekireki-migrate-${target.dialect}-`))
    state.dir = dir
    for (const name of target.packages) link(dir, name, join(root, 'node_modules', name))
    writeFileSync(join(dir, 'schema.prisma'), schemaOf(target.dialect))
    const prepared = run(
      prisma,
      ['db', 'push', '--schema', join(dir, 'schema.prisma'), '--url', url],
      dir,
    )
    if (prepared !== null) {
      state.failure = prepared
      return
    }
    state.studio = spawn(
      'node',
      [
        cli,
        'studio',
        '--schema',
        join(dir, 'schema.prisma'),
        '--url',
        url,
        '-p',
        String(target.port),
      ],
      { cwd: dir, stdio: 'ignore' },
    )
    if (!(await serving(`${base}/api/schema`, Date.now() + 30_000))) {
      state.failure = 'hekireki studio did not start'
    }
  })

  afterAll(async () => {
    state.studio?.kill()
    if (state.dir !== '') rmSync(state.dir, { recursive: true, force: true })
    if (target.url !== undefined) await target.drop(target.url)
  })

  it.skipIf(target.url === undefined || !target.migratable)(
    'reads the catalogue back as Prisma wrote it, so there is nothing to migrate',
    async () => {
      expect(state.failure).toBeNull()
      // Every column, index and foreign key of the schema above, read through Studio's own
      // connection: one of them typed wrongly and the engine would ask for a change here.
      const diff = await call('/api/migrate/diff')
      expect(diff.status).toBe(200)
      expect(diff.json.drift).toBe(false)
      const status = await call('/api/migrate')
      expect(status.status).toBe(200)
      expect(status.json).toMatchObject({ drift: false, pending: [], applied: [] })
    },
  )

  it.skipIf(target.url === undefined || !target.migratable)(
    'writes exactly the migration for a field the schema gains',
    async () => {
      expect(state.failure).toBeNull()
      writeFileSync(schemaFile(), changedSchemaOf(target.dialect))
      const reloaded = await call('/api/schema/reload', {})
      expect(reloaded.status).toBe(200)

      const diff = await call('/api/migrate/diff')
      expect(diff.status).toBe(200)
      expect(diff.json.drift).toBe(true)
      const sql = String(diff.json.sql)
      expect(sql).toMatch(target.added)
      // Only the added column: nothing else of the schema is seen as different.
      expect(sql.match(/ALTER TABLE|CREATE TABLE|DROP TABLE/gu)).toHaveLength(1)

      const planned = await call('/api/migrate/plan', { name: 'nickname' })
      expect(planned.status).toBe(200)
      const steps = planned.json.steps as { statements: string[]; destructive: boolean }[]
      expect(steps).toHaveLength(1)
      expect(steps[0]?.destructive).toBe(false)
      expect(steps[0]?.statements[0]).toMatch(target.added)

      // And it runs, leaving the database in step with the schema again.
      const applied = await call('/api/migrate/apply', { statements: steps[0]?.statements ?? [] })
      expect(applied.json).toMatchObject({ ok: true, failedAt: null })
      const after = await call('/api/migrate/diff')
      expect(after.json.drift).toBe(false)

      writeFileSync(schemaFile(), schemaOf(target.dialect))
    },
  )

  it.skipIf(target.url === undefined || target.dialect !== 'postgresql')(
    'takes a backup nothing of which depends on an enum, and restores the database as it was from it',
    async () => {
      expect(state.failure).toBeNull()
      const sql = async (text: string) => {
        const answered = await call('/api/db/sql', { sql: text })
        expect({ status: answered.status, sql: text }).toStrictEqual({ status: 200, sql: text })
        return answered.json.rows as Record<string, unknown>[]
      }
      await sql(
        `INSERT INTO "User" ("email", "name", "role", "balance") VALUES ('ann@example.com', 'Ann', 'ADMIN', 12.50), ('bob@example.com', NULL, 'VIEWER', NULL)`,
      )
      await sql(`INSERT INTO "Post" ("title", "authorId") VALUES ('Hello', 1), ('Again', 1)`)

      // What the engine makes of the database as the backup finds it (the column the test before
      // this one added is still there): a restore has to bring back exactly that.
      // The schema file was put back by the test before; Studio reads it again before it is asked.
      expect((await call('/api/schema/reload', {})).status).toBe(200)
      const before = await call('/api/migrate/diff')

      const taken = await call('/api/migrate/backups', {})
      expect({ status: taken.status, detail: taken.json.detail }).toStrictEqual({
        status: 200,
        detail: undefined,
      })
      expect(taken.json.restorable).toBe(true)
      const name = String(taken.json.name)
      // A copy that kept the type of `role` would hold it: PostgreSQL refuses the `DROP TYPE`
      // Prisma ends every change of an enum with while a column of any table is still of it.
      expect(
        await sql(
          `SELECT a.attname AS "column" FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_type t ON t.oid = a.atttypid LEFT JOIN pg_type e ON e.oid = t.typelem WHERE n.nspname = '${name}' AND a.attnum > 0 AND (t.typtype = 'e' OR e.typtype = 'e')`,
        ),
      ).toStrictEqual([])

      // What a migration that loses data does, and more: a table, a column, the enum and rows go.
      const wrecked = await call('/api/migrate/apply', {
        statements: [
          'DROP TABLE "Post"',
          'ALTER TABLE "User" DROP COLUMN "email"',
          'ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT',
          'ALTER TABLE "User" ALTER COLUMN "role" TYPE text',
          'DROP TYPE "Role"',
          'DELETE FROM "User"',
        ],
      })
      expect(wrecked.json).toMatchObject({ ok: true })
      expect((await call('/api/migrate/diff')).json.drift).toBe(true)

      const restored = await call('/api/migrate/backups/restore', { name })
      expect({ status: restored.status, detail: restored.json.detail }).toStrictEqual({
        status: 200,
        detail: undefined,
      })
      // The engine reads the database as it read it before the backup: every column, default,
      // key, index and the enum are back as they were.
      const after = await call('/api/migrate/diff')
      expect({ drift: after.json.drift, sql: after.json.sql }).toStrictEqual({
        drift: before.json.drift,
        sql: before.json.sql,
      })
      expect(
        await sql(
          `SELECT "id", "email", "name", "role"::text AS "role", "balance"::float8::text AS "balance" FROM "User" ORDER BY "id"`,
        ),
      ).toStrictEqual([
        { id: 1, email: 'ann@example.com', name: 'Ann', role: 'ADMIN', balance: '12.5' },
        { id: 2, email: 'bob@example.com', name: null, role: 'VIEWER', balance: null },
      ])
      expect(await sql(`SELECT "title", "authorId" FROM "Post" ORDER BY "id"`)).toStrictEqual([
        { title: 'Hello', authorId: 1 },
        { title: 'Again', authorId: 1 },
      ])
      // The sequence is where it was: the next user is the third, not the first again.
      await sql(`INSERT INTO "User" ("email") VALUES ('cy@example.com')`)
      expect(await sql(`SELECT MAX("id") AS "id" FROM "User"`)).toStrictEqual([{ id: 3 }])
      // The foreign key is back too: a post of nobody is refused.
      const orphan = await call('/api/db/sql', {
        sql: `INSERT INTO "Post" ("title", "authorId") VALUES ('Lost', 99)`,
      })
      expect(orphan.status).not.toBe(200)

      await sql(`DELETE FROM "Post"`)
      await sql(`DELETE FROM "User"`)
      await sql(`DROP SCHEMA "${name}" CASCADE`)
    },
  )

  it.skipIf(target.url === undefined || target.dialect !== 'postgresql')(
    'changes nothing when a restore cannot put everything back: a view the backup does not know holds its table',
    async () => {
      expect(state.failure).toBeNull()
      const sql = async (text: string) => {
        const answered = await call('/api/db/sql', { sql: text })
        expect({ status: answered.status, sql: text }).toStrictEqual({ status: 200, sql: text })
        return answered.json.rows as Record<string, unknown>[]
      }
      await sql(`INSERT INTO "User" ("email") VALUES ('dee@example.com')`)
      const taken = await call('/api/migrate/backups', {})
      expect(taken.status).toBe(200)
      const name = String(taken.json.name)
      // Made after the backup, so the backup has no way to make it again.
      await sql(`CREATE VIEW "Emails" AS SELECT "email" FROM "User"`)
      await sql(`DELETE FROM "User"`)

      const restored = await call('/api/migrate/backups/restore', { name })
      expect(restored.status).not.toBe(200)
      // Why is in the problem's errors: what PostgreSQL said of the view that depends on the table.
      const [why] = restored.json.errors as { message: string }[]
      expect(why?.message).toContain('nothing was changed')
      expect(why?.message).toContain('other objects depend on it')
      // And nothing was: the rows are still gone, and the view is still there.
      expect(await sql(`SELECT COUNT(*)::int AS "rows" FROM "User"`)).toStrictEqual([{ rows: 0 }])
      expect(await sql(`SELECT COUNT(*)::int AS "rows" FROM "Emails"`)).toStrictEqual([{ rows: 0 }])

      // Without the view in the way, the same backup goes back.
      await sql(`DROP VIEW "Emails"`)
      expect((await call('/api/migrate/backups/restore', { name })).status).toBe(200)
      expect(await sql(`SELECT "email" FROM "User"`)).toStrictEqual([{ email: 'dee@example.com' }])
      await sql(`DELETE FROM "User"`)
      await sql(`DROP SCHEMA "${name}" CASCADE`)
    },
  )

  it.skipIf(target.url === undefined || target.dialect !== 'postgresql')(
    'runs a fix over many rows a batch at a time when the plan is asked for one',
    async () => {
      expect(state.failure).toBeNull()
      const sql = async (text: string) => {
        const answered = await call('/api/db/sql', { sql: text })
        expect({ status: answered.status, sql: text }).toStrictEqual({ status: 200, sql: text })
        return answered.json.rows as Record<string, unknown>[]
      }
      await sql(
        `INSERT INTO "User" ("email") SELECT 'u' || n || '@example.com' FROM generate_series(1, 7) AS n`,
      )
      // `name` turns required: seven rows have none.
      writeFileSync(
        schemaFile(),
        schemaOf(target.dialect).replace('  name      String?\n', '  name      String\n'),
      )
      expect((await call('/api/schema/reload', {})).status).toBe(200)

      const planned = await call('/api/migrate/plan', {
        name: 'required_name',
        decisions: [
          { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
        ],
        batch: 3,
      })
      expect(planned.status).toBe(200)
      const steps = planned.json.steps as { kind: string; statements: string[] }[]
      const [fix, ...migration] = steps
      // Seven rows in threes: three statements that take a batch each, and one that takes the rest.
      expect(fix?.kind).toBe('fix')
      expect(fix?.statements).toHaveLength(4)
      expect(fix?.statements[0]).toContain('WHERE ctid IN (SELECT ctid FROM')
      expect(fix?.statements[0]).toContain('LIMIT 3)')

      const nameless = `SELECT COUNT(*)::int AS "rows" FROM "User" WHERE "name" IS NULL`
      const first = await call('/api/migrate/apply', { statements: fix?.statements.slice(0, 1) })
      expect(first.json).toMatchObject({ ok: true })
      expect(await sql(nameless)).toStrictEqual([{ rows: 4 }])
      const rest = await call('/api/migrate/apply', { statements: fix?.statements.slice(1) })
      expect(rest.json).toMatchObject({ ok: true })
      expect(await sql(nameless)).toStrictEqual([{ rows: 0 }])
      for (const step of migration) {
        // A migration is an order, not a set: each step runs on what the one before it left.
        // oxlint-disable-next-line no-await-in-loop -- sequential by definition
        const applied = await call('/api/migrate/apply', { statements: step.statements })
        expect(applied.json).toMatchObject({ ok: true })
      }
      expect((await call('/api/migrate/diff')).json.drift).toBe(false)

      await sql(`ALTER TABLE "User" ALTER COLUMN "name" DROP NOT NULL`)
      await sql(`DELETE FROM "User"`)
      writeFileSync(schemaFile(), schemaOf(target.dialect))
      expect((await call('/api/schema/reload', {})).status).toBe(200)
    },
  )
})
