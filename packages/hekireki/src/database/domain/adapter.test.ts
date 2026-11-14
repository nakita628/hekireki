import { describe, expect, it } from 'vite-plus/test'

import { ADAPTERS, adapterOf, LIBSQL_ADAPTER, makeAdapterArgs } from './adapter.js'

describe('adapterOf', () => {
  it("opens a libSQL server through its own adapter, and a SQLite file through SQLite's", () => {
    expect(adapterOf('sqlite', 'libsql://app-org.turso.io')).toBe(LIBSQL_ADAPTER)
    expect(adapterOf('sqlite', 'http://127.0.0.1:8080')).toBe(LIBSQL_ADAPTER)
    expect(adapterOf('sqlite', 'file:./dev.db')).toBe(ADAPTERS.sqlite)
    expect(adapterOf('postgresql', 'postgresql://x')).toBe(ADAPTERS.postgresql)
  })
})

describe('makeAdapterArgs', () => {
  it('gives SQLite the file, resolved from the schema directory, and libSQL the URL as it is', () => {
    expect(
      makeAdapterArgs({ dialect: 'sqlite', url: 'file:./dev.db', schemaDir: '/app/prisma' }),
    ).toStrictEqual([{ url: '/app/prisma/dev.db' }])
    expect(
      makeAdapterArgs({
        dialect: 'sqlite',
        url: 'libsql://app-org.turso.io?authToken=t',
        schemaDir: '/app/prisma',
      }),
    ).toStrictEqual([{ url: 'libsql://app-org.turso.io?authToken=t' }])
  })

  it('gives PostgreSQL the schema of its ?schema= as an option, and MySQL the URL', () => {
    expect(
      makeAdapterArgs({
        dialect: 'postgresql',
        url: 'postgresql://h/db?schema=app',
        schemaDir: '.',
      }),
    ).toStrictEqual(['postgresql://h/db?schema=app', { schema: 'app' }])
    expect(
      makeAdapterArgs({ dialect: 'postgresql', url: 'postgresql://h/db', schemaDir: '.' }),
    ).toStrictEqual(['postgresql://h/db'])
    expect(
      makeAdapterArgs({ dialect: 'mysql', url: 'mysql://h/db', schemaDir: '.' }),
    ).toStrictEqual(['mysql://h/db'])
  })
})
