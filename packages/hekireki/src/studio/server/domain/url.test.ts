import { describe, expect, it } from 'vite-plus/test'

import {
  makeDatabaseUrl,
  makeDatasourceUrl,
  makeDialect,
  makeDotenv,
  makePostgresSchema,
  makeRedactedUrl,
  makeSqliteFilePath,
} from './url.js'

describe('makeDotenv', () => {
  it('reads KEY=value lines with quotes, export and comments', () => {
    expect(
      makeDotenv({
        text: `# comment
DATABASE_URL="postgresql://u:p@localhost:5432/app"
export SHADOW='file:./dev.db'
PLAIN=value # trailing
EMPTY=
not a line
`,
      }),
    ).toStrictEqual({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/app',
      SHADOW: 'file:./dev.db',
      PLAIN: 'value',
      EMPTY: '',
    })
  })
})

describe('makeDatasourceUrl', () => {
  it('reads env() and literal urls from prisma.config.ts', () => {
    expect(
      makeDatasourceUrl({
        configText: `import { defineConfig, env } from 'prisma/config'
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
})
`,
      }),
    ).toStrictEqual({ kind: 'env', name: 'DATABASE_URL' })
    expect(
      makeDatasourceUrl({
        configText: 'export default { datasource: { url: "file:./dev.db" } }',
      }),
    ).toStrictEqual({
      kind: 'literal',
      value: 'file:./dev.db',
    })
    expect(makeDatasourceUrl({ configText: 'export default { schema: "x" }' })).toBeNull()
  })
})

describe('makeDatabaseUrl', () => {
  const configText = "export default { datasource: { url: env('PG_URL') } }"

  it('prefers the explicit flag', () => {
    expect(
      makeDatabaseUrl({
        explicit: 'file:x.db',
        env: { DATABASE_URL: 'y' },
        dotenv: {},
        configText,
      }),
    ).toStrictEqual({ ok: true, value: { url: 'file:x.db', source: 'flag' } })
  })

  it('falls back to DATABASE_URL from the environment, then .env', () => {
    expect(
      makeDatabaseUrl({
        explicit: null,
        env: { DATABASE_URL: 'env-url' },
        dotenv: {},
        configText,
      }),
    ).toStrictEqual({ ok: true, value: { url: 'env-url', source: 'env' } })
    expect(
      makeDatabaseUrl({
        explicit: null,
        env: {},
        dotenv: { DATABASE_URL: 'dotenv-url' },
        configText,
      }),
    ).toStrictEqual({ ok: true, value: { url: 'dotenv-url', source: 'env' } })
  })

  it('resolves the prisma.config.ts env variable', () => {
    expect(
      makeDatabaseUrl({ explicit: null, env: { PG_URL: 'pg' }, dotenv: {}, configText }),
    ).toStrictEqual({
      ok: true,
      value: { url: 'pg', source: 'config' },
    })
    expect(makeDatabaseUrl({ explicit: null, env: {}, dotenv: {}, configText })).toStrictEqual({
      ok: false,
      error:
        'prisma.config.ts reads the database URL from env("PG_URL"), but PG_URL is not set.\n   Set it in .env or the environment, or pass --url <connection string>.',
    })
  })

  it('uses a literal config url and explains when nothing is configured', () => {
    expect(
      makeDatabaseUrl({
        explicit: null,
        env: {},
        dotenv: {},
        configText: 'export default { datasource: { url: "file:./dev.db" } }',
      }),
    ).toStrictEqual({ ok: true, value: { url: 'file:./dev.db', source: 'config' } })
    expect(
      makeDatabaseUrl({ explicit: null, env: {}, dotenv: {}, configText: null }),
    ).toStrictEqual({
      ok: false,
      error:
        'No database URL found.\n   Set DATABASE_URL (in .env or the environment) or pass --url <connection string> to browse and edit data.',
    })
  })
})

describe('makeDialect', () => {
  it('detects the dialect from the scheme, then from the schema provider', () => {
    expect(makeDialect({ url: 'postgresql://x', schemaProvider: null })).toBe('postgresql')
    expect(makeDialect({ url: 'postgres://x', schemaProvider: null })).toBe('postgresql')
    expect(makeDialect({ url: 'mysql://x', schemaProvider: null })).toBe('mysql')
    expect(makeDialect({ url: 'file:./dev.db', schemaProvider: null })).toBe('sqlite')
    expect(makeDialect({ url: 'anything', schemaProvider: 'cockroachdb' })).toBe('postgresql')
    expect(makeDialect({ url: 'anything', schemaProvider: 'mysql' })).toBe('mysql')
    expect(makeDialect({ url: 'anything', schemaProvider: 'sqlite' })).toBe('sqlite')
    expect(makeDialect({ url: 'mongodb://x', schemaProvider: 'mongodb' })).toBeNull()
  })
})

describe('makeSqliteFilePath', () => {
  it('resolves relative paths against the schema directory', () => {
    expect(makeSqliteFilePath({ url: 'file:./dev.db', baseDir: '/app/prisma' })).toBe(
      '/app/prisma/dev.db',
    )
    expect(makeSqliteFilePath({ url: 'file:/tmp/x.db?mode=ro', baseDir: '/app' })).toBe('/tmp/x.db')
    expect(makeSqliteFilePath({ url: 'file::memory:', baseDir: '/app' })).toBe(':memory:')
    expect(makeSqliteFilePath({ url: 'file:', baseDir: '/app' })).toBe(':memory:')
  })
})

describe('makeRedactedUrl', () => {
  it('hides the password only', () => {
    expect(makeRedactedUrl({ url: 'postgresql://user:secret@localhost:5432/app' })).toBe(
      'postgresql://user:***@localhost:5432/app',
    )
    expect(makeRedactedUrl({ url: 'file:./dev.db' })).toBe('file:./dev.db')
    expect(makeRedactedUrl({ url: 'mysql://root@localhost/app' })).toBe(
      'mysql://root@localhost/app',
    )
  })
})

describe('makePostgresSchema', () => {
  it('is the namespace Prisma names, when it is not the default', () => {
    expect(makePostgresSchema({ url: 'postgresql://u:p@127.0.0.1:5432/app?schema=demo' })).toBe(
      'demo',
    )
    expect(
      makePostgresSchema({ url: 'postgresql://u:p@127.0.0.1:5432/app?schema=public' }),
    ).toBeNull()
    expect(makePostgresSchema({ url: 'postgresql://u:p@127.0.0.1:5432/app' })).toBeNull()
    expect(makePostgresSchema({ url: 'not a url' })).toBeNull()
  })
})
