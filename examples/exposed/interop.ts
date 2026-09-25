// Prisma Client on the rows Check.kt's `seed` left: every DateTime Exposed wrote has to read back
// through Prisma as the instant it was and be found by it, and what Prisma writes here is what
// Check.kt's `read` reads through the generated tables. Each check prints `ok: <name>`, or stops
// with what it saw.
import { isDeepStrictEqual } from 'node:util'

import { PrismaPg } from '@prisma/adapter-pg'

import { type Prisma, PrismaClient } from './generated/client/client.ts'

const url = process.env.EXPOSED_DATABASE ?? 'postgresql://postgres:postgres@localhost:5432/exposed'
const prisma = new PrismaClient({ adapter: new PrismaPg(url) })

function check(name: string, ...pairs: readonly (readonly [unknown, unknown, string])[]) {
  const wrong = pairs.filter(([got, want]) => !isDeepStrictEqual(got, want))
  if (wrong.length > 0) {
    const problems = wrong.map(
      ([got, want, label]) =>
        `${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
    )
    throw new Error(`${name}: ${problems.join(', ')}`)
  }
  console.log(`ok: ${name}`)
}

// The instant Check.kt writes with nanoseconds, as the JavaScript Date Prisma Client holds it.
const AT = new Date('2030-01-01T09:00:00.123Z')
const LATE = new Date('1999-12-31T23:59:59.999Z')
// A date column holds the UTC date of an instant, a time column its UTC time on 1970-01-01.
const DAY = new Date('2030-01-01T00:00:00.000Z')
const CLOCK = new Date('1970-01-01T09:00:00.123Z')
const recent = (date: Date) => Math.abs(Date.now() - date.getTime()) < 60_000

const event = await prisma.event.findUniqueOrThrow({ where: { name: 'exposed' } })
check(
  'Prisma Client reads each DateTime Exposed wrote as the instant it was, to the millisecond',
  [event.at, AT, 'at'],
  [event.micros, AT, 'timestamp(6)'],
  [event.seconds, new Date('2030-01-01T09:00:00.000Z'), 'timestamp(0)'],
  [event.zoned, AT, 'timestamptz(3)'],
  [event.zonedFine, AT, 'timestamptz(6)'],
  [event.day, DAY, 'date'],
  [event.clock, CLOCK, 'time(3)'],
  [event.fineClock, CLOCK, 'time'],
  [event.zonedTime, CLOCK, 'timetz(3), written from +09:00'],
  [event.history, [AT, LATE], 'DateTime[]'],
  [event.zonedList, [AT, LATE], 'timestamptz(6)[]'],
  [recent(event.createdAt), true, `now(): ${event.createdAt.toISOString()}`],
  [recent(event.updatedAt), true, `@updatedAt: ${event.updatedAt.toISOString()}`],
  [event.touchedOn, new Date(event.updatedAt.toISOString().slice(0, 10)), '@updatedAt @db.Date'],
)

const found = async (where: Prisma.EventWhereInput) =>
  (await prisma.event.findMany({ where, select: { name: true } })).map((row) => row.name)
check(
  "and finds Exposed's row by each of them",
  [await found({ at: AT }), ['exposed'], 'at'],
  [await found({ micros: AT }), ['exposed'], 'micros'],
  [await found({ zoned: AT }), ['exposed'], 'zoned'],
  [await found({ zonedFine: AT }), ['exposed'], 'zonedFine'],
  [await found({ day: DAY }), ['exposed'], 'day'],
  [await found({ clock: CLOCK }), ['exposed'], 'clock'],
  [await found({ zonedTime: CLOCK }), ['exposed'], 'zonedTime'],
  [await found({ history: { equals: [AT, LATE] } }), ['exposed'], 'history'],
  [await found({ createdAt: event.createdAt }), ['exposed'], 'createdAt'],
)

const reading = await prisma.reading.findUnique({
  where: { sensor_at: { sensor: 'exposed', at: AT } },
})
check("and Exposed's reading by its composite key", [reading?.value, 2.5, 'value'])

const [defaults] = await prisma.defaults.findMany()
check(
  "Exposed's defaults are what Prisma Client writes for them",
  [defaults?.epoch, new Date('2020-01-01T00:00:00.000Z'), 'epoch'],
  [defaults?.shifted, new Date('2020-01-01T03:34:56.789Z'), 'shifted'],
  [defaults?.micro, new Date('2020-01-01T00:00:00.123Z'), 'micro'],
  [defaults?.zoned, new Date('2020-01-01T03:34:56.789Z'), 'zoned'],
  [defaults?.day, new Date('2019-12-31T00:00:00.000Z'), 'day'],
  [defaults?.clock, new Date('1970-01-01T00:30:00.000Z'), 'clock'],
  [defaults?.zonedClock, new Date('1970-01-01T00:30:00.500Z'), 'zonedClock'],
  [
    defaults?.stampedOn,
    defaults && new Date(defaults.zonedNow.toISOString().slice(0, 10)),
    'stampedOn',
  ],
  [defaults !== undefined && recent(defaults.zonedNow), true, 'zonedNow'],
)

// The rows Check.kt's `read` reads, all from AT.
await prisma.event.create({
  data: {
    name: 'prisma',
    at: AT,
    micros: AT,
    seconds: AT,
    zoned: AT,
    zonedFine: AT,
    day: DAY,
    clock: CLOCK,
    fineClock: CLOCK,
    zonedTime: CLOCK,
    history: [AT, LATE],
    zonedList: [AT, LATE],
  },
})
await prisma.defaults.create({ data: {} })
await prisma.reading.create({ data: { sensor: 'prisma', at: AT, value: 3.5 } })
console.log('ok: Prisma Client wrote the rows for Exposed')
await prisma.$disconnect()
