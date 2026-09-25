// Prisma Client on the database the check binary left: every DateTime SeaORM wrote has to read
// back through Prisma as the instant it was, and be found by it, and what Prisma writes here is
// what `cargo run -- interop` reads through the entities. Each check prints `ok: <name>`, or stops
// with what it saw.
import { isDeepStrictEqual } from 'node:util'

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaPg } from '@prisma/adapter-pg'

import type { PrismaClient as Client } from './generated/client/client.ts'

// The database and the client of the binary's run: dev.db and generated/client, or the ones
// provider.ts made for SEA_ORM_DATABASE. The clients of every provider have one API.
const url = process.env.SEA_ORM_DATABASE
const { PrismaClient } = (await import(
  process.env.SEA_ORM_CLIENT ?? './generated/client/client.ts'
)) as { PrismaClient: typeof Client }
const provider = url?.startsWith('postgresql:')
  ? 'postgresql'
  : url?.startsWith('mysql:')
    ? 'mysql'
    : 'sqlite'
const adapter =
  url === undefined
    ? new PrismaBetterSqlite3({ url: 'file:./dev.db' })
    : provider === 'postgresql'
      ? new PrismaPg(url)
      : new PrismaMariaDb(url)
const prisma = new PrismaClient({ adapter })

async function check(name: string, body: () => Promise<readonly (string | null)[]>) {
  const problems = (await body()).filter((problem) => problem !== null)
  if (problems.length > 0) throw new Error(`${name}: ${problems.join(', ')}`)
  console.log(`ok: ${name}`)
}

function expect(got: unknown, want: unknown, label: string) {
  return isDeepStrictEqual(got, want)
    ? null
    : `${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`
}

const AT = new Date('2030-01-02T03:04:05.678Z')
const WHOLE = new Date('2030-01-02T03:04:05.000Z')
const HOUR = 3_600_000
// A date column holds the UTC date of an instant, a time column its UTC time on 1970-01-01.
const native = provider !== 'sqlite'

await check('Prisma Client reads the DateTimes SeaORM wrote', async () => {
  const author = await prisma.author.findUniqueOrThrow({
    where: { email: 'sea-orm@example.com' },
    include: { posts: { where: { publishedAt: { not: null } }, orderBy: { publishedAt: 'asc' } } },
  })
  const age = Date.now() - author.createdAt.getTime()
  return [
    expect(
      age >= 0 && age < 120_000,
      true,
      `now() SeaORM filled: ${author.createdAt.toISOString()}`,
    ),
    expect(author.updatedAt, author.createdAt, '@updatedAt beside now()'),
    expect(author.posts[0]?.publishedAt, AT, 'an optional DateTime'),
    expect(author.posts[0]?.releasedAt, new Date('2020-01-01T00:00:00Z'), 'the literal default'),
    expect(
      author.posts.map((post) => post.title),
      ['sooner!', 'later'],
      'sorted by publishedAt',
    ),
  ]
})

await check('Prisma Client finds what SeaORM wrote by the instant', async () => {
  const post = await prisma.post.findFirst({ where: { publishedAt: AT } })
  const ms = await prisma.reading.findUnique({
    where: { sensor_at: { sensor: 'sea-orm', at: AT } },
  })
  const second = await prisma.reading.findUnique({
    where: { sensor_at: { sensor: 'sea-orm', at: WHOLE } },
  })
  const booking = await prisma.booking.findUnique({ where: { startsAt: WHOLE } })
  const setting = await prisma.setting.findUniqueOrThrow({ where: { key: 'theme' } })
  return [
    expect(post?.title, 'sooner!', 'an optional DateTime'),
    expect(ms?.value, 1.5, 'a DateTime in @@id'),
    expect(second?.value, 1.5, 'a whole second in @@id'),
    expect(booking?.room, 'a', 'a @unique DateTime'),
    expect(
      [setting.syncedAt, setting.checkedAt],
      [setting.updatedAt, setting.updatedAt],
      '@updatedAt',
    ),
  ]
})

await check('Prisma Client reads each native type SeaORM wrote', async () => {
  const clock = await prisma.clock.findUniqueOrThrow({ where: { label: 'sea-orm' } })
  const age = Date.now() - clock.createdAt.getTime()
  return [
    expect(clock.at, AT, 'at'),
    expect(clock.precise, AT, 'precise, to the millisecond'),
    expect(clock.seconds, WHOLE, 'seconds'),
    expect(clock.zoned, AT, 'zoned'),
    expect(clock.day, native ? new Date('2030-01-02T00:00:00Z') : AT, 'day'),
    expect(clock.time, native ? new Date('1970-01-01T03:04:05.678Z') : AT, 'time'),
    'moments' in clock
      ? expect(clock.moments, [AT, new Date(AT.getTime() + 24 * HOUR)], 'moments')
      : null,
    expect(age >= 0 && age < 120_000, true, `createdAt: ${clock.createdAt.toISOString()}`),
  ]
})

// What the binary's interop reads back through the entities.
const author = await prisma.author.create({ data: { email: 'prisma@example.com' } })
await prisma.post.createMany({
  data: [
    { authorId: author.id, title: 'by prisma', publishedAt: AT },
    { authorId: author.id, title: 'earliest', publishedAt: new Date(AT.getTime() - HOUR) },
  ],
})
await prisma.setting.create({ data: { key: 'prisma', value: 'on' } })
await prisma.reading.createMany({
  data: [
    { sensor: 'prisma', at: AT, value: 2 },
    { sensor: 'prisma', at: WHOLE, value: 2 },
  ],
})
await prisma.booking.create({ data: { room: 'b', startsAt: new Date(WHOLE.getTime() + HOUR) } })
await prisma.clock.create({
  data: {
    label: 'prisma',
    at: AT,
    precise: AT,
    seconds: WHOLE,
    zoned: AT,
    day: AT,
    time: AT,
    ...(provider === 'postgresql' ? { moments: [AT, new Date(AT.getTime() + 24 * HOUR)] } : {}),
  },
})
console.log('ok: Prisma Client wrote the rows the entities read next')
await prisma.$disconnect()
