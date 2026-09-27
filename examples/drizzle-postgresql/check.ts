// The date columns of the drizzle schema generated for PostgreSQL, against Prisma Client on the
// tables `prisma db push` made from schema.prisma: `timestamp`, `timestamptz`, and the generated
// `utcDate`, `utcTime` and `utcTimetz`. A row drizzle writes holds what the row Prisma writes
// holds, column by column as PostgreSQL prints them, and each client reads both as the same
// values. `verify` runs it in UTC and in a process that is not. Each check prints `ok: <name>`, or
// throws with what it saw instead.
import { PrismaPg } from '@prisma/adapter-pg'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import { PrismaClient } from './generated/client/client.ts'
import { moments } from './src/db/schema.ts'

const url =
  process.env.DRIZZLE_DATABASE ?? 'postgresql://postgres:postgres@localhost:5432/drizzle_dates'
// A `CURRENT_TIMESTAMP` in a column without a zone is the session's wall clock: the session is UTC.
const pool = new pg.Pool({ connectionString: url, options: '-c TimeZone=UTC' })
const db = drizzle(pool)
const prisma = new PrismaClient({ adapter: new PrismaPg(url) })

function check(name: string, problem: string | undefined) {
  if (problem !== undefined) throw new Error(`${name}: ${problem}`)
  console.log(`ok: ${name}`)
}

console.log(`\n# TZ=${new Intl.DateTimeFormat().resolvedOptions().timeZone}`)

const at = new Date('2030-01-02T03:04:05.678Z')
// 23:30 UTC, which is the day after in any zone east of UTC+00:30: the date kept is UTC's.
const late = new Date('2030-01-02T23:30:00.000Z')
const moment = {
  at,
  precise: at,
  whole: at,
  zoned: at,
  day: at,
  dayOpt: late,
  opensAt: at,
  zonedTime: at,
  moments: [at, late],
  days: [at, late],
}

await prisma.moment.deleteMany()
const before = Date.now()
await db.insert(moments).values({ name: 'drizzle', ...moment })
await prisma.moment.create({ data: { name: 'prisma', ...moment } })

// What the table holds, as PostgreSQL prints it in a session in UTC.
const held = [
  ['at', '2030-01-02 03:04:05.678'],
  ['precise', '2030-01-02 03:04:05.678'],
  ['whole', '2030-01-02 03:04:06'],
  ['zoned', '2030-01-02 03:04:05.678+00'],
  ['day', '2030-01-02'],
  ['day_opt', '2030-01-02'],
  ['opens_at', '03:04:05.678'],
  ['zoned_time', '03:04:05.678+00'],
  ['moments', '{"2030-01-02 03:04:05.678","2030-01-02 23:30:00"}'],
  ['days', '{2030-01-02,2030-01-02}'],
  ['launch', '2024-01-15'],
  ['bell', '10:30:00'],
] as const
const { rows } = await pool.query<{ [column: string]: string }>(
  `SELECT name, today::text, ${held.map(([column]) => `${column}::text`).join(', ')} FROM moments ORDER BY name`,
)
for (const [column, text] of held) {
  check(
    `${column} holds ${text}, from drizzle and from Prisma`,
    rows.length === 2 && rows.every((row) => row[column] === text)
      ? undefined
      : rows.map((row) => `${row.name} ${row[column]}`).join(', '),
  )
}
check(
  '@default(now()) on a date is today in UTC, from both',
  rows.every((row) => row.today === new Date().toISOString().slice(0, 10))
    ? undefined
    : rows.map((row) => `${row.name} ${row.today}`).join(', '),
)

// Every column as Prisma Client gives it: a date at midnight UTC, a time of day on 1970-01-01.
const read = [
  '2030-01-02T03:04:05.678Z',
  '2030-01-02T03:04:05.678Z',
  '2030-01-02T03:04:06.000Z',
  '2030-01-02T03:04:05.678Z',
  '2030-01-02T00:00:00.000Z',
  '2030-01-02T00:00:00.000Z',
  '1970-01-01T03:04:05.678Z',
  '1970-01-01T03:04:05.678Z',
  '2030-01-02T03:04:05.678Z|2030-01-02T23:30:00.000Z',
  '2030-01-02T00:00:00.000Z|2030-01-02T00:00:00.000Z',
  '2024-01-15T00:00:00.000Z',
  '1970-01-01T10:30:00.000Z',
].join(' ')
// Prisma Client's rows have the fields drizzle's have, a list being null in drizzle's where the
// column is, and are read as those here.
const byPrisma: (typeof moments.$inferSelect)[] = await prisma.moment.findMany({
  orderBy: { name: 'asc' },
})
const byDrizzle = await db.select().from(moments).orderBy(moments.name)
for (const { client, row } of [
  ...byPrisma.map((row) => ({ client: 'Prisma', row })),
  ...byDrizzle.map((row) => ({ client: 'drizzle', row })),
]) {
  const text = [
    row.at.toISOString(),
    row.precise.toISOString(),
    row.whole.toISOString(),
    row.zoned.toISOString(),
    row.day.toISOString(),
    row.dayOpt?.toISOString(),
    row.opensAt.toISOString(),
    row.zonedTime.toISOString(),
    row.moments?.map((value) => value.toISOString()).join('|'),
    row.days?.map((value) => value.toISOString()).join('|'),
    row.launch.toISOString(),
    row.bell.toISOString(),
  ].join(' ')
  check(`${client} reads the row ${row.name} wrote`, text === read ? undefined : text)
}

for (const [column, condition] of [
  ['day', eq(moments.day, at)],
  ['day_opt', eq(moments.dayOpt, late)],
  ['opens_at', eq(moments.opensAt, at)],
  ['zoned_time', eq(moments.zonedTime, at)],
  ['zoned', eq(moments.zoned, at)],
] as const) {
  const found = await db.select({ name: moments.name }).from(moments).where(condition)
  check(
    `an = on ${column} from drizzle finds both rows`,
    found.length === 2 ? undefined : `found ${found.map((row) => row.name).join(', ')}`,
  )
}
const onDay: { name: string }[] = await prisma.moment.findMany({
  where: { day: at, opensAt: at, zonedTime: at },
})
check(
  'an = on the date and the times from Prisma finds both rows',
  onDay.length === 2 ? undefined : `found ${onDay.map((row) => row.name).join(', ')}`,
)

const [written] = byPrisma.filter((row) => row.name === 'drizzle')
if (written === undefined) throw new Error('drizzle inserted no row')
check(
  '@default(now()) and @updatedAt are one instant, now',
  written.updatedAt.getTime() >= before &&
    written.updatedAt.getTime() <= Date.now() &&
    Math.abs(written.createdAt.getTime() - written.updatedAt.getTime()) <= 1
    ? undefined
    : `created ${written.createdAt.toISOString()}, updated ${written.updatedAt.toISOString()}`,
)
await new Promise((resolve) => setTimeout(resolve, 5))
await db.update(moments).set({ dayOpt: null }).where(eq(moments.name, 'drizzle'))
const updated = await prisma.moment.findUniqueOrThrow({ where: { name: 'drizzle' } })
check(
  'a drizzle update empties the date and moves @updatedAt',
  updated.dayOpt === null && updated.updatedAt > written.updatedAt
    ? undefined
    : `dayOpt ${updated.dayOpt?.toISOString()}, updated ${updated.updatedAt.toISOString()}`,
)

await prisma.$disconnect()
await pool.end()
