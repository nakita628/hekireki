import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { createStudioApp } from '../app.js'
import {
  createProjectClient,
  createStudioState,
  disconnectedDatabase,
  unavailableClient,
} from '../services/index.js'

const dirs: string[] = []
const clients: ReturnType<typeof createProjectClient>[] = []

afterEach(async () => {
  await Effect.runPromise(Effect.all(clients.splice(0).map((client) => client.close)))
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const SCHEMA = `datasource db {
  provider = "sqlite"
}

generator client {
  provider = "prisma-client"
  output   = "generated/client"
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
}

model Post {
  id Int @id @default(autoincrement())
}
`

/**
 * What `prisma generate` would write, cut down to what Studio calls: `$on` for query events, a
 * batch `$transaction`, and a `user` delegate whose operations report one statement each when
 * they are awaited. There is no `post` delegate, as in a client generated before Post was added.
 */
const CLIENT = `import { ESCAPE } from './internal'

export class PrismaClient {
  readonly listeners: ((event: unknown) => void)[] = []
  readonly options: Record<string, unknown>
  readonly user: Record<string, (args?: Record<string, unknown>) => unknown>
  disconnected = false

  constructor(options: Record<string, unknown>) {
    this.options = options
    this.user = {
      findMany: (args) =>
        this.statement('SELECT "id", "email" FROM "User" LIMIT ?', [args?.take ?? -1], [
          { id: 1n, email: 'ann@example.com', at: new Date(0) },
          { id: 2n, email: 'bob@example.com', at: new Date(1000) },
        ]),
      findFirst: () =>
        this.statement('SELECT 1', [], {
          log: this.options.log,
          errorFormat: this.options.errorFormat,
          adapter: Reflect.get(Object(this.options.adapter), 'config'),
        }),
      count: () => this.statement('SELECT COUNT(*) FROM "User"', [], 2),
      groupBy: () =>
        this.statement(
          'SELECT "id" FROM "User" GROUP BY "id"',
          [],
          Array.from({ length: 600 }, (_, id) => ({ id })),
        ),
      aggregate: () => {
        throw new Error('aggregate is not wired in this client')
      },
      // An event of another shape among the query events: it is not a statement, and is skipped.
      findUnique: () => ({
        then: (resolve: (value: unknown) => void) => {
          for (const listener of this.listeners) listener({ query: 1, target: 'quaint' })
          this.report('SELECT 3', [])
          resolve(null)
        },
      }),
      // Two statements with a pause between them, so a call can still be sending while another arrives.
      findFirstOrThrow: (args) => ({
        then: (resolve: (value: unknown) => void) => {
          const email = String((args?.where as { email?: unknown } | undefined)?.email)
          this.report('SELECT 1 FROM "User" WHERE "email" = ?', [email])
          setTimeout(() => {
            this.report('SELECT 2 FROM "User" WHERE "email" = ?', [email])
            resolve({ email })
          }, 40)
        },
      }),
      create: (args) =>
        this.statement('INSERT INTO "User" ("email") VALUES (?)', [args?.data?.email], null),
      delete: () => ({
        then: (_resolve: unknown, reject: (error: Error) => void) => {
          reject(new Error(\`\${ESCAPE}[31mRecord to delete does not exist.\${ESCAPE}[39m\`))
        },
      }),
    }
  }

  report(query: string, params: unknown[]) {
    for (const listener of this.listeners) {
      listener({ query, params: JSON.stringify(params), duration: 1.26 })
    }
  }

  statement(query: string, params: unknown[], result: unknown) {
    return {
      then: (resolve: (value: unknown) => void) => {
        this.report(query, params)
        resolve(result)
      },
    }
  }

  $on(event: string, listener: (event: unknown) => void) {
    if (event === 'query') this.listeners.push(listener)
  }

  async $transaction(operations: unknown[], options?: unknown) {
    const results: unknown[] = []
    for (const operation of operations) results.push(await operation)
    for (const listener of this.listeners) {
      listener({ query: 'COMMIT', params: JSON.stringify([options ?? null]), duration: 0 })
    }
    return results
  }

  async $disconnect() {
    this.disconnected = true
  }
}
`

function setupProject(schema = SCHEMA) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-client-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, schema)
  mkdirSync(path.join(dir, 'generated', 'client'), { recursive: true })
  writeFileSync(path.join(dir, 'generated', 'client', 'client.ts'), CLIENT)
  writeFileSync(
    path.join(dir, 'generated', 'client', 'internal.ts'),
    'export const ESCAPE = String.fromCharCode(27)\n',
  )
  // The project's TypeScript: the 5.x line, which has the language service the editor completes with.
  mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  symlinkSync(
    realpathSync(path.join(import.meta.dirname, '../../../../node_modules/typescript-5')),
    path.join(dir, 'node_modules', 'typescript'),
    'dir',
  )
  const adapter = path.join(dir, 'node_modules', '@prisma', 'adapter-better-sqlite3')
  mkdirSync(adapter, { recursive: true })
  writeFileSync(
    path.join(adapter, 'package.json'),
    JSON.stringify({ name: '@prisma/adapter-better-sqlite3', type: 'module', main: 'index.js' }),
  )
  writeFileSync(
    path.join(adapter, 'index.js'),
    'export class PrismaBetterSqlite3 { constructor(config) { this.config = config } }\n',
  )
  return { dir, schemaPath }
}

async function setup(input: {
  readonly client: (dir: string) => ReturnType<typeof createProjectClient>
  readonly schema?: string
  /** Changes the project before Studio reads it: a file taken away, another written. */
  readonly arrange?: (dir: string) => void
}) {
  const { dir, schemaPath } = setupProject(input.schema)
  input.arrange?.(dir)
  const state = createStudioState({ schemaPath })
  await Effect.runPromise(Effect.provide(state.reload(), fileSystemLayer))
  const client = input.client(dir)
  clients.push(client)
  const app = createStudioApp(state, dir, disconnectedDatabase(), client)
  const call = async (url: string, body?: unknown) => {
    const response = await app.request(
      url,
      body === undefined
        ? { method: 'GET' }
        : {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
          },
    )
    const json: unknown = await response.json()
    return { status: response.status, json }
  }
  return { call, dir, client }
}

function projectClient(dir: string) {
  return createProjectClient({
    target: { url: 'file:./dev.db', dialect: 'sqlite' },
    reason: null,
    schemaDir: dir,
    cwd: dir,
  })
}

describe('client routes', () => {
  it("loads the generated client with the project's adapter and query events on", async () => {
    const { call, dir } = await setup({ client: projectClient })
    expect(await call('/api/client')).toStrictEqual({
      status: 200,
      json: {
        available: true,
        source: 'generated/client',
        error: null,
        typescript: '5.9.3',
        typesError: null,
      },
    })
    expect(await call('/api/client/run', { query: 'prisma.user.findFirst()' })).toStrictEqual({
      status: 200,
      json: {
        result: {
          log: [{ emit: 'event', level: 'query' }],
          errorFormat: 'minimal',
          adapter: { url: path.join(dir, 'dev.db') },
        },
        rowCount: null,
        truncated: false,
        queries: [{ sql: 'SELECT 1', formatted: 'SELECT\n  1', params: [], durationMs: 1.3 }],
        durationMs: expect.any(Number),
      },
    })
  })

  it('runs one call and returns its result as JSON with the statements it sent', async () => {
    const { call } = await setup({ client: projectClient })
    expect(
      await call('/api/client/run', { query: 'await prisma.user.findMany({ take: 10 });' }),
    ).toStrictEqual({
      status: 200,
      json: {
        result: [
          { id: '1', email: 'ann@example.com', at: '1970-01-01T00:00:00.000Z' },
          { id: '2', email: 'bob@example.com', at: '1970-01-01T00:00:01.000Z' },
        ],
        rowCount: 2,
        truncated: false,
        queries: [
          {
            sql: 'SELECT "id", "email" FROM "User" LIMIT ?',
            formatted: 'SELECT\n  "id",\n  "email"\nFROM\n  "User"\nLIMIT\n  ?',
            params: [10],
            durationMs: 1.3,
          },
        ],
        durationMs: expect.any(Number),
      },
    })
  })

  it('previews the SQL a read sends, without its result, and refuses a write before it reaches the client', async () => {
    const { call } = await setup({ client: projectClient })
    expect(
      await call('/api/client/preview', { query: 'prisma.user.findMany({ take: 10 })' }),
    ).toStrictEqual({
      status: 200,
      json: {
        queries: [
          {
            sql: 'SELECT "id", "email" FROM "User" LIMIT ?',
            formatted: 'SELECT\n  "id",\n  "email"\nFROM\n  "User"\nLIMIT\n  ?',
            params: [10],
            durationMs: 1.3,
          },
        ],
        durationMs: expect.any(Number),
      },
    })
    // The fixture's delegate has no create: had the write reached the client, it would say so.
    const refused = [
      [
        'prisma.user.create({ data: { email: "x" } })',
        'User.create writes: its SQL shows when it is run',
      ],
      [
        'prisma.$transaction([prisma.user.count(), prisma.user.deleteMany()])',
        'User.deleteMany writes: its SQL shows when it is run',
      ],
      [
        'prisma.user.findMany({ where: { email } })',
        '"email" is a variable: write "email: <value>"',
      ],
    ] as const
    expect(
      await Promise.all(refused.map(([query]) => call('/api/client/preview', { query }))),
    ).toStrictEqual(
      refused.map(([, message]) => ({
        status: 422,
        json: {
          type: '/problems/validation-failed',
          title: 'Validation Failed',
          status: 422,
          detail: message,
          instance: '/api/client/preview',
          errors: [{ field: 'query', message }],
        },
      })),
    )
  })

  it('runs a batch $transaction with its options and collects every statement', async () => {
    const { call } = await setup({ client: projectClient })
    expect(
      await call('/api/client/run', {
        query:
          'prisma.$transaction([prisma.user.count(), prisma.user.create({ data: { email: "cy@example.com" } })], { isolationLevel: "Serializable" })',
      }),
    ).toStrictEqual({
      status: 200,
      json: {
        result: [2, null],
        rowCount: 2,
        truncated: false,
        queries: [
          {
            sql: 'SELECT COUNT(*) FROM "User"',
            formatted: 'SELECT\n  COUNT(*)\nFROM\n  "User"',
            params: [],
            durationMs: 1.3,
          },
          {
            sql: 'INSERT INTO "User" ("email") VALUES (?)',
            formatted: 'INSERT INTO\n  "User" ("email")\nVALUES\n  (?)',
            params: ['cy@example.com'],
            durationMs: 1.3,
          },
          {
            sql: 'COMMIT',
            formatted: 'COMMIT',
            params: ['{"isolationLevel":"Serializable"}'],
            durationMs: 0,
          },
        ],
        durationMs: expect.any(Number),
      },
    })
  })

  it('keeps the statements of two calls that run at the same time apart', async () => {
    const { call } = await setup({ client: projectClient })
    const [ann, bob] = await Promise.all([
      call('/api/client/run', {
        query: 'prisma.user.findFirstOrThrow({ where: { email: "ann" } })',
      }),
      call('/api/client/run', {
        query: 'prisma.user.findFirstOrThrow({ where: { email: "bob" } })',
      }),
    ])
    const statementsOf = (json: unknown) =>
      typeof json === 'object' && json !== null && 'queries' in json && Array.isArray(json.queries)
        ? json.queries.map((query: { sql: string; params: unknown[] }) => [query.sql, query.params])
        : []
    // Each call lists the two statements it sent, and none of the other's.
    expect(statementsOf(ann.json)).toStrictEqual([
      ['SELECT 1 FROM "User" WHERE "email" = ?', ['ann']],
      ['SELECT 2 FROM "User" WHERE "email" = ?', ['ann']],
    ])
    expect(statementsOf(bob.json)).toStrictEqual([
      ['SELECT 1 FROM "User" WHERE "email" = ?', ['bob']],
      ['SELECT 2 FROM "User" WHERE "email" = ?', ['bob']],
    ])
  })

  it('keeps the statements of a preview apart from a run that goes at the same time', async () => {
    const { call } = await setup({ client: projectClient })
    const [previewed, ran] = await Promise.all([
      call('/api/client/preview', {
        query: 'prisma.user.findFirstOrThrow({ where: { email: "ann" } })',
      }),
      call('/api/client/run', {
        query: 'prisma.user.findFirstOrThrow({ where: { email: "bob" } })',
      }),
    ])
    const statementsOf = (json: unknown) =>
      typeof json === 'object' && json !== null && 'queries' in json && Array.isArray(json.queries)
        ? json.queries.map((query: { sql: string; params: unknown[] }) => [query.sql, query.params])
        : []
    expect(statementsOf(previewed.json)).toStrictEqual([
      ['SELECT 1 FROM "User" WHERE "email" = ?', ['ann']],
      ['SELECT 2 FROM "User" WHERE "email" = ?', ['ann']],
    ])
    expect(statementsOf(ran.json)).toStrictEqual([
      ['SELECT 1 FROM "User" WHERE "email" = ?', ['bob']],
      ['SELECT 2 FROM "User" WHERE "email" = ?', ['bob']],
    ])
  })

  it('previews every statement of a batch of reads, and reports what the client throws', async () => {
    const { call } = await setup({ client: projectClient })
    expect(
      await call('/api/client/preview', {
        query: 'prisma.$transaction([prisma.user.count(), prisma.user.findMany({ take: 1 })])',
      }),
    ).toMatchObject({
      status: 200,
      json: {
        queries: [
          { sql: 'SELECT COUNT(*) FROM "User"', params: [] },
          { sql: 'SELECT "id", "email" FROM "User" LIMIT ?', params: [1] },
          // The batch commits as one transaction, as the run of it does.
          { sql: 'COMMIT' },
        ],
      },
    })
    const message = 'aggregate is not wired in this client'
    expect(await call('/api/client/preview', { query: 'prisma.user.aggregate({})' })).toStrictEqual(
      {
        status: 422,
        json: {
          type: '/problems/validation-failed',
          title: 'Validation Failed',
          status: 422,
          detail: message,
          instance: '/api/client/preview',
          errors: [{ field: 'query', message }],
        },
      },
    )
  })

  it('answers two questions about different texts that arrive together, each about its own text', async () => {
    const { call } = await setup({ client: projectClient })
    const labels = (json: unknown) =>
      typeof json === 'object' && json !== null && 'items' in json && Array.isArray(json.items)
        ? json.items.map((item: { label: string }) => item.label)
        : []
    // The members of the client, and those of one of its arrays: two answers with nothing in common.
    const [client, array] = await Promise.all([
      call('/api/client/complete', { query: 'prisma.', offset: 7 }),
      call('/api/client/complete', { query: 'prisma.listeners.', offset: 17 }),
    ])
    expect(labels(client.json)).toContain('user')
    expect(labels(client.json)).not.toContain('map')
    expect(labels(array.json)).toContain('map')
    expect(labels(array.json)).not.toContain('user')
  })

  it('reports what the client throws, without its colours, as a validation problem', async () => {
    const { call } = await setup({ client: projectClient })
    expect(
      await call('/api/client/run', { query: 'prisma.user.delete({ where: { id: 9 } })' }),
    ).toStrictEqual({
      status: 422,
      json: {
        type: '/problems/validation-failed',
        title: 'Validation Failed',
        status: 422,
        detail: 'Record to delete does not exist.',
        instance: '/api/client/run',
        errors: [{ field: 'query', message: 'Record to delete does not exist.' }],
      },
    })
  })

  it('says to regenerate when the loaded client lacks a model of the schema', async () => {
    const { call } = await setup({ client: projectClient })
    const message =
      'The loaded Prisma Client has no post.findMany.\n   Run `prisma generate` and restart Studio so the client matches the schema.'
    expect(await call('/api/client/run', { query: 'prisma.post.findMany()' })).toStrictEqual({
      status: 422,
      json: {
        type: '/problems/validation-failed',
        title: 'Validation Failed',
        status: 422,
        detail: message,
        instance: '/api/client/run',
        errors: [{ field: 'query', message }],
      },
    })
  })

  it('refuses a query that does not read before it reaches the client', async () => {
    const { call } = await setup({ client: projectClient })
    const message = '"email" is a variable: write "email: <value>"'
    expect(
      await call('/api/client/run', { query: 'prisma.user.findMany({ where: { email } })' }),
    ).toStrictEqual({
      status: 422,
      json: {
        type: '/problems/validation-failed',
        title: 'Validation Failed',
        status: 422,
        detail: message,
        instance: '/api/client/run',
        errors: [{ field: 'query', message }],
      },
    })
    expect(await call('/api/client/run', { query: '  ' })).toStrictEqual({
      status: 422,
      json: {
        type: '/problems/validation-failed',
        title: 'Validation Failed',
        status: 422,
        detail: 'The request failed validation. See `errors` for the offending fields.',
        instance: '/api/client/run',
        errors: [{ field: 'query', message: 'Query must not be empty' }],
      },
    })
  })

  it("completes, explains and checks the query with the project's TypeScript against the generated client", async () => {
    const { call } = await setup({ client: projectClient })
    const completions = await call('/api/client/complete', { query: 'prisma.', offset: 7 })
    expect(completions.status).toBe(200)
    const items =
      typeof completions.json === 'object' &&
      completions.json !== null &&
      'items' in completions.json &&
      Array.isArray(completions.json.items)
        ? completions.json.items
        : []
    expect(items).toContainEqual({
      label: 'user',
      kind: 'property',
      sortText: '11',
      insertText: null,
    })
    expect(items).toContainEqual({
      label: '$transaction',
      kind: 'method',
      sortText: '11',
      insertText: null,
    })
    expect(
      await call('/api/client/complete/detail', { query: 'prisma.', offset: 7, name: 'user' }),
    ).toStrictEqual({
      status: 200,
      json: {
        detail:
          '(property) PrismaClient.user: Record<string, (args?: Record<string, unknown>) => unknown>',
        documentation: null,
      },
    })
    expect(
      await call('/api/client/hover', { query: 'prisma.user.findMany()', offset: 3 }),
    ).toStrictEqual({
      status: 200,
      json: {
        contents: '```typescript\nconst prisma: PrismaClient\n```',
        range: { start: 0, end: 6 },
      },
    })
    expect(
      await call('/api/client/signature', { query: 'prisma.user.findMany(', offset: 21 }),
    ).toStrictEqual({
      status: 200,
      json: {
        signatures: [
          {
            label: '(args?: Record<string, unknown>): unknown',
            documentation: null,
            parameters: [{ label: 'args?: Record<string, unknown>', documentation: null }],
          },
        ],
        activeSignature: 0,
        activeParameter: 0,
      },
    })
    expect(
      await call('/api/client/check', { query: 'await prisma.nope.findMany()\nprisma.user' }),
    ).toStrictEqual({
      status: 200,
      json: {
        diagnostics: [
          {
            message: "Property 'nope' does not exist on type 'PrismaClient'.",
            severity: 'error',
            range: { start: 13, end: 17 },
          },
        ],
      },
    })
    expect(await call('/api/client/check', { query: 'prisma.user.findMany()' })).toStrictEqual({
      status: 200,
      json: { diagnostics: [] },
    })
  })

  it('completes against a client prisma generate rewrote, the schema unchanged, without a restart', async () => {
    const { call, dir } = await setup({ client: projectClient })
    const before = await call('/api/client/complete', { query: 'prisma.', offset: 7 })
    const labels = (json: unknown) =>
      typeof json === 'object' && json !== null && 'items' in json && Array.isArray(json.items)
        ? json.items.map((item: { label: string }) => item.label)
        : []
    expect(labels(before.json)).not.toContain('post')
    const file = path.join(dir, 'generated', 'client', 'client.ts')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        '  disconnected = false',
        '  disconnected = false\n  readonly post: Record<string, () => unknown> = {}',
      ),
    )
    // A later modification time is what tells the language service the file changed.
    const later = new Date(Date.now() + 60_000)
    utimesSync(file, later, later)
    const after = await call('/api/client/complete', { query: 'prisma.', offset: 7 })
    expect(labels(after.json)).toContain('post')
  })

  it('says why the editor cannot complete against the types when there is no TypeScript 5', async () => {
    const { call } = await setup({ client: () => unavailableClient() })
    expect(await call('/api/client/complete', { query: 'prisma.', offset: 7 })).toStrictEqual({
      status: 503,
      json: {
        type: '/problems/service-unavailable',
        title: 'Service Unavailable',
        status: 503,
        detail:
          'Completion against the client types needs TypeScript 5 in the project (typescript@7 ships no language service API).\n   Install it with `npm install -D typescript@5`; the editor still completes model and field names from the schema.',
        instance: '/api/client/complete',
      },
    })
  })

  it('analyzes a query against the models without loading the client', async () => {
    const { call } = await setup({ client: () => unavailableClient() })
    expect(
      await call('/api/client/analyze', {
        query: 'prisma.$transaction([prisma.usr.count(), prisma.post.deleteMany()])',
      }),
    ).toStrictEqual({
      status: 200,
      json: {
        calls: [
          {
            model: 'Post',
            operation: 'deleteMany',
            write: true,
            range: { start: 41, end: 65 },
          },
        ],
        transaction: true,
        touched: [{ model: 'Post', fields: [] }],
        diagnostics: [
          {
            message: 'Unknown model delegate "usr". The client has user, post',
            range: { start: 28, end: 31 },
          },
        ],
      },
    })
    expect(
      await call('/api/client/analyze', {
        query: 'prisma.user.findMany({ where: { email: "a" }, orderBy: { id: "asc" } })',
      }),
    ).toMatchObject({
      status: 200,
      json: { touched: [{ model: 'User', fields: ['email', 'id'] }] },
    })
  })

  it('says why there is no client: no database, or no generator in the schema', async () => {
    const offline = await setup({ client: () => unavailableClient('No DATABASE_URL.') })
    expect(await offline.call('/api/client')).toStrictEqual({
      status: 200,
      json: {
        available: false,
        source: null,
        error: 'No DATABASE_URL.',
        typescript: null,
        typesError:
          'Completion against the client types needs TypeScript 5 in the project (typescript@7 ships no language service API).\n   Install it with `npm install -D typescript@5`; the editor still completes model and field names from the schema.',
      },
    })
    const routes = ['/api/client/run', '/api/client/preview']
    expect(
      await Promise.all(
        routes.map((route) => offline.call(route, { query: 'prisma.user.count()' })),
      ),
    ).toStrictEqual(
      routes.map((route) => ({
        status: 503,
        json: {
          type: '/problems/service-unavailable',
          title: 'Service Unavailable',
          status: 503,
          detail: 'No DATABASE_URL.',
          instance: route,
        },
      })),
    )
    const bare = await setup({
      client: projectClient,
      schema: SCHEMA.replace(/generator client \{[^}]*\}/u, ''),
    })
    expect(await bare.call('/api/client')).toStrictEqual({
      status: 200,
      json: {
        available: false,
        source: null,
        error:
          'Prisma Client not found: no prisma-client generator in the schema.\n   Add a `prisma-client` generator to the schema, run `prisma generate` and install @prisma/adapter-better-sqlite3.',
        typescript: null,
        typesError:
          'Prisma Client not found: no prisma-client generator in the schema.\n   Add a `prisma-client` generator to the schema and run `prisma generate`.',
      },
    })
  })

  it('keeps the first rows of a long result, and says how many there were', async () => {
    const { call } = await setup({ client: projectClient })
    const { status, json } = await call('/api/client/run', {
      query: 'prisma.user.groupBy({ by: ["id"] })',
    })
    expect(status).toBe(200)
    expect(json).toMatchObject({ rowCount: 600, truncated: true })
    const result =
      typeof json === 'object' && json !== null && 'result' in json ? json.result : null
    expect(Array.isArray(result) ? [result.length, result.at(-1)] : null).toStrictEqual([
      500,
      { id: 499 },
    ])
  })

  it('reports an operation that throws before it is sent, and skips events that are not statements', async () => {
    const { call } = await setup({ client: projectClient })
    expect(
      await call('/api/client/run', { query: 'prisma.user.aggregate({ _count: true })' }),
    ).toStrictEqual({
      status: 422,
      json: {
        type: '/problems/validation-failed',
        title: 'Validation Failed',
        status: 422,
        detail: 'aggregate is not wired in this client',
        instance: '/api/client/run',
        errors: [{ field: 'query', message: 'aggregate is not wired in this client' }],
      },
    })
    expect(
      await call('/api/client/run', { query: 'prisma.user.findUnique({ where: { id: 1 } })' }),
    ).toMatchObject({
      status: 200,
      json: { result: null, queries: [{ sql: 'SELECT 3', params: [] }] },
    })
  })

  it('says what is wrong with a module that is not a Prisma Client', async () => {
    const { call } = await setup({
      client: projectClient,
      arrange: (dir) => {
        const file = path.join(dir, 'generated', 'client', 'client.ts')
        writeFileSync(file, readFileSync(file, 'utf8').replace('$on(event', '$listen(event'))
      },
    })
    expect(await call('/api/client')).toMatchObject({
      json: {
        available: false,
        error:
          'generated/client does not export a Prisma Client with $on, $transaction and $disconnect.',
      },
    })
  })

  it('says to run prisma generate when the generator has written nothing yet', async () => {
    const { call, dir } = await setup({
      client: projectClient,
      arrange: (project) => {
        unlinkSync(path.join(project, 'generated', 'client', 'client.ts'))
      },
    })
    const { json } = await call('/api/client')
    expect(json).toMatchObject({
      available: false,
      error: expect.stringContaining('the Prisma Client at generated/client could not be loaded'),
      typescript: null,
      typesError: `No client.ts in ${path.join(dir, 'generated', 'client')}: run \`prisma generate\` so the client is written there.`,
    })
  })

  // A project without any typescript cannot be staged here: under the test runner the package's
  // own typescript@7 resolves from anywhere. The native compiler is the case that can.
  it('says why there is no TypeScript to ask when the project has only one without a language service', async () => {
    const native = await setup({
      client: projectClient,
      arrange: (dir) => {
        const typescript = path.join(dir, 'node_modules', 'typescript')
        unlinkSync(typescript)
        mkdirSync(typescript)
        writeFileSync(
          path.join(typescript, 'package.json'),
          JSON.stringify({
            name: 'typescript',
            version: '7.0.0',
            type: 'module',
            main: 'index.js',
          }),
        )
        writeFileSync(path.join(typescript, 'index.js'), "export const version = '7.0.0'\n")
      },
    })
    expect(await native.call('/api/client')).toMatchObject({
      json: {
        typescript: null,
        typesError:
          'Completion against the client types needs TypeScript 5 in the project (typescript@7 ships no language service API).\n   Install it with `npm install -D typescript@5`; the editor still completes model and field names from the schema.',
      },
    })
  })

  it('says why neither the client nor its types load while the schema does not parse', async () => {
    const { call } = await setup({
      client: projectClient,
      schema: SCHEMA.replace('email String @unique', 'email Nope @unique'),
    })
    expect(await call('/api/client')).toMatchObject({
      json: {
        available: false,
        error: expect.stringContaining('Type "Nope" is neither a built-in type'),
        typescript: null,
        typesError: expect.stringContaining('Type "Nope" is neither a built-in type'),
      },
    })
    expect(await call('/api/client/complete', { query: 'prisma.', offset: 7 })).toMatchObject({
      status: 503,
      json: { detail: expect.stringContaining('Type "Nope"') },
    })
  })

  it('answers with nothing where there is nothing to say: whitespace, outside a call, an unknown item', async () => {
    const { call } = await setup({ client: projectClient })
    expect(
      await call('/api/client/hover', { query: 'prisma.user.findMany({    })', offset: 24 }),
    ).toStrictEqual({ status: 200, json: { contents: null, range: null } })
    expect(await call('/api/client/signature', { query: 'prisma.user', offset: 11 })).toStrictEqual(
      {
        status: 200,
        json: { signatures: [], activeSignature: 0, activeParameter: 0 },
      },
    )
    expect(
      await call('/api/client/complete/detail', { query: 'prisma.', offset: 7, name: 'nope' }),
    ).toStrictEqual({ status: 200, json: { detail: null, documentation: null } })
  })

  it.each([
    ['/api/client/complete/detail', { query: 'prisma.', offset: 7, name: 'user' }],
    ['/api/client/hover', { query: 'prisma.user', offset: 3 }],
    ['/api/client/signature', { query: 'prisma.user.findMany(', offset: 21 }],
    ['/api/client/check', { query: 'prisma.user.findMany()' }],
  ])('answers %s with why there are no types, when there are none', async (url, body) => {
    const { call } = await setup({ client: () => unavailableClient() })
    expect(await call(url, body)).toStrictEqual({
      status: 503,
      json: {
        type: '/problems/service-unavailable',
        title: 'Service Unavailable',
        status: 503,
        detail:
          'Completion against the client types needs TypeScript 5 in the project (typescript@7 ships no language service API).\n   Install it with `npm install -D typescript@5`; the editor still completes model and field names from the schema.',
        instance: url,
      },
    })
  })

  it('lays the query out as the TypeScript formatter writes it, and reports a text it cannot read', async () => {
    const { call } = await setup({ client: () => unavailableClient() })
    expect(
      await call('/api/client/format', {
        query:
          'await prisma.user.findMany({where:{email:{contains:"a"}},include:{posts:true},take:10});',
      }),
    ).toStrictEqual({
      status: 200,
      json: {
        text: "await prisma.user.findMany({\n  where: { email: { contains: 'a' } },\n  include: { posts: true },\n  take: 10,\n})",
      },
    })
    expect(await call('/api/client/format', { query: 'prisma.user.findMany(' })).toMatchObject({
      status: 422,
      json: {
        type: '/problems/validation-failed',
        errors: [{ field: 'query', message: expect.stringMatching(/expected/iu) }],
      },
    })
  })

  it('refuses an empty text and a negative offset before reading anything', async () => {
    const { call } = await setup({ client: projectClient })
    expect(await call('/api/client/analyze', { query: '' })).toMatchObject({
      status: 422,
      json: { errors: [{ field: 'query', message: 'Query must not be empty' }] },
    })
    expect(await call('/api/client/complete', { query: 'prisma.', offset: -1 })).toMatchObject({
      status: 422,
      json: { errors: [{ field: 'offset', message: expect.any(String) }] },
    })
  })

  it('closes quietly when the client fails to disconnect', async () => {
    const { call, client } = await setup({
      client: projectClient,
      arrange: (dir) => {
        const file = path.join(dir, 'generated', 'client', 'client.ts')
        writeFileSync(
          file,
          readFileSync(file, 'utf8').replace(
            'this.disconnected = true',
            "throw new Error('the connection is already gone')",
          ),
        )
      },
    })
    expect(await call('/api/client')).toMatchObject({ json: { available: true } })
    await expect(Effect.runPromise(client.close)).resolves.toBeUndefined()
  })

  it('runs and completes against @prisma/client for the legacy prisma-client-js generator', async () => {
    const { call } = await setup({
      client: projectClient,
      schema: SCHEMA.replace(
        /generator client \{[^}]*\}/u,
        'generator client {\n  provider = "prisma-client-js"\n}',
      ),
      arrange: (dir) => {
        const legacy = path.join(dir, 'node_modules', '@prisma', 'client')
        mkdirSync(legacy, { recursive: true })
        writeFileSync(
          path.join(legacy, 'package.json'),
          JSON.stringify({
            name: '@prisma/client',
            type: 'module',
            main: 'index.js',
            types: 'index.d.ts',
          }),
        )
        writeFileSync(
          path.join(legacy, 'index.js'),
          `export class PrismaClient {
  constructor() { this.listeners = []; this.user = { count: () => ({ then: (resolve) => { for (const l of this.listeners) l({ query: 'SELECT 42', params: '[]', duration: 1 }); resolve(42) } }) } }
  $on(event, listener) { this.listeners.push(listener) }
  async $transaction(operations) { return Promise.all(operations) }
  async $disconnect() {}
}
`,
        )
        writeFileSync(
          path.join(legacy, 'index.d.ts'),
          'export declare class PrismaClient {\n  user: { count(args?: { where?: { id?: number } }): Promise<number> }\n}\n',
        )
      },
    })
    expect(await call('/api/client')).toMatchObject({
      json: {
        available: true,
        source: '@prisma/client',
        typescript: expect.stringMatching(/^5\./u),
      },
    })
    expect(await call('/api/client/run', { query: 'prisma.user.count()' })).toMatchObject({
      status: 200,
      json: { result: 42, queries: [{ sql: 'SELECT 42' }] },
    })
    const completions = await call('/api/client/complete', {
      query: 'prisma.user.count({ where: { ',
      offset: 29,
    })
    expect(completions.json).toMatchObject({ items: [{ label: 'id' }] })
  })
})
