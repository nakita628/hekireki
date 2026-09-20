import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { DatabaseError } from '../errors/index.js'
import { connectDatabase, disconnectedDatabase } from './database.js'

const dirs: string[] = []
const opened: { readonly close: Effect.Effect<void> }[] = []

afterEach(async () => {
  await Effect.runPromise(Effect.all(opened.splice(0).map((db) => db.close)))
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-connect-'))
  dirs.push(dir)
  return dir
}

async function connect(
  options: {
    readonly explicitUrl?: string | null
    readonly configUrl?: string | null
    readonly configError?: string | null
    readonly schemaProvider?: string | null
    readonly schemaText?: string | null
    readonly cwd?: string
    readonly schemaDir?: string
    readonly env?: Readonly<Record<string, string | undefined>>
  } = {},
) {
  const cwd = options.cwd ?? tmp()
  const db = await Effect.runPromise(
    Effect.provide(
      connectDatabase({
        explicitUrl: options.explicitUrl ?? null,
        configUrl: options.configUrl ?? null,
        configError: options.configError ?? null,
        schemaProvider: options.schemaProvider ?? null,
        schemaText: options.schemaText ?? null,
        cwd,
        schemaDir: options.schemaDir ?? cwd,
        env: options.env ?? {},
      }),
      fileSystemLayer,
    ),
  )
  opened.push(db)
  return db
}

describe('disconnectedDatabase', () => {
  it('says a database has to be connected before anything asks for the driver', async () => {
    const db = disconnectedDatabase()
    expect(db.status).toStrictEqual({
      connected: false,
      dialect: null,
      url: null,
      source: null,
      error: null,
    })
    const failure = await Effect.runPromise(Effect.flip(db.driver))
    expect(failure.reason).toBe('No database connected.')
  })

  it('carries the reason it was given into both the status and the driver failure', async () => {
    const db = disconnectedDatabase('SQLite file is unreadable.')
    expect(db.status.error).toBe('SQLite file is unreadable.')
    const failure = await Effect.runPromise(Effect.flip(db.driver))
    expect(failure.reason).toBe('SQLite file is unreadable.')
  })
})

// Every failure here has to come back as a *disconnected* database rather than a crash: Studio
// still serves the schema, the editor and the diagram without a database behind them.
describe('connectDatabase', () => {
  it('says where to put a URL when there is none anywhere', async () => {
    const db = await connect()
    expect(db.status.connected).toBe(false)
    expect(db.status.error).toContain('No database URL found.')
    expect(db.status.error).toContain('name the variable in prisma.config.ts')
  })

  it('refuses a URL whose scheme names no database it can drive', async () => {
    const db = await connect({ explicitUrl: 'redis://localhost:6379' })
    expect(db.status.connected).toBe(false)
    expect(db.status.error).toContain('Cannot tell which database "redis://localhost:6379"')
    expect(db.status.error).toContain('Use a postgresql://, mysql:// or file: URL.')
  })

  it('opens a sqlite file named by --url and reports the flag as its source', async () => {
    const dir = tmp()
    const db = await connect({ explicitUrl: 'file:./dev.db', cwd: dir, schemaDir: dir })
    expect(db.status).toStrictEqual({
      connected: true,
      dialect: 'sqlite',
      url: 'file:./dev.db',
      source: 'flag',
      error: null,
    })
  })

  it('keeps the URL as it was found, with its dialect, for a client that dials on its own', async () => {
    const dir = tmp()
    const db = await connect({
      explicitUrl: 'file:./dev.db?connection_limit=1',
      cwd: dir,
      schemaDir: dir,
    })
    expect(db.target).toStrictEqual({ url: 'file:./dev.db?connection_limit=1', dialect: 'sqlite' })
    expect(disconnectedDatabase('none').target).toBeNull()
    const refused = await connect({ explicitUrl: 'redis://localhost' })
    expect(refused.target).toBeNull()
  })

  it('reads DATABASE_URL out of .env when no flag was given', async () => {
    const dir = tmp()
    writeFileSync(path.join(dir, '.env'), 'DATABASE_URL="file:./dev.db"\n')
    const db = await connect({ cwd: dir, schemaDir: dir })
    expect(db.status.source).toBe('env')
    expect(db.status.connected).toBe(true)
  })

  it('lets the environment win over .env, and --url win over both', async () => {
    const dir = tmp()
    writeFileSync(path.join(dir, '.env'), 'DATABASE_URL="file:./dotenv.db"\n')
    const fromEnv = await connect({
      cwd: dir,
      schemaDir: dir,
      env: { DATABASE_URL: 'file:./environment.db' },
    })
    expect(fromEnv.status.url).toBe('file:./environment.db')
    const fromFlag = await connect({
      explicitUrl: 'file:./flag.db',
      cwd: dir,
      schemaDir: dir,
      env: { DATABASE_URL: 'file:./environment.db' },
    })
    expect(fromFlag.status.url).toBe('file:./flag.db')
  })

  it('takes the url of hekireki.config.ts over DATABASE_URL, and --url over that', async () => {
    const dir = tmp()
    const fromConfig = await connect({
      configUrl: 'file:./config.db',
      cwd: dir,
      schemaDir: dir,
      env: { DATABASE_URL: 'file:./environment.db' },
    })
    expect(fromConfig.status).toMatchObject({ url: 'file:./config.db', source: 'hekireki' })
    const fromFlag = await connect({
      explicitUrl: 'file:./flag.db',
      configUrl: 'file:./config.db',
      cwd: dir,
      schemaDir: dir,
    })
    expect(fromFlag.status).toMatchObject({ url: 'file:./flag.db', source: 'flag' })
  })

  it('reads .env beside the schema too, the working directory winning when both name the variable', async () => {
    const cwd = tmp()
    const schemaDir = path.join(cwd, 'prisma')
    mkdirSync(schemaDir)
    writeFileSync(path.join(schemaDir, '.env'), 'DATABASE_URL="file:./schema.db"\n')
    const fromSchema = await connect({ cwd, schemaDir })
    expect(fromSchema.status).toMatchObject({ url: 'file:./schema.db', source: 'env' })
    writeFileSync(path.join(cwd, '.env'), 'DATABASE_URL="file:./root.db"\n')
    const fromRoot = await connect({ cwd, schemaDir })
    expect(fromRoot.status.url).toBe('file:./root.db')
  })

  it('says when hekireki.config.ts could not be read and nothing else names a database', async () => {
    const dir = tmp()
    const db = await connect({ configError: 'Invalid config: seed: expected number', cwd: dir })
    expect(db.status.connected).toBe(false)
    expect(db.status.error).toBe(
      'hekireki.config.ts could not be read for its `url`: Invalid config: seed: expected number',
    )
    const fallback = await connect({
      configError: 'broken',
      explicitUrl: 'file:./flag.db',
      cwd: dir,
    })
    expect(fallback.status.connected).toBe(true)
  })

  it('reads the URL out of prisma.config.ts when nothing else supplies one', async () => {
    const dir = tmp()
    writeFileSync(
      path.join(dir, 'prisma.config.ts'),
      "export default defineConfig({ datasource: { url: 'file:./dev.db' } })\n",
    )
    const db = await connect({ cwd: dir, schemaDir: dir })
    expect(db.status.source).toBe('prisma')
    expect(db.status.connected).toBe(true)
  })

  it('reads the variable Prisma names, not DATABASE_URL, when prisma.config.ts names one', async () => {
    const dir = tmp()
    writeFileSync(
      path.join(dir, 'prisma.config.ts'),
      "export default defineConfig({ datasource: { url: env('SHOP_DATABASE_URL') } })\n",
    )
    writeFileSync(path.join(dir, '.env'), 'SHOP_DATABASE_URL="file:./shop.db"\n')
    const db = await connect({
      cwd: dir,
      schemaDir: dir,
      env: { DATABASE_URL: 'file:./other.db' },
    })
    expect(db.status).toMatchObject({ url: 'file:./shop.db', source: 'prisma' })
  })

  it('reads the datasource url of a Prisma 6 schema, and finds prisma.config.ts beside the schema', async () => {
    const cwd = tmp()
    const schemaDir = path.join(cwd, 'prisma')
    mkdirSync(schemaDir)
    const fromSchema = await connect({
      cwd,
      schemaDir,
      schemaText: 'datasource db {\n  provider = "sqlite"\n  url      = env("APP_DB")\n}\n',
      env: { APP_DB: 'file:./app.db' },
    })
    expect(fromSchema.status).toMatchObject({ url: 'file:./app.db', source: 'prisma' })
    writeFileSync(
      path.join(schemaDir, 'prisma.config.ts'),
      "export default defineConfig({ datasource: { url: 'file:./beside.db' } })\n",
    )
    const beside = await connect({ cwd, schemaDir })
    expect(beside.status).toMatchObject({ url: 'file:./beside.db', source: 'prisma' })
  })

  it('names the variable prisma.config.ts reads when that variable is unset', async () => {
    const dir = tmp()
    writeFileSync(
      path.join(dir, 'prisma.config.ts'),
      "export default defineConfig({ datasource: { url: env('SHOP_DATABASE_URL') } })\n",
    )
    const db = await connect({ cwd: dir, schemaDir: dir })
    expect(db.status.connected).toBe(false)
    expect(db.status.error).toContain('env("SHOP_DATABASE_URL"), but SHOP_DATABASE_URL is not set')
  })

  // The URL is shown in the sidebar and echoed by /api/db, so the password must never leave the
  // process. `.invalid` is the reserved TLD that never resolves, which keeps this off the network.
  it.each(['postgresql', 'mysql'])(
    'reports an unreachable %s server without leaking the password',
    async (scheme) => {
      const db = await connect({ explicitUrl: `${scheme}://admin:hunter2@db.invalid:5432/shop` })
      expect(db.status.connected).toBe(false)
      expect(db.status.error).not.toContain('hunter2')
      expect(db.status.url).toBeNull()
    },
  )

  it('falls back to the schema provider when the URL scheme says nothing', async () => {
    const dir = tmp()
    const db = await connect({
      explicitUrl: './relative.db',
      schemaProvider: 'sqlite',
      cwd: dir,
      schemaDir: dir,
    })
    expect(db.status.dialect).toBe('sqlite')
  })

  it('resolves a relative sqlite file against the schema directory, not the working directory', async () => {
    const cwd = tmp()
    const schemaDir = tmp()
    const db = await connect({ explicitUrl: 'file:./dev.db', cwd, schemaDir })
    expect(db.status.connected).toBe(true)
    const driver = await Effect.runPromise(db.driver)
    await Effect.runPromise(driver.query({ sql: 'CREATE TABLE marker (id INTEGER)', params: [] }))
    expect(existsSync(path.join(schemaDir, 'dev.db'))).toBe(true)
    expect(existsSync(path.join(cwd, 'dev.db'))).toBe(false)
  })
})

// What the driver hands back, and what it says when it cannot: the message of the database
// itself, with what to do when the table is not there.
describe('the sqlite driver', () => {
  async function driverOf(dir: string) {
    const db = await connect({ explicitUrl: 'file:./dev.db', cwd: dir, schemaDir: dir })
    return Effect.runPromise(db.driver)
  }

  it('reads rows with their columns, and counts the rows a write changes', async () => {
    const driver = await driverOf(tmp())
    const run = (sql: string, params: readonly unknown[] = []) =>
      Effect.runPromise(driver.query({ sql, params }))
    await run('CREATE TABLE "User" ("id" INTEGER PRIMARY KEY, "name" TEXT)')
    expect(
      await run('INSERT INTO "User" VALUES (?, ?), (?, ?)', [1, 'Ann', 2, 'Bo']),
    ).toStrictEqual({ columns: [], rows: [], rowCount: 2 })
    const read = await run('SELECT "id", "name" FROM "User" WHERE "id" = ?', [2])
    expect({ ...read, rows: read.rows.map((row) => structuredClone(row)) }).toStrictEqual({
      columns: ['id', 'name'],
      rows: [{ id: 2, name: 'Bo' }],
      rowCount: 1,
    })
  })

  it("passes the database's message on, with what to do when the table is not there", async () => {
    const driver = await driverOf(tmp())
    const missing = await Effect.runPromise(
      Effect.flip(driver.query({ sql: 'SELECT * FROM "missing"', params: [] })),
    )
    expect(missing).toBeInstanceOf(DatabaseError)
    expect(missing.cause).toContain('no such table: missing')
    expect(missing.cause).toContain('run `prisma db push`')
    const explained = await Effect.runPromise(
      Effect.flip(driver.explain({ sql: 'SELECT * FROM "missing"', params: [] })),
    )
    expect(explained.cause).toContain('no such table: missing')
    const syntax = await Effect.runPromise(
      Effect.flip(driver.query({ sql: 'SELECT FROM "User"', params: [] })),
    )
    expect(syntax.cause).toBe('near "FROM": syntax error')
  })

  it('says why a file it cannot open is not connected, in the words of node:sqlite', async () => {
    const dir = tmp()
    const db = await connect({ explicitUrl: 'file:./no/such/dir/dev.db', cwd: dir, schemaDir: dir })
    expect(db.status.connected).toBe(false)
    expect(db.status.error).toBe('unable to open database file')
    const failure = await Effect.runPromise(Effect.flip(db.driver))
    expect(failure.reason).toBe('unable to open database file')
  })
})

// Studio ships no drivers: it loads `pg` and `mysql2` from the project it is pointed at. A run
// from a bare temp directory resolves them only if the test runner is patching resolution, which
// it does not always do, so this names the directory that really holds them — this package.
const PROJECT = path.resolve(import.meta.dirname, '..', '..', '..', '..')

describe('the drivers of the project', () => {
  it("says why a server cannot be reached, in the driver's words", async () => {
    const postgres = await connect({
      explicitUrl: 'postgresql://u:p@127.0.0.1:1/app',
      cwd: PROJECT,
    })
    expect(postgres.status).toMatchObject({ connected: false, dialect: null })
    expect(postgres.status.error).toBe('connect ECONNREFUSED 127.0.0.1:1')
    const mysql = await connect({ explicitUrl: 'mysql://u:p@127.0.0.1:1/app', cwd: PROJECT })
    expect(mysql.status.error).toBe('connect ECONNREFUSED 127.0.0.1:1')
    const failure = await Effect.runPromise(Effect.flip(mysql.driver))
    expect(failure.reason).toBe('connect ECONNREFUSED 127.0.0.1:1')
  })
})
