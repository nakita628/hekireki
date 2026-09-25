// Prisma Client on the database check.py left: every DateTime Django wrote has to read back
// through Prisma as the instant it was, and be found by it, and what Prisma writes here is what
// interop.py reads through the generated models. Each check prints `ok: <name>`, or stops with
// what it saw.
import { isDeepStrictEqual } from 'node:util'

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaPg } from '@prisma/adapter-pg'

import type { PrismaClient as Client } from './generated/client/client.ts'

// The database and the client of check.py's run: dev.db and generated/client, or the ones
// provider.ts made for DJANGO_DATABASE. The clients of every provider have one API.
const url = process.env.DJANGO_DATABASE
const { PrismaClient } = (await import(
  process.env.DJANGO_CLIENT ?? './generated/client/client.ts'
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
// A date column holds the UTC date of an instant, a time column its UTC time on 1970-01-01.
const native = provider !== 'sqlite'

await check('Prisma Client reads the DateTimes Django wrote', async () => {
  const author = await prisma.author.findUniqueOrThrow({
    where: { email: 'django@example.com' },
    include: { posts: { orderBy: { publishedAt: 'asc' } } },
  })
  const sooner = author.posts.find((post) => post.title === 'sooner')
  const age = Date.now() - author.createdAt.getTime()
  return [
    expect(
      age >= 0 && age < 120_000,
      true,
      `now() Django filled: ${author.createdAt.toISOString()}`,
    ),
    expect(sooner?.publishedAt?.toISOString(), AT.toISOString(), 'an optional DateTime'),
    expect(sooner?.embargo.toISOString(), '2020-01-01T00:00:00.000Z', 'the literal default'),
    expect(
      author.posts.filter((post) => post.publishedAt !== null).map((post) => post.title),
      ['sooner', 'later'],
      'sorted by publishedAt',
    ),
  ]
})

await check('Prisma Client finds what Django wrote by the instant', async () => {
  const visit = await prisma.visit.findUnique({ where: { path_at: { path: '/django', at: AT } } })
  const post = await prisma.post.findFirst({ where: { publishedAt: AT } })
  const clock = await prisma.clock.findFirst({
    where: { at: AT, zoned: AT, seconds: new Date('2030-01-02T03:04:05Z') },
  })
  return [
    expect(visit?.note, 'by Django', 'a DateTime in @@id'),
    expect(post?.title, 'sooner', 'an optional DateTime'),
    expect(clock?.label, 'django', 'native types'),
  ]
})

await check('Prisma Client reads each native type Django wrote', async () => {
  const clock = await prisma.clock.findUniqueOrThrow({ where: { label: 'django' } })
  const iso = (value: Date | null) => value?.toISOString()
  return [
    expect(iso(clock.at), AT.toISOString(), 'at'),
    // A JavaScript Date has milliseconds: Prisma reads a TIMESTAMP(6) to them.
    expect(iso(clock.precise), AT.toISOString(), 'precise'),
    expect(iso(clock.seconds), '2030-01-02T03:04:05.000Z', 'seconds'),
    expect(iso(clock.zoned), AT.toISOString(), 'zoned'),
    expect(iso(clock.day), native ? '2030-01-02T00:00:00.000Z' : AT.toISOString(), 'day'),
    expect(iso(clock.time), native ? '1970-01-01T03:04:05.678Z' : AT.toISOString(), 'time'),
    expect(
      iso(clock.zonedTime),
      provider === 'postgresql' ? '1970-01-01T03:04:05.678Z' : AT.toISOString(),
      'zonedTime',
    ),
    ...(provider === 'postgresql'
      ? [
          expect(
            (clock as { moments?: Date[] }).moments?.map((moment) => moment.toISOString()),
            [AT.toISOString(), '2030-01-02T03:04:06.678Z'],
            'moments',
          ),
        ]
      : []),
  ]
})

// Rows Prisma writes for interop.py, at an instant of its own.
const BY_PRISMA = new Date('2031-05-06T07:08:09.123Z')
const author = await prisma.author.create({
  data: {
    email: 'prisma@example.com',
    posts: { create: { title: 'by Prisma', publishedAt: BY_PRISMA, status: 'PUBLISHED' } },
  },
})
await prisma.visit.create({ data: { path: '/prisma', at: BY_PRISMA, note: 'by Prisma' } })
await prisma.clock.create({
  data: {
    label: 'prisma',
    at: BY_PRISMA,
    precise: BY_PRISMA,
    seconds: new Date('2031-05-06T07:08:09Z'),
    zoned: BY_PRISMA,
    day: BY_PRISMA,
    time: BY_PRISMA,
    zonedTime: BY_PRISMA,
    ...(provider === 'postgresql' ? { moments: [BY_PRISMA] } : {}),
  },
})

await check('Prisma Client writes the rows interop.py reads', async () => [
  expect(author.email, 'prisma@example.com', 'an author with a post'),
])

await prisma.$disconnect()
