import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import mysql from 'mysql2/promise'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

// `hekireki seed` against real databases. Each target needs a connection string in the
// environment and is skipped without one, so `vp test` stays runnable on a machine with no
// database; the Seed DB workflow provides both. `examples/compose.yaml` starts the two locally.
//
//   HEKIREKI_SEED_PG=postgresql://postgres:postgres@localhost:5432/seed
//   HEKIREKI_SEED_MYSQL=mysql://root:root@localhost:3306/seed
//
// examples/<dialect>/ is a small project: schema.prisma with the Hekireki-Seed generator, the
// schema module it writes, and a typed hekireki.config.ts that mixes faker rows with real ones.
// The tables come from `prisma db push`, so the check covers what Prisma itself creates: the
// enum types and @map names, the join table of the implicit many-to-many, the sequences, the FK
// constraints. The config's type check runs without a database.

const root = resolve(import.meta.dirname, '..', '..')
const bin = join(root, 'packages', 'hekireki', 'dist', 'bin')
const cli = join(bin, 'hekireki.js')
const prisma = join(root, 'packages', 'hekireki', 'node_modules', '.bin', 'prisma')
const tsgo = join(root, 'packages', 'hekireki', 'node_modules', '.bin', 'tsgo')
const types = join(root, 'packages', 'hekireki', 'node_modules', '@types')

type Row = Readonly<Record<string, unknown>>

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One connection, asked the same way whichever driver is underneath. */
type Db = {
  readonly query: (sql: string) => Promise<readonly Row[]>
  readonly close: () => Promise<void>
}

type Target = {
  readonly dialect: 'postgresql' | 'mysql'
  readonly url: string | undefined
  /** examples/<dialect>: schema.prisma, hekireki.config.ts and the generated schema module. */
  readonly dir: string
  readonly quote: (name: string) => string
  readonly open: (url: string) => Promise<Db>
}

const TARGETS: readonly Target[] = [
  {
    dialect: 'postgresql',
    url: process.env.HEKIREKI_SEED_PG,
    dir: join(root, 'examples', 'postgresql'),
    quote: (name) => `"${name}"`,
    open: async (url) => {
      const client = new Client({ connectionString: url })
      await client.connect()
      return {
        query: async (sql) => {
          const result = await client.query(sql)
          return Array.isArray(result) ? (result.at(-1)?.rows ?? []) : result.rows
        },
        close: () => client.end(),
      }
    },
  },
  {
    dialect: 'mysql',
    url: process.env.HEKIREKI_SEED_MYSQL,
    dir: join(root, 'examples', 'mysql'),
    quote: (name) => `\`${name}\``,
    open: async (url) => {
      const connection = await mysql.createConnection({ uri: url, multipleStatements: true })
      return {
        query: async (sql) => {
          const [rows] = await connection.query(sql)
          const flat: readonly unknown[] = Array.isArray(rows) ? rows.flat() : []
          return flat.filter(isRow)
        },
        close: () => connection.end(),
      }
    },
  },
]

function count(rows: readonly Row[]) {
  return Number(rows[0]?.n ?? Number.NaN)
}

/**
 * `prisma generate` for the project, with the built hekireki-seed on PATH the way a project's
 * node_modules/.bin would put it, so the schema module is what this build writes.
 */
function generate(dir: string) {
  const shims = mkdtempSync(join(tmpdir(), 'hekireki-seed-bin-'))
  symlinkSync(join(bin, 'seed.js'), join(shims, 'hekireki-seed'))
  try {
    return spawnSync(prisma, ['generate', '--schema', join(dir, 'schema.prisma')], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, PATH: `${shims}:${process.env.PATH ?? ''}`, DATABASE_URL: 'x' },
    }).status
  } finally {
    rmSync(shims, { recursive: true, force: true })
  }
}

/** Runs the built CLI from the repository root, where the pg and mysql2 drivers resolve from. */
function seed(args: readonly string[]) {
  const result = spawnSync('node', [cli, 'seed', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' },
  })
  return { status: result.status, out: `${result.stdout}${result.stderr}` }
}

/** The pairs of tables every foreign key of the schema joins, child first, for the integrity checks. */
const FOREIGN_KEYS = [
  ['posts', 'author_id', 'users', 'id'],
  ['comments', 'post_id', 'posts', 'id'],
  ['comments', 'author_id', 'users', 'id'],
  ['Profile', 'user_id', 'users', 'id'],
  ['follows', 'follower_id', 'users', 'id'],
  ['follows', 'following_id', 'users', 'id'],
  ['Category', 'parent_id', 'Category', 'id'],
  ['_PostToTag', 'A', 'posts', 'id'],
  ['_PostToTag', 'B', 'Tag', 'id'],
] as const

const NO_ORPHANS = FOREIGN_KEYS.map(([child, column]) => [child, column, 0])

const TABLES = ['users', 'Profile', 'posts', 'Tag', 'comments', 'follows', 'Category', '_PostToTag']

describe.each(TARGETS)('hekireki seed on $dialect', (target) => {
  const url = target.url ?? ''
  const q = target.quote
  const schema = join(target.dir, 'schema.prisma')
  const config = join(target.dir, 'hekireki.config.ts')
  const dirs: string[] = []
  const state: { db: Db | null } = { db: null }

  beforeAll(async () => {
    if (target.url === undefined) return
    if (generate(target.dir) !== 0) throw new Error(`prisma generate failed for ${target.dialect}`)
    const pushed = spawnSync(
      prisma,
      ['db', 'push', '--schema', schema, '--url', url, '--force-reset', '--accept-data-loss'],
      { cwd: root, stdio: 'inherit' },
    )
    if (pushed.status !== 0) throw new Error(`prisma db push failed for ${target.dialect}`)
    state.db = await target.open(url)
  })

  afterAll(async () => {
    await state.db?.close()
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  const db = () => {
    if (state.db === null) throw new Error('no connection')
    return state.db
  }

  /** How many rows of each child table point at a parent row that is not there. */
  const orphanCounts = () =>
    Promise.all(
      FOREIGN_KEYS.map(async ([child, column, parent, key]) => {
        const n = count(
          await db().query(
            `SELECT count(*) AS n FROM ${q(child)} c LEFT JOIN ${q(parent)} p ON p.${q(key)} = c.${q(column)} WHERE c.${q(column)} IS NOT NULL AND p.${q(key)} IS NULL`,
          ),
        )
        return [child, column, n] as const
      }),
    )

  it('has a hekireki.config.ts that type-checks against the generated schema module', () => {
    const checked = spawnSync(
      tsgo,
      [
        '--noEmit',
        '--ignoreConfig',
        '--strict',
        '--target',
        'esnext',
        '--module',
        'esnext',
        '--moduleResolution',
        'bundler',
        '--skipLibCheck',
        '--typeRoots',
        types,
        '--types',
        'node',
        config,
      ],
      { cwd: root, encoding: 'utf8' },
    )
    expect(`${checked.stdout}${checked.stderr}`).toBe('')
    expect(checked.status).toBe(0)
  })

  it.skipIf(target.url === undefined)(
    'inserts every table of hekireki.config.ts in one transaction',
    async () => {
      const run = seed(['--config', config, '--url', url, '--reset'])
      expect(run.out).toContain('Seeded')
      // The schema has a prisma-client generator and the repository has the adapters, so the
      // rows go through the generated Prisma Client, not the driver.
      expect(run.out).toContain('Prisma Client: generated/client')
      expect(run.status).toBe(0)
      const counts = await Promise.all(
        TABLES.map(
          async (table) =>
            [table, count(await db().query(`SELECT count(*) AS n FROM ${q(table)}`)) > 0] as const,
        ),
      )
      expect(counts).toStrictEqual(TABLES.map((table) => [table, true]))
      expect(count(await db().query(`SELECT count(*) AS n FROM ${q('users')}`))).toBe(20)
      expect(count(await db().query(`SELECT count(*) AS n FROM ${q('Tag')}`))).toBe(3)
      expect(count(await db().query(`SELECT count(*) AS n FROM ${q('Category')}`))).toBe(3)
    },
  )

  it.skipIf(target.url === undefined)('points every foreign key at a row that exists', async () => {
    expect(await orphanCounts()).toStrictEqual(NO_ORPHANS)
  })

  it.skipIf(target.url === undefined)(
    'keeps one-to-one, unique and mapped enum values as the schema says',
    async () => {
      const profiles = count(await db().query(`SELECT count(*) AS n FROM ${q('Profile')}`))
      const owners = count(
        await db().query(`SELECT count(DISTINCT ${q('user_id')}) AS n FROM ${q('Profile')}`),
      )
      expect(owners).toBe(profiles)
      const emails = count(
        await db().query(`SELECT count(DISTINCT ${q('email')}) AS n FROM ${q('users')}`),
      )
      const users = count(await db().query(`SELECT count(*) AS n FROM ${q('users')}`))
      expect(emails).toBe(users)
      const stored = await db().query(`SELECT DISTINCT ${q('visibility')} AS v FROM ${q('posts')}`)
      expect(
        stored.every((row) => ['public', 'private', 'link_only'].includes(String(row.v))),
      ).toBe(true)
    },
  )

  it.skipIf(target.url === undefined)(
    'honours the relation bounds of the config: a profile each, 1 to 6 posts',
    async () => {
      const withoutProfile = count(
        await db().query(
          `SELECT count(*) AS n FROM ${q('users')} u WHERE NOT EXISTS (SELECT 1 FROM ${q('Profile')} p WHERE p.${q('user_id')} = u.${q('id')})`,
        ),
      )
      expect(withoutProfile).toBe(0)
      const spread = await db().query(
        `SELECT min(n) AS lo, max(n) AS hi FROM (SELECT count(p.${q('id')}) AS n FROM ${q('users')} u LEFT JOIN ${q('posts')} p ON p.${q('author_id')} = u.${q('id')} GROUP BY u.${q('id')}) t`,
      )
      expect(Number(spread[0]?.lo)).toBeGreaterThanOrEqual(1)
      expect(Number(spread[0]?.hi)).toBeLessThanOrEqual(6)
    },
  )

  it.skipIf(target.url === undefined || target.dialect !== 'postgresql')(
    'moves the PostgreSQL sequences past the seeded ids, so the application can insert next',
    async () => {
      const inserted = await db().query(
        `INSERT INTO "Tag" ("label") VALUES ('after-seed') RETURNING "id"`,
      )
      const max = count(
        await db().query(`SELECT max("id") AS n FROM "Tag" WHERE "label" <> 'after-seed'`),
      )
      expect(Number(inserted[0]?.id)).toBe(max + 1)
      await db().query(`DELETE FROM "Tag" WHERE "label" = 'after-seed'`)
    },
  )

  it.skipIf(target.url === undefined)(
    'refuses to seed again without --reset, and seeds again with it',
    async () => {
      const again = seed(['--config', config, '--url', url])
      expect(again.status).not.toBe(0)
      expect(again.out).toContain('pass --reset')
      const reset = seed(['--config', config, '--url', url, '--seed', '8', '--reset'])
      expect(reset.status).toBe(0)
      expect(count(await db().query(`SELECT count(*) AS n FROM ${q('users')}`))).toBe(20)
    },
  )

  it.skipIf(target.url === undefined)(
    'writes a SQL script the database runs to the same rows',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'hekireki-seed-db-'))
      dirs.push(dir)
      const file = join(dir, 'seed.sql')
      const written = seed(['--config', config, '--sql', file, '--seed', '9', '--reset'])
      expect(written.status).toBe(0)
      await db().query(readFileSync(file, 'utf8'))
      expect(count(await db().query(`SELECT count(*) AS n FROM ${q('users')}`))).toBe(20)
      expect(await orphanCounts()).toStrictEqual(NO_ORPHANS)
    },
  )
})
