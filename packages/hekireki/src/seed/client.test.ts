import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { delegateName, isSeedClient, seedWithClient } from './client.js'
import { makeSeedPlan } from './plan.js'
import type { SeedTableRows } from './plan.js'

const SCHEMA = `
datasource db {
  provider = "postgresql"
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id       Int   @id @default(autoincrement())
  authorId Int
  author   User  @relation(fields: [authorId], references: [id])
  tags     Tag[]
}

model Tag {
  id    Int    @id @default(autoincrement())
  posts Post[]
}
`

function tables() {
  const result: DMMF.Document | GetDMMFError = getDMMF({ datamodel: [['schema.prisma', SCHEMA]] })
  if ('type' in result) throw new Error(result.error.message)
  return Effect.runSync(makeSeedPlan(result.datamodel))
}

const TABLES = tables()

function table(name: string) {
  const found = TABLES.find((t) => t.name === name)
  if (found === undefined) throw new Error(`no table ${name}`)
  return found
}

/** A Prisma Client stand-in: every write returns a description of itself, the transaction collects them. */
function fakeClient(models: readonly string[]) {
  const log: unknown[] = []
  const delegate = (model: string) => ({
    createMany: (args: { readonly data: readonly unknown[] }) => ({
      op: 'createMany',
      model,
      rows: args.data.length,
    }),
    deleteMany: () => ({ op: 'deleteMany', model }),
    update: (args: unknown) => ({ op: 'update', model, args }),
  })
  const client = {
    $transaction: (operations: readonly unknown[]) => {
      log.push(...operations)
      return Promise.resolve(operations)
    },
    $executeRawUnsafe: (sql: string) => ({ op: 'raw', sql }),
    $disconnect: () => {
      log.push('disconnect')
      return Promise.resolve()
    },
    ...Object.fromEntries(models.map((model) => [delegateName(model), delegate(model)])),
  }
  return { client, log }
}

const ENTRIES: readonly SeedTableRows[] = [
  {
    table: table('User'),
    rows: [
      { id: 1, email: 'a@example.com' },
      { id: 2, email: 'b@example.com' },
    ],
  },
  { table: table('Post'), rows: [{ id: 1, authorId: 2 }] },
  { table: table('Tag'), rows: [{ id: 1 }, { id: 2 }] },
  {
    table: table('_PostToTag'),
    rows: [
      { A: 1, B: 2 },
      { A: 1, B: 1 },
    ],
  },
]

describe('delegateName', () => {
  it('lower-cases the first letter, as Prisma Client names its delegates', () => {
    expect(delegateName('User')).toBe('user')
    expect(delegateName('OrderItem')).toBe('orderItem')
    expect(delegateName('order_line_item')).toBe('order_line_item')
  })
})

describe('isSeedClient', () => {
  it('asks for a transaction, raw SQL and disconnect', () => {
    expect(isSeedClient(fakeClient([]).client)).toBe(true)
    expect(isSeedClient({ $transaction: () => Promise.resolve() })).toBe(false)
    expect(isSeedClient(null)).toBe(false)
  })
})

describe('seedWithClient', () => {
  it('runs the reset, the creates, the connects and the sequence fix-ups in one transaction, then disconnects', async () => {
    const { client, log } = fakeClient(['User', 'Post', 'Tag'])
    const exit = await Effect.runPromiseExit(
      seedWithClient({ client, entries: ENTRIES, reset: true, dialect: 'postgresql' }),
    )
    expect(exit).toStrictEqual(Exit.succeed({ models: 3, operations: 3 + 3 + 1 }))
    expect(log).toStrictEqual([
      { op: 'deleteMany', model: 'Tag' },
      { op: 'deleteMany', model: 'Post' },
      { op: 'deleteMany', model: 'User' },
      { op: 'createMany', model: 'User', rows: 2 },
      { op: 'createMany', model: 'Post', rows: 1 },
      { op: 'createMany', model: 'Tag', rows: 2 },
      {
        op: 'update',
        model: 'Post',
        args: { where: { id: 1 }, data: { tags: { connect: [{ id: 2 }, { id: 1 }] } } },
      },
      {
        op: 'raw',
        sql: `SELECT setval(pg_get_serial_sequence('"User"', 'id'), COALESCE((SELECT MAX("id") FROM "User"), 0) + 1, false)`,
      },
      {
        op: 'raw',
        sql: `SELECT setval(pg_get_serial_sequence('"Post"', 'id'), COALESCE((SELECT MAX("id") FROM "Post"), 0) + 1, false)`,
      },
      {
        op: 'raw',
        sql: `SELECT setval(pg_get_serial_sequence('"Tag"', 'id'), COALESCE((SELECT MAX("id") FROM "Tag"), 0) + 1, false)`,
      },
      'disconnect',
    ])
  })

  it('skips the reset and the sequences when not asked for them', async () => {
    const { client, log } = fakeClient(['User', 'Post', 'Tag'])
    await Effect.runPromise(
      seedWithClient({ client, entries: ENTRIES, reset: false, dialect: 'sqlite' }),
    )
    expect(
      log.map((entry) =>
        typeof entry === 'object' && entry !== null && 'op' in entry ? entry.op : entry,
      ),
    ).toStrictEqual(['createMany', 'createMany', 'createMany', 'update', 'disconnect'])
  })

  it('names a model the client does not know, and a client that is not one', async () => {
    const { client } = fakeClient(['User', 'Post'])
    const missing = await Effect.runPromiseExit(
      seedWithClient({ client, entries: ENTRIES, reset: false, dialect: null }),
    )
    expect(String(missing)).toContain(
      'The Prisma Client has no model delegate `tag` with createMany, deleteMany and update.',
    )
    const notOne = await Effect.runPromiseExit(
      seedWithClient({ client: {}, entries: ENTRIES, reset: false, dialect: null }),
    )
    expect(String(notOne)).toContain('`client` must return a Prisma Client')
  })

  it('reports what the transaction threw and still disconnects', async () => {
    const { client, log } = fakeClient(['User', 'Post', 'Tag'])
    const failing = {
      ...client,
      $transaction: () =>
        Promise.reject(new Error('Unique constraint failed on the fields: (`email`)')),
    }
    const exit = await Effect.runPromiseExit(
      seedWithClient({ client: failing, entries: ENTRIES, reset: false, dialect: null }),
    )
    expect(String(exit)).toContain('Unique constraint failed on the fields: (`email`)')
    expect(log.at(-1)).toBe('disconnect')
  })
})

describe('seedWithClient, the edges', () => {
  it('splits createMany at 500 rows, and skips a model without rows', async () => {
    const { client, log } = fakeClient(['User', 'Post', 'Tag'])
    const rows = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, email: `${i}@example.com` }))
    const exit = await Effect.runPromiseExit(
      seedWithClient({
        client,
        entries: [
          { table: table('User'), rows },
          { table: table('Post'), rows: [] },
          { table: table('Tag'), rows: Array.from({ length: 500 }, (_, i) => ({ id: i + 1 })) },
        ],
        reset: false,
        dialect: 'mysql',
      }),
    )
    expect(exit).toStrictEqual(Exit.succeed({ models: 3, operations: 3 }))
    expect(log).toStrictEqual([
      { op: 'createMany', model: 'User', rows: 500 },
      { op: 'createMany', model: 'User', rows: 1 },
      { op: 'createMany', model: 'Tag', rows: 500 },
      'disconnect',
    ])
  })

  it('hands createMany the rows as they are, values untouched, and connects by the partner ids', async () => {
    const received: unknown[] = []
    const { client } = fakeClient([])
    const recording = {
      ...client,
      user: {
        createMany: (args: { readonly data: readonly unknown[] }) => {
          received.push(args.data)
          return 'create-user'
        },
        deleteMany: () => 'delete-user',
        update: () => 'update-user',
      },
      post: {
        createMany: () => 'create-post',
        deleteMany: () => 'delete-post',
        update: (args: unknown) => ({ update: args }),
      },
      tag: { createMany: () => 'create-tag', deleteMany: () => 'delete-tag', update: () => 'x' },
    }
    const when = new Date('2025-01-01T00:00:00.000Z')
    const bytes = Uint8Array.from([1])
    const exit = await Effect.runPromiseExit(
      seedWithClient({
        client: recording,
        entries: [
          { table: table('User'), rows: [{ id: 1, email: 'a@example.com', when, bytes, n: 5n }] },
          { table: table('Post'), rows: [{ id: 1, authorId: 1 }] },
          { table: table('Tag'), rows: [{ id: 1 }, { id: 2 }] },
          {
            table: table('_PostToTag'),
            rows: [
              { A: 1, B: 2 },
              { A: 1, B: 1 },
            ],
          },
        ],
        reset: true,
        dialect: 'sqlite',
      }),
    )
    expect(exit).toStrictEqual(Exit.succeed({ models: 3, operations: 3 + 3 + 1 }))
    expect(received).toStrictEqual([[{ id: 1, email: 'a@example.com', when, bytes, n: 5n }]])
    const transaction = await recording.$transaction([])
    expect(transaction).toStrictEqual([])
  })

  it('groups the links of one row into a single connect, in the order the pairs came', async () => {
    const { client, log } = fakeClient(['User', 'Post', 'Tag'])
    await Effect.runPromise(
      seedWithClient({
        client,
        entries: [
          // The connects go through the owning model's delegate, so that model must be seeded too.
          { table: table('Post'), rows: [] },
          {
            table: table('_PostToTag'),
            rows: [
              { A: 1, B: 3 },
              { A: 2, B: 1 },
              { A: 1, B: 1 },
            ],
          },
        ],
        reset: false,
        dialect: null,
      }),
    )
    expect(log).toStrictEqual([
      {
        op: 'update',
        model: 'Post',
        args: { where: { id: 1 }, data: { tags: { connect: [{ id: 3 }, { id: 1 }] } } },
      },
      {
        op: 'update',
        model: 'Post',
        args: { where: { id: 2 }, data: { tags: { connect: [{ id: 1 }] } } },
      },
      'disconnect',
    ])
  })

  it('runs no sequence fix-ups without a dialect, and reports only the model operations', async () => {
    const { client, log } = fakeClient(['User'])
    const exit = await Effect.runPromiseExit(
      seedWithClient({
        client,
        entries: [{ table: table('User'), rows: [{ id: 1, email: 'a@example.com' }] }],
        reset: true,
        dialect: null,
      }),
    )
    expect(exit).toStrictEqual(Exit.succeed({ models: 1, operations: 2 }))
    expect(log).toStrictEqual([
      { op: 'deleteMany', model: 'User' },
      { op: 'createMany', model: 'User', rows: 1 },
      'disconnect',
    ])
  })

  it.each<[unknown, string]>([
    [null, 'null'],
    [3, 'a number'],
    [{}, 'an empty object'],
    [{ $transaction: () => 1, $executeRawUnsafe: () => 1 }, 'a client without $disconnect'],
    [{ $transaction: () => 1, $disconnect: () => 1 }, 'a client without $executeRawUnsafe'],
    [
      { $transaction: 'x', $executeRawUnsafe: () => 1, $disconnect: () => 1 },
      'a non-function member',
    ],
  ])('refuses %s (%s) as a client', async (value) => {
    expect(isSeedClient(value)).toBe(false)
    const exit = await Effect.runPromiseExit(
      seedWithClient({ client: value, entries: [], reset: false, dialect: null }).pipe(Effect.flip),
    )
    expect(Exit.isSuccess(exit) ? exit.value.message : '').toBe(
      '`client` must return a Prisma Client: an object with $transaction, $executeRawUnsafe and $disconnect.\n   Write `client: () => new PrismaClient({ adapter })` in hekireki.config.ts.',
    )
  })

  it('names the first delegate that is missing or incomplete, before any write', async () => {
    const { client, log } = fakeClient(['User'])
    const incomplete = { ...client, post: { createMany: () => 1 } }
    const exit = await Effect.runPromiseExit(
      seedWithClient({
        client: incomplete,
        entries: [
          { table: table('User'), rows: [{ id: 1, email: 'a@example.com' }] },
          { table: table('Post'), rows: [] },
        ],
        reset: false,
        dialect: null,
      }).pipe(Effect.flip),
    )
    expect(Exit.isSuccess(exit) ? exit.value.message : '').toBe(
      'The Prisma Client has no model delegate `post` with createMany, deleteMany and update.\n   Run `prisma generate` so the client knows Post.',
    )
    expect(log).toStrictEqual([])
  })

  it('reports the transaction failure and survives a failing disconnect', async () => {
    const { client } = fakeClient(['User'])
    const failing = {
      ...client,
      $transaction: () => Promise.reject(new Error('unique constraint')),
      $disconnect: () => Promise.reject(new Error('already closed')),
    }
    const exit = await Effect.runPromiseExit(
      seedWithClient({
        client: failing,
        entries: [{ table: table('User'), rows: [{ id: 1, email: 'a@example.com' }] }],
        reset: false,
        dialect: null,
      }).pipe(Effect.flip),
    )
    expect(Exit.isSuccess(exit) ? exit.value.message : '').toBe('unique constraint')
  })
})

describe('delegateName, the edges', () => {
  it.each([
    ['User', 'user'],
    ['OrderItem', 'orderItem'],
    ['URLThing', 'uRLThing'],
    ['A', 'a'],
    ['user', 'user'],
    ['_Private', '_Private'],
  ])('%s → %s', (model, delegate) => {
    expect(delegateName(model)).toBe(delegate)
  })
})
