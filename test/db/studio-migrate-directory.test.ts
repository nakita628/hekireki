import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import mysql from 'mysql2/promise'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

// The Migrate page of `hekireki studio` where no schema engine can be asked: MySQL, and a
// PostgreSQL schema other than `public`, which the wasm engine cannot read, with no native engine
// to run in its place (`PRISMA_SCHEMA_ENGINE_BINARY` names one that is not there; with one,
// studio-migrate-native.test.ts runs the same databases through it). There the migrations directory
// is the plan: a migration Prisma wrote with `prisma migrate diff`, checked against the rows,
// with the fixes of a decision written into it, rehearsed, run and recorded by Studio, and the
// history Studio keeps has to be the one Prisma keeps: `prisma migrate status` has to find the
// database up to date, and `prisma migrate deploy` nothing left to run. A deploy from the page,
// a migration that fails and is marked rolled back, and a file edited after it ran are read as
// Prisma reads them too.
//
//   HEKIREKI_SEED_PG=postgresql://postgres:postgres@localhost:5432/seed
//   HEKIREKI_SEED_MYSQL=mysql://root:root@localhost:3306/seed

const root = resolve(import.meta.dirname, '..', '..')
const pkg = join(root, 'packages', 'hekireki')
const cli = join(pkg, 'dist', 'bin', 'hekireki.js')
const prisma = join(pkg, 'node_modules', '.bin', 'prisma')

const APART = `hekireki_studio_directory_${process.pid}_${Date.now()}`

const TARGETS = [
  {
    name: 'mysql',
    provider: 'mysql',
    withoutEngine: 'mysql',
    url: process.env.HEKIREKI_SEED_MYSQL,
    isolate: (url: string) => Object.assign(new URL(url), { pathname: `/${APART}` }).toString(),
    packages: ['mysql2'],
    port: 5923,
    q: (name: string) => `\`${name}\``,
    sql: async (url: string, text: string) => {
      const connection = await mysql.createConnection(url)
      try {
        const [rows] = await connection.query(text)
        return Array.isArray(rows) ? rows.map((row) => structuredClone(row)) : []
      } finally {
        await connection.end()
      }
    },
    create: `CREATE DATABASE \`${APART}\``,
    drop: `DROP DATABASE IF EXISTS \`${APART}\``,
  },
  {
    name: 'postgresql, schema other than public',
    provider: 'postgresql',
    withoutEngine: 'schema',
    url: process.env.HEKIREKI_SEED_PG,
    isolate: (url: string) => {
      const isolated = new URL(url)
      isolated.searchParams.set('schema', APART)
      return isolated.toString()
    },
    packages: ['pg'],
    port: 5924,
    q: (name: string) => `"${name}"`,
    sql: async (url: string, text: string) => {
      const found = new URL(url)
      const schema = found.searchParams.get('schema')
      found.searchParams.delete('schema')
      const client = new Client({ connectionString: found.toString() })
      await client.connect()
      try {
        if (schema !== null) await client.query(`SET search_path TO "${schema}"`)
        return (await client.query(text)).rows.map((row: unknown) => structuredClone(row))
      } finally {
        await client.end()
      }
    },
    create: `CREATE SCHEMA "${APART}"`,
    drop: `DROP SCHEMA IF EXISTS "${APART}" CASCADE`,
  },
]

function schemaOf(provider: string, name: string) {
  return `datasource db {
  provider = "${provider}"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  ${name}
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}
`
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

describe.each(TARGETS)('the Migrate page without the schema engine on $name', (target) => {
  const state: { dir: string; url: string; studio: ChildProcess | null } = {
    dir: '',
    url: '',
    studio: null,
  }
  const base = `http://127.0.0.1:${target.port}`
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
    return { status: response.status, json: (await response.json()) as Record<string, any> }
  }
  const prismaIn = (args: readonly string[]) => {
    const result = spawnSync(prisma, args, { cwd: state.dir, encoding: 'utf8' })
    return { status: result.status, out: `${result.stdout}${result.stderr}` }
  }
  /** What `prisma migrate diff` writes between two schema files, as a migration of the directory. */
  const writeMigration = (name: string, from: string, to: string) => {
    const written = spawnSync(
      prisma,
      ['migrate', 'diff', '--from-schema', from, '--to-schema', to, '--script'],
      { cwd: state.dir, encoding: 'utf8' },
    )
    expect({ status: written.status, err: written.stderr }).toMatchObject({ status: 0 })
    const sql = written.stdout
      .split('\n')
      .filter((line) => !line.startsWith('Loaded Prisma config'))
      .join('\n')
    mkdirSync(join(state.dir, 'migrations', name), { recursive: true })
    writeFileSync(join(state.dir, 'migrations', name, 'migration.sql'), sql)
    return sql
  }

  beforeAll(async () => {
    if (target.url === undefined) return
    await target.sql(target.url.replace(/\?.*$/u, ''), target.drop)
    await target.sql(target.url.replace(/\?.*$/u, ''), target.create)
    state.url = target.isolate(target.url)
    state.dir = mkdtempSync(join(tmpdir(), `hekireki-directory-${target.provider}-`))
    for (const name of target.packages) {
      const at = join(state.dir, 'node_modules', name)
      mkdirSync(join(at, '..'), { recursive: true })
      symlinkSync(realpathSync(join(root, 'node_modules', name)), at, 'dir')
    }
    writeFileSync(join(state.dir, 'schema.prisma'), schemaOf(target.provider, 'String?'))
    writeFileSync(join(state.dir, 'optional.prisma'), schemaOf(target.provider, 'String?'))
    writeFileSync(join(state.dir, 'required.prisma'), schemaOf(target.provider, 'String'))
    writeFileSync(
      join(state.dir, 'prisma.config.ts'),
      `export default { schema: 'schema.prisma', migrations: { path: 'migrations' }, datasource: { url: ${JSON.stringify(state.url)} } }\n`,
    )
    mkdirSync(join(state.dir, 'migrations'), { recursive: true })
    writeFileSync(
      join(state.dir, 'migrations', 'migration_lock.toml'),
      `provider = "${target.provider}"\n`,
    )
    // The database as a project that has migrated once: its first migration applied and recorded.
    const empty = join(state.dir, 'empty.prisma')
    writeFileSync(empty, `datasource db {\n  provider = "${target.provider}"\n}\n`)
    const init = writeMigration('20260101000000_init', 'empty.prisma', 'optional.prisma')
    expect(init).toContain('CREATE TABLE')
    expect(prismaIn(['migrate', 'deploy']).status).toBe(0)
    await target.sql(
      state.url,
      `INSERT INTO ${target.q('User')} (${target.q('email')}, ${target.q('name')}) VALUES ('ann@example.com', 'Ann'), ('bob@example.com', NULL), ('cy@example.com', NULL)`,
    )
    state.studio = spawn(
      'node',
      [cli, 'studio', '--schema', 'schema.prisma', '--url', state.url, '-p', String(target.port)],
      // No native schema engine to run: what Studio falls back to when @prisma/engines has none.
      {
        cwd: state.dir,
        stdio: 'ignore',
        env: { ...process.env, PRISMA_SCHEMA_ENGINE_BINARY: join(state.dir, 'no-schema-engine') },
      },
    )
    expect(await serving(`${base}/api/schema`, Date.now() + 30_000)).toBe(true)
  })

  afterAll(async () => {
    state.studio?.kill()
    if (target.url !== undefined) await target.sql(target.url.replace(/\?.*$/u, ''), target.drop)
    if (state.dir !== '') rmSync(state.dir, { recursive: true, force: true })
  })

  it.skipIf(target.url === undefined)(
    'reads the history Prisma recorded, and says it plans from the directory',
    async () => {
      const status = await call('/api/migrate')
      expect(status.status).toBe(200)
      expect(status.json).toMatchObject({
        withoutEngine: target.withoutEngine,
        hasMigrationsTable: true,
        pending: [],
        failed: [],
        edited: [],
        missingFiles: [],
        drift: false,
        baselineNeeded: false,
      })
      expect(status.json.applied.map((one: { name: string }) => one.name)).toStrictEqual([
        '20260101000000_init',
      ])
      // What only the engine can do is refused in words, not attempted.
      expect((await call('/api/migrate/diff')).status).not.toBe(200)
    },
  )

  it.skipIf(target.url === undefined)(
    'plans the migration Prisma wrote with the fixes of a decision, rehearses it, runs it and records it as Prisma does',
    async () => {
      const name = '20260201000000_required_name'
      writeMigration(name, 'optional.prisma', 'required.prisma')
      writeFileSync(join(state.dir, 'schema.prisma'), schemaOf(target.provider, 'String'))
      expect((await call('/api/schema/reload', {})).status).toBe(200)
      expect((await call('/api/migrate')).json).toMatchObject({ pending: [name], drift: true })

      // Without a decision, the two rows with no name block it.
      const blocked = await call('/api/migrate/plan', {})
      expect(blocked.status).toBe(200)
      expect(blocked.json.migration).toBe(name)
      expect(
        blocked.json.checks
          .filter((check: { status: string }) => check.status === 'blocking')
          .map((check: { subject: string; count: number }) => [check.subject, check.count]),
      ).toStrictEqual([['User.name', 2]])

      const decisions = [
        { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
      ]
      const planned = await call('/api/migrate/plan', { decisions })
      expect(planned.status).toBe(200)
      expect({
        migration: planned.json.migration,
        name: planned.json.name,
        errors: planned.json.errors,
      }).toStrictEqual({
        migration: name,
        name,
        errors: [],
      })
      const steps = planned.json.steps as { kind: string; statements: string[] }[]
      expect(steps[0]?.kind).toBe('fix')

      // The rehearsal runs it where nothing is kept, and does not claim to compare the schema.
      const rehearsed = await call('/api/migrate/rehearse', {
        steps: steps.map((step) => step.statements),
      })
      expect({
        status: rehearsed.status,
        detail: rehearsed.json.detail,
        ok: rehearsed.json.ok,
        matches: rehearsed.json.schemaMatches,
      }).toStrictEqual({
        status: 200,
        detail: undefined,
        ok: true,
        matches: null,
      })
      const nameless = `SELECT COUNT(*) AS ${target.q('rows')} FROM ${target.q('User')} WHERE ${target.q('name')} IS NULL`
      expect(Number((await target.sql(state.url, nameless))[0]?.rows)).toBe(2)
      if (target.provider === 'mysql') {
        expect(
          await target.sql(
            target.url?.replace(/\?.*$/u, '') ?? '',
            `SHOW DATABASES LIKE 'hk\\_rehearsal%'`,
          ),
        ).toStrictEqual([])
      }

      for (const step of steps) {
        const applied = await call('/api/migrate/apply', { statements: step.statements })
        expect(applied.json).toMatchObject({ ok: true })
      }
      const sql = steps.flatMap((step) => step.statements.map((one) => `${one};`)).join('\n')
      const created = await call('/api/migrate/migrations', {
        name: 'ignored',
        sql,
        existing: name,
      })
      expect(created.json).toMatchObject({ name })
      // The fixes are in the migration now, for every other database it is deployed to.
      expect(readFileSync(join(state.dir, 'migrations', name, 'migration.sql'), 'utf8')).toContain(
        "'unknown'",
      )
      const recorded = await call('/api/migrate/migrations/applied', { name })
      expect(recorded.status).toBe(200)
      expect(recorded.json).toMatchObject({ pending: [], failed: [], edited: [], drift: false })

      // Prisma reads the history Studio wrote as its own.
      const prismaStatus = prismaIn(['migrate', 'status'])
      expect({ status: prismaStatus.status, out: prismaStatus.out }).toMatchObject({ status: 0 })
      expect(prismaStatus.out).toContain('Database schema is up to date')
      expect(prismaIn(['migrate', 'deploy']).out).toContain('No pending migrations to apply')
      expect(Number((await target.sql(state.url, nameless))[0]?.rows)).toBe(0)
    },
  )

  it.skipIf(target.url === undefined)(
    'deploys what is waiting, keeps a failure in the history as Prisma does, and takes it back',
    async () => {
      const good = '20260301000000_title_index'
      mkdirSync(join(state.dir, 'migrations', good), { recursive: true })
      writeFileSync(
        join(state.dir, 'migrations', good, 'migration.sql'),
        `-- CreateIndex\nCREATE INDEX ${target.q('Post_title_idx')} ON ${target.q('Post')}(${target.q('title')});\n`,
      )
      const deployed = await call('/api/migrate/deploy', {})
      expect({ status: deployed.status, json: deployed.json }).toStrictEqual({
        status: 200,
        json: { applied: [good] },
      })
      expect(prismaIn(['migrate', 'status']).status).toBe(0)

      const bad = '20260401000000_broken'
      mkdirSync(join(state.dir, 'migrations', bad), { recursive: true })
      writeFileSync(
        join(state.dir, 'migrations', bad, 'migration.sql'),
        `ALTER TABLE ${target.q('Nowhere')} ADD COLUMN ${target.q('x')} INTEGER;\n`,
      )
      const failed = await call('/api/migrate/deploy', {})
      expect(failed.status).not.toBe(200)
      expect((await call('/api/migrate')).json).toMatchObject({ failed: [bad] })
      // Prisma sees the same failure, and refuses to deploy past it.
      expect(prismaIn(['migrate', 'deploy']).out).toContain(bad)

      const taken = await call('/api/migrate/migrations/rolled-back', { name: bad })
      expect(taken.status).toBe(200)
      expect(taken.json).toMatchObject({ failed: [], pending: [bad] })
      rmSync(join(state.dir, 'migrations', bad), { recursive: true, force: true })
      expect(prismaIn(['migrate', 'status']).status).toBe(0)

      // A migration changed after it ran is read as edited.
      const file = join(state.dir, 'migrations', good, 'migration.sql')
      const kept = readFileSync(file, 'utf8')
      writeFileSync(file, `${kept}-- changed\n`)
      expect((await call('/api/migrate')).json.edited).toStrictEqual([good])
      writeFileSync(file, kept)
      expect((await call('/api/migrate')).json.edited).toStrictEqual([])
    },
  )
})
