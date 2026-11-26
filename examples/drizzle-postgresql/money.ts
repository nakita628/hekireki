// PostgreSQL's money, against Prisma Client on the tables `prisma db push` made from schema.prisma.
// Each check prints `ok: <name>`, or throws with what it saw instead.
import { PrismaPg } from '@prisma/adapter-pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import { PrismaClient } from './generated/client/client.ts'
import { owner, purses, relations } from './src/db/schema.ts'

const url =
  process.env.DRIZZLE_DATABASE ?? 'postgresql://postgres:postgres@localhost:5432/drizzle_dates'
const pool = new pg.Pool({ connectionString: url })
const db = drizzle({ client: pool })
const prisma = new PrismaClient({ adapter: new PrismaPg(url) })

function check(name: string, problem: string | undefined) {
  if (problem !== undefined) throw new Error(`${name}: ${problem}`)
  console.log(`ok: ${name}`)
}

// PostgreSQL's money: Prisma Client reads it as numeric, and so does the generated moneyDecimal,
// in a plain select, from RETURNING, and in a relational query's rows, a list's elements included.
const rq = drizzle({ client: pool, relations })
await prisma.purse.deleteMany()
await prisma.owner.deleteMany()
const [board] = await db.insert(owner).values({ name: 'board' }).returning()
if (board === undefined) throw new Error('drizzle inserted no owner')
const [returned] = await db
  .insert(purses)
  .values({ name: 'drizzle', cash: '1234.56', history: ['1.5', '-2.25'], ownerId: board.id })
  .returning()
await prisma.purse.create({
  data: { name: 'prisma', cash: '-0.75', spare: '3', ownerId: board.id },
})
const money = (row: {
  cash: string
  spare: string | null
  history: string[] | null
  fee: string
}) =>
  `${Number(row.cash)} ${row.spare === null ? null : Number(row.spare)} [${(row.history ?? []).map(Number).join(',')}] ${Number(row.fee)}`
const wantMoney = ['1234.56 null [1.5,-2.25] 1.5', '-0.75 3 [] 1.5']
check(
  'RETURNING gives the money drizzle wrote',
  returned !== undefined && money(returned) === wantMoney[0] ? undefined : JSON.stringify(returned),
)
const plainMoney = (await db.select().from(purses).orderBy(purses.name)).map(money)
check(
  'drizzle reads the money both clients wrote',
  plainMoney.join(' | ') === wantMoney.join(' | ') ? undefined : plainMoney.join(' | '),
)
const prismaMoney = (await prisma.purse.findMany({ orderBy: { name: 'asc' } })).map((row) =>
  money({
    cash: row.cash.toString(),
    spare: row.spare?.toString() ?? null,
    history: row.history.map(String),
    fee: row.fee.toString(),
  }),
)
check(
  'Prisma reads the money both clients wrote',
  prismaMoney.join(' | ') === wantMoney.join(' | ') ? undefined : prismaMoney.join(' | '),
)
const nested = await rq.query.owner.findFirst({ with: { purses: { orderBy: { name: 'asc' } } } })
const nestedMoney = (nested?.purses ?? []).map(money)
check(
  'a relational query reads the money in its nested rows',
  nestedMoney.join(' | ') === wantMoney.join(' | ') ? undefined : nestedMoney.join(' | '),
)

await prisma.$disconnect()
await pool.end()
