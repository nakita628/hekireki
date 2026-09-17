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

// The Migrate page of `hekireki studio` on the databases the wasm schema engine cannot read (MySQL,
// and a PostgreSQL schema other than `public`), through the native schema engine `@prisma/engines`
// installs, started on the URL as the Prisma CLI starts it. The page has to do there what it does
// on SQLite and PostgreSQL: find the database differs from the schema, write the migration for
// it, check the rows, write the fixes of a decision into it, rehearse, run and record it. Then
// `prisma migrate status` has to find the database up to date, and `prisma migrate diff` no
// difference between it and the schema.
//
//   HEKIREKI_SEED_PG=postgresql://postgres:postgres@localhost:5432/seed
//   HEKIREKI_SEED_MYSQL=mysql://root:root@localhost:3306/seed

const root = resolve(import.meta.dirname, '..', '..')
const pkg = join(root, 'packages', 'hekireki')
const cli = join(pkg, 'dist', 'bin', 'hekireki.js')
const prisma = join(pkg, 'node_modules', '.bin', 'prisma')

const APART = `hekireki_studio_native_${process.pid}_${Date.now()}`

const TARGETS = [
  {
    name: 'mysql',
    provider: 'mysql',
    // The copy a rehearsal runs on has a URL of its own, which the native engine is asked on.
    compared: true,
    url: process.env.HEKIREKI_SEED_MYSQL,
    isolate: (url: string) => Object.assign(new URL(url), { pathname: `/${APART}` }).toString(),
    packages: ['mysql2'],
    port: 5925,
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
    // A rehearsal runs in a transaction of Studio's connection, which the engine's own cannot see.
    compared: false,
    url: process.env.HEKIREKI_SEED_PG,
    isolate: (url: string) => {
      const isolated = new URL(url)
      isolated.searchParams.set('schema', APART)
      return isolated.toString()
    },
    packages: ['pg'],
    port: 5926,
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

describe.each(TARGETS)('the Migrate page through the native schema engine on $name', (target) => {
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
    state.dir = mkdtempSync(join(tmpdir(), `hekireki-native-${target.provider}-`))
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
      { cwd: state.dir, stdio: 'ignore' },
    )
    expect(await serving(`${base}/api/schema`, Date.now() + 30_000)).toBe(true)
  })

  afterAll(async () => {
    state.studio?.kill()
    if (target.url !== undefined) await target.sql(target.url.replace(/\?.*$/u, ''), target.drop)
    if (state.dir !== '') rmSync(state.dir, { recursive: true, force: true })
  })

  it.skipIf(target.url === undefined)(
    'reads the history through the engine, and finds nothing between the database and the schema',
    async () => {
      const status = await call('/api/migrate')
      expect(status.status).toBe(200)
      expect(status.json).toMatchObject({
        withoutEngine: null,
        hasMigrationsTable: true,
        pending: [],
        failed: [],
        drift: false,
        baselineNeeded: false,
      })
      const diff = await call('/api/migrate/diff')
      expect({ status: diff.status, drift: diff.json.drift }).toStrictEqual({
        status: 200,
        drift: false,
      })
    },
  )

  it.skipIf(target.url === undefined)(
    'writes the migration a changed schema needs, runs it with the fixes of a decision, and records it as Prisma does',
    async () => {
      writeFileSync(join(state.dir, 'schema.prisma'), schemaOf(target.provider, 'String'))
      expect((await call('/api/schema/reload', {})).status).toBe(200)
      const diff = await call('/api/migrate/diff')
      expect(diff.json.drift).toBe(true)
      expect(String(diff.json.sql)).toMatch(/NOT NULL/u)

      const decisions = [
        { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
      ]
      const planned = await call('/api/migrate/plan', { name: 'required_name', decisions })
      expect(planned.status).toBe(200)
      expect({ migration: planned.json.migration, errors: planned.json.errors }).toStrictEqual({
        migration: null,
        errors: [],
      })
      const steps = planned.json.steps as { kind: string; statements: string[] }[]
      expect(steps[0]?.kind).toBe('fix')

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
        matches: target.compared ? true : null,
      })
      const nameless = `SELECT COUNT(*) AS ${target.q('rows')} FROM ${target.q('User')} WHERE ${target.q('name')} IS NULL`
      expect(Number((await target.sql(state.url, nameless))[0]?.rows)).toBe(2)

      for (const step of steps) {
        const applied = await call('/api/migrate/apply', { statements: step.statements })
        expect(applied.json).toMatchObject({ ok: true })
      }
      const sql = steps.flatMap((step) => step.statements.map((one) => `${one};`)).join('\n')
      const created = await call('/api/migrate/migrations', { name: 'required_name', sql })
      expect(created.status).toBe(200)
      const recorded = await call('/api/migrate/migrations/applied', { name: created.json.name })
      expect(recorded.status).toBe(200)
      expect(recorded.json).toMatchObject({ pending: [], failed: [], drift: false })

      expect(Number((await target.sql(state.url, nameless))[0]?.rows)).toBe(0)
      const prismaStatus = prismaIn(['migrate', 'status'])
      expect({ status: prismaStatus.status, out: prismaStatus.out }).toMatchObject({ status: 0 })
      expect(prismaStatus.out).toContain('Database schema is up to date')
      const left = prismaIn([
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'schema.prisma',
        '--exit-code',
      ])
      expect({ status: left.status, out: left.out }).toMatchObject({ status: 0 })
    },
  )
})
