import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import {
  DatabaseUrlNotFoundError,
  makeDatabaseUrl,
  makeDialect,
  makePostgresSchema,
  makeRedactedUrl,
  makeSqliteFilePath,
} from './url.js'

describe('makeDatabaseUrl', () => {
  const configText = "export default { datasource: { url: env('PG_URL') } }"

  it('prefers the explicit flag', () => {
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: 'file:x.db',
          configUrl: 'file:config.db',
          schemaText: null,
          env: { DATABASE_URL: 'y' },
          dotenv: {},
          configText,
        }),
      ),
    ).toStrictEqual(Exit.succeed({ url: 'file:x.db', source: 'flag' }))
  })

  it('takes the url of hekireki.config.ts before the environment, so one config serves seed and studio', () => {
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: 'file:config.db',
          schemaText: null,
          env: { DATABASE_URL: 'env-url' },
          dotenv: {},
          configText,
        }),
      ),
    ).toStrictEqual(Exit.succeed({ url: 'file:config.db', source: 'hekireki' }))
    expect(
      Exit.isFailure(
        Effect.runSyncExit(
          makeDatabaseUrl({
            explicit: null,
            configUrl: '',
            schemaText: null,
            env: {},
            dotenv: {},
            configText: null,
          }),
        ),
      ),
    ).toBe(true)
  })

  it('reads the variable Prisma names before DATABASE_URL, from the environment, then .env', () => {
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: null,
          schemaText: null,
          env: { PG_URL: 'pg-env', DATABASE_URL: 'env-url' },
          dotenv: { PG_URL: 'pg-dotenv' },
          configText,
        }),
      ),
    ).toStrictEqual(Exit.succeed({ url: 'pg-env', source: 'prisma' }))
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: null,
          schemaText: null,
          env: { DATABASE_URL: 'env-url' },
          dotenv: { PG_URL: 'pg-dotenv' },
          configText,
        }),
      ),
    ).toStrictEqual(Exit.succeed({ url: 'pg-dotenv', source: 'prisma' }))
  })

  it('reads the datasource url of the schema when prisma.config.ts names none, prisma.config.ts winning', () => {
    const schemaText = 'datasource db {\n  provider = "postgresql"\n  url      = env("APP_DB")\n}\n'
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: null,
          schemaText,
          env: { APP_DB: 'app', DATABASE_URL: 'env-url' },
          dotenv: {},
          configText: null,
        }),
      ),
    ).toStrictEqual(Exit.succeed({ url: 'app', source: 'prisma' }))
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: null,
          schemaText,
          env: { APP_DB: 'app', PG_URL: 'pg' },
          dotenv: {},
          configText,
        }),
      ),
    ).toStrictEqual(Exit.succeed({ url: 'pg', source: 'prisma' }))
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: null,
          schemaText,
          env: {},
          dotenv: {},
          configText: null,
        }),
      ),
    ).toStrictEqual(
      Exit.fail(
        new DatabaseUrlNotFoundError({
          reason:
            'the schema reads the database URL from env("APP_DB"), but APP_DB is not set.\n   Set it in .env or the environment, or pass --url <connection string>.',
        }),
      ),
    )
  })

  it("falls back to DATABASE_URL, Prisma's default name, only when Prisma names nothing", () => {
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: null,
          schemaText: null,
          env: { DATABASE_URL: 'env-url' },
          dotenv: { DATABASE_URL: 'dotenv-url' },
          configText: null,
        }),
      ),
    ).toStrictEqual(Exit.succeed({ url: 'env-url', source: 'env' }))
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: null,
          schemaText: 'datasource db {\n  provider = "sqlite"\n}\n',
          env: {},
          dotenv: { DATABASE_URL: 'dotenv-url' },
          configText: 'export default { schema: "prisma/schema.prisma" }',
        }),
      ),
    ).toStrictEqual(Exit.succeed({ url: 'dotenv-url', source: 'env' }))
  })

  it('resolves the prisma.config.ts env variable', () => {
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: null,
          schemaText: null,
          env: { PG_URL: 'pg' },
          dotenv: {},
          configText,
        }),
      ),
    ).toStrictEqual(Exit.succeed({ url: 'pg', source: 'prisma' }))
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: null,
          schemaText: null,
          env: {},
          dotenv: {},
          configText,
        }),
      ),
    ).toStrictEqual(
      Exit.fail(
        new DatabaseUrlNotFoundError({
          reason:
            'prisma.config.ts reads the database URL from env("PG_URL"), but PG_URL is not set.\n   Set it in .env or the environment, or pass --url <connection string>.',
        }),
      ),
    )
  })

  it('uses a literal config url and explains when nothing is configured', () => {
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: null,
          schemaText: null,
          env: {},
          dotenv: {},
          configText: 'export default { datasource: { url: "file:./dev.db" } }',
        }),
      ),
    ).toStrictEqual(Exit.succeed({ url: 'file:./dev.db', source: 'prisma' }))
    expect(
      Effect.runSyncExit(
        makeDatabaseUrl({
          explicit: null,
          configUrl: null,
          schemaText: null,
          env: {},
          dotenv: {},
          configText: null,
        }),
      ),
    ).toStrictEqual(
      Exit.fail(
        new DatabaseUrlNotFoundError({
          reason:
            'No database URL found.\n   Set `url` in hekireki.config.ts, name the variable in prisma.config.ts (`datasource: { url: env("DATABASE_URL") }`) and set it in .env or the environment, or pass --url <connection string>.',
        }),
      ),
    )
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
