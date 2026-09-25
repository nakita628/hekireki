// Prisma Client on the database check.php left: what Eloquent wrote has to read back through
// Prisma as it was meant, and what Prisma writes here is what interop.php reads through the
// generated models. Each check prints `ok: <name>`, or stops with what it saw.
import { isDeepStrictEqual } from 'node:util'

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

import { PrismaClient } from './generated/client/client.ts'

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: 'file:./dev.db' }) })

async function check(name: string, body: () => Promise<readonly (string | null)[]>) {
  const problems = (await body()).filter((problem) => problem !== null)
  if (problems.length > 0) throw new Error(`${name}: ${problems.join(', ')}`)
  console.log(`ok: ${name}`)
}

function expect(got: unknown, want: unknown, label: string) {
  return isDeepStrictEqual(got, want)
    ? null
    : `${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got, (_, v) => (typeof v === 'bigint' ? `${v}n` : v))}`
}

await check('Prisma Client reads each type Eloquent wrote', async () => {
  const product = await prisma.product.findFirstOrThrow({ where: { sku: 'TYPES' } })
  const profile = await prisma.profile.findFirstOrThrow({
    where: { account: { handle: 'types' } },
  })
  return [
    expect(product.price.toString(), '12.34', 'Decimal'),
    expect(product.barcode, 2n ** 53n + 1n, 'BigInt beyond 2^53'),
    expect(product.attributes, { nested: { list: [1, 'two', null] }, flag: true }, 'Json'),
    expect(product.releasedAt.toISOString(), '2021-02-03T04:05:06.000Z', 'DateTime'),
    expect(product.label, 'it\'s "quoted" \\ back', 'a default Eloquent carried'),
    expect(product.createdAt instanceof Date, true, 'a timestamp Eloquent filled'),
    expect([...(profile.avatar ?? [])], [0, 255, 80, 78, 71, 10], 'Bytes, a BLOB'),
    expect(profile.mood, 'FINE', "an enum value with an apostrophe, it's fine"),
  ]
})

await check('Prisma Client reads the keys and enums Eloquent made', async () => {
  const tag = await prisma.tag.findFirstOrThrow({ where: { name: 'keys' } })
  const staff = await prisma.account.findFirstOrThrow({ where: { handle: 'staff' } })
  const order = await prisma.order.findFirstOrThrow({ where: { status: 'PAID' } })
  return [
    expect(/^[0-9A-Z]{26}$/u.test(tag.id), true, `a ULID in upper case: ${tag.id}`),
    expect(staff.role, 'STAFF', 'an enum stored as its @map value'),
    expect(order.accountId, staff.id, 'an order under a key named order_number'),
  ]
})

// Rows Prisma writes for interop.php, the join tables through Prisma's own connect.
const alice = await prisma.account.create({
  data: { emailAddress: 'alice.prisma@example.com', handle: 'alice.prisma', role: 'ADMIN' },
})
const bob = await prisma.account.create({
  data: {
    emailAddress: 'bob.prisma@example.com',
    handle: 'bob.prisma',
    following: { connect: { id: alice.id } },
    profile: { create: { avatar: new Uint8Array([0, 1, 2, 255]), mood: 'SO_SO' } },
  },
})
const tag = await prisma.tag.create({ data: { name: 'prisma' } })
const product = await prisma.product.create({
  data: {
    sku: 'PRISMA',
    name: 'Made by Prisma',
    price: '1.10',
    barcode: 2n ** 53n + 3n,
    attributes: { from: ['prisma'] },
    releasedAt: new Date('2022-03-04T05:06:07.890Z'),
    tags: { connect: { id: tag.id } },
  },
})
await prisma.wishlist.create({
  data: { accountId: bob.id, products: { connect: { id: product.id } } },
})

await check('Prisma Client writes the rows interop.php reads', async () => [
  expect(/^[0-9A-Z]{26}$/u.test(tag.id), true, `a ULID Prisma made: ${tag.id}`),
  expect(bob.handle, 'bob.prisma', 'bob follows alice'),
])

await prisma.$disconnect()
