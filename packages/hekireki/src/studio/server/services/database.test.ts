import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
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
    readonly schemaProvider?: string | null
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
        schemaProvider: options.schemaProvider ?? null,
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
    expect(db.status.error).toContain('Set DATABASE_URL (in .env or the environment)')
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

  it('reads the URL out of prisma.config.ts when nothing else supplies one', async () => {
    const dir = tmp()
    writeFileSync(
      path.join(dir, 'prisma.config.ts'),
      "export default defineConfig({ datasource: { url: 'file:./dev.db' } })\n",
    )
    const db = await connect({ cwd: dir, schemaDir: dir })
    expect(db.status.source).toBe('config')
    expect(db.status.connected).toBe(true)
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
