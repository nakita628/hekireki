import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../file/index.js'
import { resolveDatabaseUrl } from './resolve.js'
import { DatabaseUrlNotFoundError } from './url.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-database-url-'))
  dirs.push(dir)
  return dir
}

function resolve(input: {
  readonly explicitUrl?: string | null
  readonly configUrl?: string | null
  readonly configError?: string | null
  readonly schemaText?: string | null
  readonly cwd: string
  readonly schemaDir?: string
  readonly env?: Readonly<Record<string, string | undefined>>
}) {
  return Effect.runPromiseExit(
    Effect.provide(
      resolveDatabaseUrl({
        explicitUrl: input.explicitUrl ?? null,
        configUrl: input.configUrl ?? null,
        configError: input.configError ?? null,
        schemaText: input.schemaText ?? null,
        cwd: input.cwd,
        schemaDir: input.schemaDir ?? input.cwd,
        env: input.env ?? {},
      }),
      fileSystemLayer,
    ),
  )
}

describe('resolveDatabaseUrl', () => {
  it('takes the flag, then the config url, over anything on disk', async () => {
    const dir = tmp()
    writeFileSync(path.join(dir, '.env'), 'DATABASE_URL="mysql://root@localhost/x"\n')
    expect(
      await resolve({ explicitUrl: 'file:./dev.db', configUrl: 'file:./c.db', cwd: dir }),
    ).toStrictEqual(Exit.succeed({ url: 'file:./dev.db', source: 'flag' }))
    expect(await resolve({ configUrl: 'file:./c.db', cwd: dir })).toStrictEqual(
      Exit.succeed({ url: 'file:./c.db', source: 'hekireki' }),
    )
  })

  it('reads .env in the working directory and beside the schema, the working directory winning', async () => {
    const cwd = tmp()
    const schemaDir = path.join(cwd, 'prisma')
    mkdirSync(schemaDir)
    writeFileSync(path.join(schemaDir, '.env'), 'DATABASE_URL="mysql://root@localhost/schema"\n')
    expect(await resolve({ cwd, schemaDir })).toStrictEqual(
      Exit.succeed({ url: 'mysql://root@localhost/schema', source: 'env' }),
    )
    writeFileSync(path.join(cwd, '.env'), 'DATABASE_URL="mysql://root@localhost/root"\n')
    expect(await resolve({ cwd, schemaDir })).toStrictEqual(
      Exit.succeed({ url: 'mysql://root@localhost/root', source: 'env' }),
    )
    // Node's own .env parser: quotes, `export`, comments.
    writeFileSync(
      path.join(cwd, '.env'),
      "# comment\nexport DATABASE_URL='postgresql://u:p@localhost/app' # trailing\n",
    )
    expect(await resolve({ cwd, schemaDir })).toStrictEqual(
      Exit.succeed({ url: 'postgresql://u:p@localhost/app', source: 'env' }),
    )
  })

  it('reads the variable prisma.config.ts names, from the working directory or beside the schema', async () => {
    const cwd = tmp()
    const schemaDir = path.join(cwd, 'prisma')
    mkdirSync(schemaDir)
    writeFileSync(
      path.join(schemaDir, 'prisma.config.ts'),
      "export default defineConfig({ datasource: { url: env('APP_DB') } })\n",
    )
    writeFileSync(
      path.join(schemaDir, '.env'),
      'APP_DB="file:./app.db"\nDATABASE_URL="file:./other.db"\n',
    )
    expect(await resolve({ cwd, schemaDir })).toStrictEqual(
      Exit.succeed({ url: 'file:./app.db', source: 'prisma' }),
    )
    writeFileSync(
      path.join(cwd, 'prisma.config.ts'),
      "export default defineConfig({ datasource: { url: 'file:./root.db' } })\n",
    )
    expect(await resolve({ cwd, schemaDir })).toStrictEqual(
      Exit.succeed({ url: 'file:./root.db', source: 'prisma' }),
    )
  })

  it('reads the datasource url of a Prisma 6 schema from the schema text', async () => {
    const dir = tmp()
    expect(
      await resolve({
        cwd: dir,
        schemaText: 'datasource db {\n  provider = "sqlite"\n  url = env("APP_DB")\n}\n',
        env: { APP_DB: 'file:./app.db', DATABASE_URL: 'file:./other.db' },
      }),
    ).toStrictEqual(Exit.succeed({ url: 'file:./app.db', source: 'prisma' }))
  })

  it('fails with the place a URL would go, and with the config error when the config could not be read', async () => {
    const dir = tmp()
    expect(await resolve({ cwd: dir })).toStrictEqual(
      Exit.fail(
        new DatabaseUrlNotFoundError({
          reason:
            'No database URL found.\n   Set `url` in hekireki.config.ts, name the variable in prisma.config.ts (`datasource: { url: env("DATABASE_URL") }`) and set it in .env or the environment, or pass --url <connection string>.',
        }),
      ),
    )
    writeFileSync(
      path.join(dir, 'prisma.config.ts'),
      "export default defineConfig({ datasource: { url: env('SHOP_DB') } })\n",
    )
    expect(await resolve({ cwd: dir })).toStrictEqual(
      Exit.fail(
        new DatabaseUrlNotFoundError({
          reason:
            'prisma.config.ts reads the database URL from env("SHOP_DB"), but SHOP_DB is not set.\n   Set it in .env or the environment, or pass --url <connection string>.',
        }),
      ),
    )
    expect(
      await resolve({ cwd: dir, configError: 'Invalid config: url: Expected string' }),
    ).toStrictEqual(
      Exit.fail(
        new DatabaseUrlNotFoundError({
          reason:
            'hekireki.config.ts could not be read for its `url`: Invalid config: url: Expected string',
        }),
      ),
    )
    // A URL from anywhere else still wins over the config error.
    expect(
      await resolve({ cwd: dir, configError: 'broken', explicitUrl: 'file:./flag.db' }),
    ).toStrictEqual(Exit.succeed({ url: 'file:./flag.db', source: 'flag' }))
  })
})
