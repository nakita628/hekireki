// The generated drizzle schema against Prisma Client on the SQLite database `prisma db push` made
// from schema.prisma: a row drizzle writes is the row Prisma would have written, and each reads
// the other's as the same instant. `demo` runs it in a process whose zone is not UTC. Each check
// prints `ok: <name>`, or throws with what it saw instead.
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import { PrismaClient } from './generated/client/client.ts'
import { events } from './src/db/schema.ts'

const file = new URL('dev.db', import.meta.url).pathname
const connection = new Database(file)
const db = drizzle(connection)
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}` }) })

function check(name: string, problem: string | undefined) {
  if (problem !== undefined) throw new Error(`${name}: ${problem}`)
  console.log(`ok: ${name}`)
}

const at = new Date('2030-01-02T03:04:05.678Z')
const since = '2020-01-01T00:00:00.000Z'

await prisma.event.deleteMany()
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

// SQLite compares the text: the same instant has to be the same characters.
const stored = connection.prepare('SELECT at FROM events ORDER BY id').pluck().all()
check(
  'both store Prisma’s text',
  stored.every((text) => text === '2030-01-02T03:04:05.678+00:00')
    ? undefined
    : `stored ${stored.join(', ')}`,
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
  read.since.toISOString() === since ? undefined : `since is ${read.since.toISOString()}`,
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

await prisma.$disconnect()
connection.close()
