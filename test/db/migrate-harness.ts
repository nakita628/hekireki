import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import mysql from 'mysql2/promise'
import { Client } from 'pg'

// What the migration tests share: the built CLI and Prisma's, and the databases they run on,
// each one a schema, database or file of its own. SQLite runs everywhere; PostgreSQL, MySQL
// (or MariaDB) and CockroachDB need HEKIREKI_SEED_PG, HEKIREKI_SEED_MYSQL and
// HEKIREKI_SEED_COCKROACH, and are skipped without them.

export const root = resolve(import.meta.dirname, '..', '..')
const pkg = join(root, 'packages', 'hekireki')
export const cli = join(pkg, 'dist', 'bin', 'hekireki.js')
export const prisma = join(pkg, 'node_modules', '.bin', 'prisma')

export type Row = Readonly<Record<string, unknown>>

export function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A decision of the Migrate page, as Studio keeps it and `hekireki migrate check` reads it. */
export type Decision = {
  readonly kind: string
  readonly modelName: string
  readonly field: string
  readonly choice: string
  readonly value: string | null
}

/** Writes the decisions beside the schemas of `dir`, where Studio keeps them. */
export function decide(dir: string, decisions: readonly Decision[]) {
  mkdirSync(join(dir, '.hekireki'), { recursive: true })
  writeFileSync(
    join(dir, '.hekireki', 'migrate.json'),
    `${JSON.stringify({ decisions }, null, 2)}\n`,
  )
}

export type Target = {
  readonly dialect: 'postgresql' | 'mysql' | 'sqlite' | 'cockroachdb'
  readonly url: string | undefined
  /** The URL of the schema, database or file of that name. */
  readonly isolate: (url: string, name: string, dir: string) => string
  /** Runs SQL there, for real: statements joined into one script. */
  readonly exec: (url: string, name: string, sql: string) => Promise<void>
  readonly rows: (url: string, name: string, sql: string) => Promise<readonly Row[]>
  readonly drop: (url: string, name: string) => Promise<void>
}

export function databaseUrl(url: string, name: string) {
  const isolated = new URL(url)
  isolated.pathname = `/${name}`
  return isolated.toString()
}

/** The statements of a script, one at a time: what CockroachDB runs apart. */
export function statementsOf(sql: string) {
  return sql
    .split(/;\s*\n/u)
    .map((statement) => statement.trim())
    .filter((statement) => statement.replaceAll(/^--.*$/gmu, '').trim() !== '')
}

/** The session settings Prisma's schema engine sends when it connects to CockroachDB. */
export const PRISMA_COCKROACH_SESSION = [
  'SET enable_implicit_transaction_for_batch_statements = false',
  'SET use_declarative_schema_changer = off',
  'SET enable_experimental_alter_column_type_general = true',
]

/** CockroachDB: a database of that name, made if it is not there, on a session like Prisma's. */
export async function cockroach(url: string, name: string) {
  const admin = new Client({ connectionString: url })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS "${name}"`)
  } finally {
    await admin.end()
  }
  const client = new Client({ connectionString: databaseUrl(url, name) })
  await client.connect()
  await client.query(PRISMA_COCKROACH_SESSION.join('; '))
  return client
}

export const TARGETS: readonly Target[] = [
  {
    dialect: 'sqlite',
    url: 'file:',
    isolate: (_, name, dir) => `file:${join(dir, `${name}.db`)}`,
    exec: (url, _, sql) => {
      const db = new DatabaseSync(url.replace(/^file:/u, ''))
      try {
        db.exec(sql)
      } finally {
        db.close()
      }
      return Promise.resolve()
    },
    rows: (url, _, sql) => {
      const db = new DatabaseSync(url.replace(/^file:/u, ''))
      try {
        return Promise.resolve(
          db
            .prepare(sql)
            .all()
            .map((row) => structuredClone(row)),
        )
      } finally {
        db.close()
      }
    },
    drop: () => Promise.resolve(),
  },
  {
    dialect: 'postgresql',
    url: process.env.HEKIREKI_SEED_PG,
    isolate: (url, name) => `${url}${url.includes('?') ? '&' : '?'}schema=${name}`,
    exec: async (url, name, sql) => {
      const client = new Client({ connectionString: url.replace(/[?&]schema=[^&]*/u, '') })
      await client.connect()
      try {
        await client.query(`SET search_path TO "${name}";\n${sql}`)
      } finally {
        await client.end()
      }
    },
    rows: async (url, name, sql) => {
      const client = new Client({ connectionString: url.replace(/[?&]schema=[^&]*/u, '') })
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
    exec: async (url, name, sql) => {
      const connection = await mysql.createConnection({
        uri: databaseUrl(url, name),
        multipleStatements: true,
      })
      try {
        await connection.query(sql)
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
    exec: async (url, name, sql) => {
      const client = await cockroach(url, name)
      try {
        for (const statement of statementsOf(sql)) {
          // oxlint-disable-next-line no-await-in-loop -- one statement after the other, as the migration runs
          await client.query(statement)
        }
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

export function run(command: string, args: readonly string[], cwd: string) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' },
  })
  return { status: result.status, out: `${result.stdout}${result.stderr}`, stdout: result.stdout }
}

/** Prisma needs a datasource in prisma.config.ts for `migrate diff`, even when it reads no database. */
export function diff(dir: string, url: string, args: readonly string[]) {
  const cwd = join(dir, 'diff')
  mkdirSync(cwd, { recursive: true })
  writeFileSync(
    join(cwd, 'prisma.config.ts'),
    `export default { schema: '../new.prisma', datasource: { url: ${JSON.stringify(url)} } }\n`,
  )
  return run(prisma, ['migrate', 'diff', ...args], cwd)
}
