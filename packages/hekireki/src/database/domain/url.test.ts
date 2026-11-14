import { describe, expect, it } from 'vite-plus/test'

import {
  isLibsqlUrl,
  makeDatabaseUrlChoice,
  makeDialect,
  makePostgresSchema,
  makeRedactedUrl,
  makeSqliteFilePath,
} from './url.js'

describe('makeDatabaseUrlChoice', () => {
  const none = { explicit: null, configUrl: null, datasource: null, named: null, fallback: null }

  it('takes the flag, then hekireki.config.ts, then what Prisma names, then DATABASE_URL', () => {
    const all = {
      explicit: 'file:flag.db',
      configUrl: 'file:config.db',
      datasource: { kind: 'env', name: 'DB' } as const,
      named: 'file:named.db',
      fallback: 'file:fallback.db',
      where: 'prisma.config.ts',
    }
    expect(makeDatabaseUrlChoice(all).found).toStrictEqual({ url: 'file:flag.db', source: 'flag' })
    expect(makeDatabaseUrlChoice({ ...all, explicit: null }).found).toStrictEqual({
      url: 'file:config.db',
      source: 'hekireki',
    })
    expect(makeDatabaseUrlChoice({ ...all, explicit: null, configUrl: '' }).found).toStrictEqual({
      url: 'file:named.db',
      source: 'prisma',
    })
    expect(
      makeDatabaseUrlChoice({ ...none, fallback: 'file:fallback.db', where: 'the schema' }).found,
    ).toStrictEqual({ url: 'file:fallback.db', source: 'env' })
  })

  it('says which variable is missing, or that nothing names a URL', () => {
    expect(
      makeDatabaseUrlChoice({
        ...none,
        datasource: { kind: 'env', name: 'DB' },
        where: 'prisma.config.ts',
      }).reason,
    ).toBe(
      'prisma.config.ts reads the database URL from env("DB"), but DB is not set.\n   Set it in .env or the environment, or pass --url <connection string>.',
    )
    expect(makeDatabaseUrlChoice({ ...none, where: 'the schema' }).reason).toContain(
      'No database URL found.',
    )
  })
})

describe('makeDialect', () => {
  it('detects the dialect from the scheme, then from the schema provider', () => {
    expect(makeDialect({ url: 'postgresql://x', schemaProvider: null })).toBe('postgresql')
    expect(makeDialect({ url: 'postgres://x', schemaProvider: null })).toBe('postgresql')
    expect(makeDialect({ url: 'mysql://x', schemaProvider: null })).toBe('mysql')
    expect(makeDialect({ url: 'file:./dev.db', schemaProvider: null })).toBe('sqlite')
    expect(makeDialect({ url: 'libsql://app-org.turso.io', schemaProvider: null })).toBe('sqlite')
    expect(makeDialect({ url: 'http://127.0.0.1:8080', schemaProvider: 'sqlite' })).toBe('sqlite')
    expect(makeDialect({ url: 'anything', schemaProvider: 'cockroachdb' })).toBe('postgresql')
    expect(makeDialect({ url: 'anything', schemaProvider: 'mysql' })).toBe('mysql')
    expect(makeDialect({ url: 'anything', schemaProvider: 'sqlite' })).toBe('sqlite')
    expect(makeDialect({ url: 'mongodb://x', schemaProvider: 'mongodb' })).toBeNull()
  })
})

describe('isLibsqlUrl', () => {
  it("is Turso's libsql:// and a libSQL server's http(s):// or ws(s)://, never a file", () => {
    expect(isLibsqlUrl({ url: 'libsql://app-org.turso.io?authToken=t' })).toBe(true)
    expect(isLibsqlUrl({ url: 'http://127.0.0.1:8080' })).toBe(true)
    expect(isLibsqlUrl({ url: 'https://app-org.turso.io' })).toBe(true)
    expect(isLibsqlUrl({ url: 'wss://app-org.turso.io' })).toBe(true)
    expect(isLibsqlUrl({ url: 'file:./dev.db' })).toBe(false)
    expect(isLibsqlUrl({ url: 'postgresql://x' })).toBe(false)
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
  it("hides a token passed as a query parameter, as Turso's authToken is", () => {
    expect(makeRedactedUrl({ url: 'libsql://app-org.turso.io?authToken=eyJhbGci.x.y' })).toBe(
      'libsql://app-org.turso.io?authToken=***',
    )
    expect(makeRedactedUrl({ url: 'http://127.0.0.1:8080?tls=0&authToken=abc&x=1' })).toBe(
      'http://127.0.0.1:8080?tls=0&authToken=***&x=1',
    )
    expect(makeRedactedUrl({ url: 'mysql://u:p@host/db?password=abc' })).toBe(
      'mysql://u:***@host/db?password=***',
    )
  })

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
