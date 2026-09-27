// The drizzle schema generated for PostgreSQL against Prisma Client on the tables `prisma db push`
// made from .provider/postgresql/schema.prisma (`pnpm run demo:postgresql` writes both): a row
// drizzle writes is the row Prisma would have written, and each reads the other's as the same
// value. provider.ts runs it in each time zone of zones.ts. Each check prints `ok: <name>`, or
// throws with what it saw instead.
import { PrismaPg } from '@prisma/adapter-pg'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import { PrismaClient } from './.provider/postgresql/generated/client/client.ts'
import { events, slots } from './.provider/postgresql/src/db/schema.ts'

const url = process.env.DRIZZLE_DATABASE ?? 'postgresql://postgres:postgres@localhost:5432/drizzle'
// A `CURRENT_TIMESTAMP` in a column without a zone is the session's wall clock: the session is UTC.
const pool = new pg.Pool({ connectionString: url, options: '-c TimeZone=UTC' })
const db = drizzle(pool)
const prisma = new PrismaClient({ adapter: new PrismaPg(url) })

function check(name: string, problem: string | undefined) {
  if (problem !== undefined) throw new Error(`${name}: ${problem}`)
  console.log(`ok: ${name}`)
}

const at = new Date('2030-01-02T03:04:05.678Z')
// A date is its UTC day at midnight, and a time of day is on 1970-01-01, as Prisma Client has them.
const slot = {
  day: new Date('2030-01-02T00:00:00.000Z'),
  opensAt: new Date('1970-01-01T03:04:05.678Z'),
  precise: at,
  zoned: at,
  zonedTime: new Date('1970-01-01T03:04:05.678Z'),
  moments: [at, new Date('2031-02-03T04:05:06.789Z')],
  payload: new Uint8Array([0, 1, 255, 128, 65]),
  // Past 2^53, where a number would round it.
  count: 9007199254740993n,
}
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')
// Every column as text, so that two rows are compared as what they hold. A list is a nullable
// column in the table Prisma makes, and so in drizzle.
const text = (
  row: typeof slots.$inferSelect | Awaited<ReturnType<typeof prisma.slot.findFirst>>,
) =>
  row === null
    ? 'no row'
    : [
        row.day.toISOString(),
        row.opensAt.toISOString(),
        row.precise.toISOString(),
        row.zoned.toISOString(),
        row.zonedTime.toISOString(),
        (row.moments ?? []).map((moment) => moment.toISOString()).join('|'),
        hex(row.payload),
        hex(row.digest),
        row.count,
        Number(row.price).toFixed(2),
      ].join(' ')
const expected = `2030-01-02T00:00:00.000Z 1970-01-01T03:04:05.678Z 2030-01-02T03:04:05.678Z 2030-01-02T03:04:05.678Z 1970-01-01T03:04:05.678Z 2030-01-02T03:04:05.678Z|2031-02-03T04:05:06.789Z 0001ff8041 0001ff 9007199254740993 12.34`

await prisma.event.deleteMany()
await prisma.slot.deleteMany()
const before = Date.now()
const [written] = await db
  .insert(events)
  .values({ title: 'drizzle', at })
  .returning({ id: events.id })
const created = await prisma.event.create({ data: { title: 'prisma', at } })
if (written === undefined) throw new Error('drizzle inserted no row')

const read = await prisma.event.findUniqueOrThrow({ where: { id: written.id } })
check(
  'Prisma reads what drizzle wrote',
  read.at.toISOString() === at.toISOString() ? undefined : `at is ${read.at.toISOString()}`,
)
const [back] = await db.select().from(events).where(eq(events.id, created.id))
check(
  'drizzle reads what Prisma wrote',
  back?.at.toISOString() === at.toISOString() ? undefined : `at is ${back?.at.toISOString()}`,
)
const found = await db.select({ title: events.title }).from(events).where(eq(events.at, at))
check(
  'an = from drizzle finds both rows',
  found.length === 2 ? undefined : `found ${found.map((row) => row.title).join(', ')}`,
)
check(
  '@default(now()) and @updatedAt are one instant, now',
  read.createdAt.getTime() >= before &&
    read.createdAt.getTime() <= Date.now() &&
    read.updatedAt.getTime() === read.createdAt.getTime() &&
    read.syncedAt.getTime() === read.createdAt.getTime()
    ? undefined
    : `created ${read.createdAt.toISOString()}, updated ${read.updatedAt.toISOString()}, synced ${read.syncedAt.toISOString()}`,
)
check(
  '@default("2020-01-01T00:00:00Z") on a drizzle insert',
  read.since.toISOString() === '2020-01-01T00:00:00.000Z'
    ? undefined
    : `since is ${read.since.toISOString()}`,
)

await new Promise((resolve) => setTimeout(resolve, 5))
await db.update(events).set({ title: 'drizzle, renamed' }).where(eq(events.id, written.id))
const updated = await prisma.event.findUniqueOrThrow({ where: { id: written.id } })
check(
  '@updatedAt moves on a drizzle update, @default(now()) does not',
  updated.updatedAt > read.updatedAt &&
    updated.syncedAt > read.syncedAt &&
    updated.createdAt.getTime() === read.createdAt.getTime()
    ? undefined
    : `updated ${updated.updatedAt.toISOString()}, created ${updated.createdAt.toISOString()}`,
)

// Native dates and times, Bytes, BigInt and Decimal, each way and each by its own client.
await db.insert(slots).values({ name: 'drizzle', ...slot, price: '12.34' })
await prisma.slot.create({ data: { name: 'prisma', ...slot, price: '12.34' } })
const fromDrizzle = await prisma.slot.findUnique({ where: { name: 'drizzle' } })
check(
  'Prisma reads the slot drizzle wrote',
  text(fromDrizzle) === expected ? undefined : text(fromDrizzle),
)
const [fromPrisma] = await db.select().from(slots).where(eq(slots.name, 'prisma'))
check(
  'drizzle reads the slot Prisma wrote',
  fromPrisma !== undefined && text(fromPrisma) === expected ? undefined : text(fromPrisma ?? null),
)
const same = await db
  .select({ name: slots.name })
  .from(slots)
  .where(eq(slots.payload, slot.payload))
check(
  'an = on the bytes from drizzle finds both slots',
  same.length === 2 ? undefined : `found ${same.map((row) => row.name).join(', ')}`,
)

await prisma.$disconnect()
await pool.end()
