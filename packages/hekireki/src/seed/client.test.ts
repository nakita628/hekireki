import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { delegateName, isSeedClient, seedWithClient } from './client.js'
import type { SeedTableRows } from './generate.js'
import { makeSeedPlan } from './plan.js'

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
