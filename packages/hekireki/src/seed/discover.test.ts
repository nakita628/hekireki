import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { discoverClient } from './discover.js'
import { withTypeScriptImports } from './resolve.js'
import { parseSchema } from './schema.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-seed-discover-'))
  dirs.push(dir)
  return dir
}

const SCHEMA = `datasource db {
  provider = "sqlite"
}

model User {
  id Int @id @default(autoincrement())
}
`

const CLIENT_GENERATOR = `generator client {
  provider = "prisma-client"
  output   = "generated/client"
}
`

/** What \`prisma generate\` would write: a TypeScript class importing a sibling without an extension. */
function writeClient(dir: string, body = '', entry = 'client.ts') {
  mkdirSync(path.join(dir, 'generated', 'client'), { recursive: true })
  writeFileSync(
    path.join(dir, 'generated', 'client', 'enums.ts'),
    "export const Role = { ADMIN: 'ADMIN' } as const\n",
  )
  writeFileSync(
    path.join(dir, 'generated', 'client', entry),
    `import { Role } from './enums'
export class PrismaClient {
  readonly roles = Object.keys(Role)
  readonly adapter: unknown
  constructor(options: { adapter: unknown }) {
    this.adapter = options.adapter
  }
  ${body}
}
`,
  )
}

/** A stand-in for an installed \`@prisma/adapter-*\` package that records what it was constructed with. */
function writeAdapter(dir: string, pkg: string, className: string, body = '') {
  const root = path.join(dir, 'node_modules', ...pkg.split('/'))
  mkdirSync(root, { recursive: true })
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: pkg, type: 'module', main: 'index.js' }),
  )
  writeFileSync(
    path.join(root, 'index.js'),
    `export class ${className} { constructor(config) { this.config = config${body} } }\n`,
  )
}

function discover(
  dir: string,
  schema: string,
  dialect: 'sqlite' | 'postgresql' | 'mysql',
  url: string,
) {
  const { generators } = Effect.runSync(
    parseSchema([{ path: path.join(dir, 'schema.prisma'), content: schema }]),
  )
  return Effect.runPromise(
    withTypeScriptImports(
      discoverClient({
        generators,
        schemaDir: dir,
        cwd: dir,
        url,
        dialect,
      }),
    ),
  )
}

describe('discoverClient', () => {
  it('says so when the schema has no prisma-client generator', async () => {
    const dir = tmp()
    expect(await discover(dir, SCHEMA, 'sqlite', 'file:./dev.db')).toStrictEqual({
      client: null,
      source: null,
      reason: 'no prisma-client generator in the schema',
    })
    // Another generator does not count.
    expect(
      await discover(
        dir,
        `${SCHEMA}generator seed {\n  provider = "hekireki-seed"\n  output = "generated/seed"\n}\n`,
        'sqlite',
        'file:./dev.db',
      ),
    ).toStrictEqual({
      client: null,
      source: null,
      reason: 'no prisma-client generator in the schema',
    })
  })

  it('says so when the prisma-client generator has no output', async () => {
    const dir = tmp()
    expect(
      await discover(
        dir,
        `${SCHEMA}generator client {\n  provider = "prisma-client"\n}\n`,
        'sqlite',
        'file:./dev.db',
      ),
    ).toStrictEqual({
      client: null,
      source: null,
      reason: 'the prisma-client generator has no output',
    })
  })

  it('names the output that could not be loaded and tells the user to run prisma generate', async () => {
    const dir = tmp()
    const found = await discover(dir, `${SCHEMA}${CLIENT_GENERATOR}`, 'sqlite', 'file:./dev.db')
    expect(found.client).toBeNull()
    expect(found.source).toBe('generated/client')
    expect(found.reason).toMatch(
      /^the Prisma Client at generated\/client could not be loaded \(Cannot find module .*generated\/client\/client\.ts'.*\); run `prisma generate`$/su,
    )
  })

  it('refuses a module that exports no PrismaClient class', async () => {
    const dir = tmp()
    mkdirSync(path.join(dir, 'generated', 'client'), { recursive: true })
    writeFileSync(path.join(dir, 'generated', 'client', 'client.ts'), 'export const nope = 1\n')
    expect(
      await discover(dir, `${SCHEMA}${CLIENT_GENERATOR}`, 'sqlite', 'file:./dev.db'),
    ).toStrictEqual({
      client: null,
      source: 'generated/client',
      reason: 'generated/client does not export PrismaClient',
    })
    writeFileSync(
      path.join(dir, 'generated', 'client', 'client.ts'),
      'export const PrismaClient = "not a class"\n',
    )
    const notAClass = await discover(dir, `${SCHEMA}${CLIENT_GENERATOR}`, 'sqlite', 'file:./dev.db')
    expect(notAClass.reason).toBe('generated/client does not export PrismaClient')
  })

  it('names the adapter package the project lacks, with the resolution error', async () => {
    const dir = tmp()
    writeClient(dir)
    const found = await discover(dir, `${SCHEMA}${CLIENT_GENERATOR}`, 'sqlite', 'file:./dev.db')
    expect(found.client).toBeNull()
    expect(found.source).toBe('generated/client')
    expect(found.reason).toBe(
      `@prisma/adapter-better-sqlite3 is not installed (Cannot load "@prisma/adapter-better-sqlite3" from ${dir}: Cannot find module '@prisma/adapter-better-sqlite3'\nRequire stack:\n- ${path.join(dir, 'package.json')})`,
    )
  })

  it('refuses an adapter package without the expected class', async () => {
    const dir = tmp()
    writeClient(dir)
    writeAdapter(dir, '@prisma/adapter-better-sqlite3', 'SomethingElse')
    expect(
      await discover(dir, `${SCHEMA}${CLIENT_GENERATOR}`, 'sqlite', 'file:./dev.db'),
    ).toStrictEqual({
      client: null,
      source: 'generated/client',
      reason: '@prisma/adapter-better-sqlite3 does not export PrismaBetterSqlite3',
    })
  })

  it('reports an adapter or a client whose constructor throws, instead of crashing', async () => {
    const dir = tmp()
    writeClient(dir)
    writeAdapter(
      dir,
      '@prisma/adapter-better-sqlite3',
      'PrismaBetterSqlite3',
      "; throw new Error('better-sqlite3 was not built for this Node.js')",
    )
    expect(
      await discover(dir, `${SCHEMA}${CLIENT_GENERATOR}`, 'sqlite', 'file:./dev.db'),
    ).toStrictEqual({
      client: null,
      source: 'generated/client',
      reason:
        '@prisma/adapter-better-sqlite3 could not build PrismaBetterSqlite3: better-sqlite3 was not built for this Node.js',
    })
    const other = tmp()
    writeClient(other, "static boom = (() => { throw new Error('engine missing') })()")
    writeAdapter(other, '@prisma/adapter-better-sqlite3', 'PrismaBetterSqlite3')
    const found = await discover(other, `${SCHEMA}${CLIENT_GENERATOR}`, 'sqlite', 'file:./dev.db')
    expect(found.client).toBeNull()
    expect(found.reason).toMatch(
      /^the Prisma Client at generated\/client could not be loaded \(engine missing\); run `prisma generate`$/u,
    )
    const third = tmp()
    writeClient(third, "throwing = (() => { throw new Error('no adapter given') })()")
    writeAdapter(third, '@prisma/adapter-better-sqlite3', 'PrismaBetterSqlite3')
    expect(
      await discover(third, `${SCHEMA}${CLIENT_GENERATOR}`, 'sqlite', 'file:./dev.db'),
    ).toStrictEqual({
      client: null,
      source: 'generated/client',
      reason: 'the Prisma Client at generated/client could not be constructed (no adapter given)',
    })
  })

  it('builds the sqlite adapter with the database file resolved against the schema directory', async () => {
    const cwd = tmp()
    const schemaDir = path.join(cwd, 'prisma')
    mkdirSync(schemaDir)
    writeClient(schemaDir)
    writeAdapter(cwd, '@prisma/adapter-better-sqlite3', 'PrismaBetterSqlite3')
    const found = await Effect.runPromise(
      withTypeScriptImports(
        discoverClient({
          generators: Effect.runSync(
            parseSchema([{ path: 'schema.prisma', content: `${SCHEMA}${CLIENT_GENERATOR}` }]),
          ).generators,
          schemaDir,
          cwd,
          url: 'file:./dev.db',
          dialect: 'sqlite',
        }),
      ),
    )
    expect(found.source).toBe('generated/client')
    expect(found.reason).toBeNull()
    const client = found.client as { roles: string[]; adapter: { config: unknown } }
    expect(client.roles).toStrictEqual(['ADMIN'])
    expect(client.adapter.config).toStrictEqual({ url: path.join(schemaDir, 'dev.db') })
  })

  it.each([
    ['postgresql', '@prisma/adapter-pg', 'PrismaPg', 'postgresql://postgres:pw@localhost:5432/app'],
    ['mysql', '@prisma/adapter-mariadb', 'PrismaMariaDb', 'mysql://root:pw@localhost:3306/app'],
  ] as const)(
    'hands the %s adapter the connection URL as it is',
    async (dialect, pkg, className, url) => {
      const dir = tmp()
      writeClient(dir)
      writeAdapter(dir, pkg, className)
      const found = await discover(
        dir,
        `${SCHEMA.replace('"sqlite"', `"${dialect}"`)}${CLIENT_GENERATOR}`,
        dialect,
        url,
      )
      expect(found.reason).toBeNull()
      expect((found.client as { adapter: { config: unknown } }).adapter.config).toBe(url)
    },
  )

  it('takes client.ts before the JavaScript variants, and a lone client.mjs when that is all there is', async () => {
    const dir = tmp()
    writeAdapter(dir, '@prisma/adapter-better-sqlite3', 'PrismaBetterSqlite3')
    mkdirSync(path.join(dir, 'generated', 'client'), { recursive: true })
    writeFileSync(
      path.join(dir, 'generated', 'client', 'client.mjs'),
      'export class PrismaClient { constructor() { this.entry = "mjs" } }\n',
    )
    const onlyMjs = await discover(dir, `${SCHEMA}${CLIENT_GENERATOR}`, 'sqlite', 'file:./dev.db')
    expect((onlyMjs.client as { entry: string }).entry).toBe('mjs')
    writeFileSync(
      path.join(dir, 'generated', 'client', 'client.js'),
      'export class PrismaClient { constructor() { this.entry = "js" } }\n',
    )
    writeFileSync(
      path.join(dir, 'generated', 'client', 'client.ts'),
      'export class PrismaClient { readonly entry: string = "ts" }\n',
    )
    const all = await discover(dir, `${SCHEMA}${CLIENT_GENERATOR}`, 'sqlite', 'file:./dev.db')
    expect((all.client as { entry: string }).entry).toBe('ts')
  })

  it('loads @prisma/client from the project for the legacy prisma-client-js generator', async () => {
    const dir = tmp()
    const pkg = path.join(dir, 'node_modules', '@prisma', 'client')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: '@prisma/client', type: 'module', main: 'index.js' }),
    )
    writeFileSync(
      path.join(pkg, 'index.js'),
      'export class PrismaClient { constructor(options) { this.adapter = options.adapter } }\n',
    )
    writeAdapter(dir, '@prisma/adapter-better-sqlite3', 'PrismaBetterSqlite3')
    const found = await discover(
      dir,
      `${SCHEMA}generator client {\n  provider = "prisma-client-js"\n}\n`,
      'sqlite',
      'file:./dev.db',
    )
    expect(found.source).toBe('@prisma/client')
    expect(found.reason).toBeNull()
    expect((found.client as { adapter: { config: unknown } }).adapter.config).toStrictEqual({
      url: path.join(dir, 'dev.db'),
    })
    // Without the package installed the legacy generator is reported like a missing output.
    const bare = tmp()
    const missing = await discover(
      bare,
      `${SCHEMA}generator client {\n  provider = "prisma-client-js"\n}\n`,
      'sqlite',
      'file:./dev.db',
    )
    expect(missing.source).toBe('@prisma/client')
    // What Node cannot find depends on what else is installed on the machine; the frame is fixed.
    expect(missing.reason).toMatch(
      new RegExp(
        `^the Prisma Client at @prisma/client could not be loaded \\(Cannot load "@prisma/client" from ${bare.replaceAll('/', '\\/')}: Cannot find module .*\\); run \`prisma generate\`$`,
        'su',
      ),
    )
  })
})
