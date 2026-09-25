// The generated DB interface against the real Kysely, on the SQLite database `prisma db push`
// made from schema.prisma, through better-sqlite3 as Kysely's SqliteDialect drives it. Every
// table the generator writes into DB is queried here by the name it gives, every scalar is
// written and read back, and each value's JavaScript type is held to the one the interface
// declares. The last part is for the compiler alone: what the types must refuse. Each check
// prints `ok: <name>`, or throws with what it saw instead.
import { deepStrictEqual } from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import Database from 'better-sqlite3'
import { type Insertable, Kysely, type Selectable, SqliteDialect } from 'kysely'

import type * as t from './src/db/types.ts'

const database = new Database(new URL('dev.db', import.meta.url).pathname)
// SQLite enforces a foreign key only on a connection that asks it to; Prisma's client asks, a
// plain connection does not. The dialect keeps this one connection for every query.
database.pragma('foreign_keys = ON')
const db = new Kysely<t.DB>({ dialect: new SqliteDialect({ database }) })

async function check(name: string, run: () => Promise<string | undefined>) {
  const problem = await run()
  if (problem !== undefined) throw new Error(`${name}: ${problem}`)
  console.log(`ok: ${name}`)
}

/** The SQLite error code a statement fails with, or `undefined` when it succeeds. */
async function failure(statement: { execute(): Promise<unknown> }) {
  try {
    await statement.execute()
    return undefined
  } catch (error) {
    return (error as { code?: string }).code ?? String(error)
  }
}

/** What differs between `actual` and `expected`, or `undefined` when they are deeply equal. */
function differs(actual: unknown, expected: unknown) {
  try {
    deepStrictEqual(actual, expected)
    return undefined
  } catch (error) {
    return (error as Error).message
  }
}

// The checks make rows; from empty tables each time, children first, so it can be run again.
for (const table of [
  'order_items',
  'orders',
  'reviews',
  '_Wishlist',
  '_RecordToTag',
  'records',
  'tags',
  'artists',
  'profiles',
  'users',
  'shop settings',
] as const) {
  await db.deleteFrom(table).execute()
}

const NOW = '2026-09-25T09:00:00.000Z'

// The shop's own account, which the SetDefault check needs as the default of `orders.customer_id`.
await db
  .insertInto('users')
  .values({ id: 1, email: 'shop@example.com', role: 'ADMIN', updated_at: NOW })
  .execute()

const artist = await db
  .insertInto('artists')
  .values({ name: 'The Query Builders' })
  .returning('id')
  .executeTakeFirstOrThrow()

/** A record with every required column given and nothing else. */
function record(title: string, catalogueNo: number): Insertable<t.Record> {
  return {
    id: randomUUID(),
    title,
    catalogue_no: catalogueNo,
    price: '10.00',
    tracklist: '[]',
    genre: 'jazz',
    artist_id: artist.id,
    updated_at: NOW,
  }
}

// --- Scalars ------------------------------------------------------------------------------------

await check('every scalar goes in and comes back as the interface types it', async () => {
  const id = randomUUID()
  const cover = Buffer.from([0x00, 0xff, 0x10, 0x80])
  await db
    .insertInto('records')
    .values({
      id,
      title: 'Kind of Typed',
      catalogue_no: 4_503_599_627_370_496,
      price: '19.99',
      rating: 4.75,
      tracks: 5,
      in_stock: 0,
      released_on: '1959-08-17T00:00:00.000Z',
      tracklist: JSON.stringify([{ side: 'A', title: 'So What' }]),
      cover,
      genre: 'jazz',
      format: 'LP',
      artist_id: artist.id,
      updated_at: NOW,
    })
    .execute()
  const row: Selectable<t.Record> = await db
    .selectFrom('records')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
  return differs(
    {
      title: row.title,
      catalogue_no: row.catalogue_no,
      price: row.price,
      rating: row.rating,
      tracks: row.tracks,
      in_stock: row.in_stock,
      released_on: row.released_on,
      tracklist: JSON.parse(String(row.tracklist)),
      cover: row.cover,
      genre: row.genre,
      format: row.format,
      created_at: typeof row.created_at,
      updated_at: row.updated_at,
    },
    {
      title: 'Kind of Typed',
      catalogue_no: 4_503_599_627_370_496,
      price: 19.99,
      rating: 4.75,
      tracks: 5,
      in_stock: 0,
      released_on: '1959-08-17T00:00:00.000Z',
      tracklist: [{ side: 'A', title: 'So What' }],
      cover,
      genre: 'jazz',
      format: 'LP',
      created_at: 'string',
      updated_at: NOW,
    },
  )
})

await check(
  'a BigInt binds as a bigint and reads back as a number, exact through safeIntegers',
  async () => {
    const past = 2n ** 53n + 1n
    const id = randomUUID()
    await db
      .insertInto('records')
      .values({ ...record('Big', 0), id, catalogue_no: past })
      .execute()
    const row = await db
      .selectFrom('records')
      .select('catalogue_no')
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    if (typeof row.catalogue_no !== 'number') return `read a ${typeof row.catalogue_no}`
    const exact = database
      .prepare('SELECT catalogue_no FROM records WHERE id = ?')
      .safeIntegers()
      .pluck()
      .get(id)
    return exact === past ? undefined : `the database kept ${String(exact)}, not ${past}`
  },
)

await check(
  'a Decimal given as text is a number again, and a Json that is a bare number too',
  async () => {
    const id = randomUUID()
    await db
      .insertInto('records')
      .values({ ...record('Numbers', 7), id, price: '0.10', tracklist: '42' })
      .execute()
    const row = await db
      .selectFrom('records')
      .select(['price', 'tracklist'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    return differs(row, { price: 0.1, tracklist: 42 })
  },
)

await check('an optional column may be left out, and reads back null', async () => {
  const id = randomUUID()
  await db
    .insertInto('records')
    .values({ ...record('Sparse', 8), id })
    .execute()
  const row = await db
    .selectFrom('records')
    .select(['rating', 'released_on', 'cover'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
  return differs(row, { rating: null, released_on: null, cover: null })
})

// --- Defaults and keys --------------------------------------------------------------------------

await check('database defaults fill what an insert leaves out', async () => {
  const user = await db
    .insertInto('users')
    .values({ email: 'ann@example.com', updated_at: NOW })
    .returningAll()
    .executeTakeFirstOrThrow()
  const recordId = randomUUID()
  await db
    .insertInto('records')
    .values({ ...record('Defaults', 9), id: recordId })
    .execute()
  const review = await db
    .insertInto('reviews')
    .values({ record_id: recordId, author_id: user.id, stars: 4 })
    .returningAll()
    .executeTakeFirstOrThrow()
  const saved = await db
    .selectFrom('records')
    .select(['tracks', 'in_stock', 'format'])
    .where('id', '=', recordId)
    .executeTakeFirstOrThrow()
  const reasons = [
    differs(
      { role: user.role, is_active: user.is_active, display_name: user.display_name },
      { role: 'customer', is_active: 1, display_name: null },
    ),
    /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/u.test(user.created_at)
      ? undefined
      : `created_at ${user.created_at}`,
    differs({ weight: review.weight, body: review.body }, { weight: 1.5, body: '' }),
    differs(saved, { tracks: 1, in_stock: 1, format: 'LP' }),
  ].filter((reason) => reason !== undefined)
  return reasons.length > 0 ? reasons.join('; ') : undefined
})

await check(
  'autoincrement keys count up; uuid and cuid keys are the caller’s to make',
  async () => {
    const [first, second] = await db
      .insertInto('tags')
      .values([{ name: 'modal' }, { name: 'cool' }])
      .returning('id')
      .execute()
    if (first === undefined || second === undefined || second.id !== first.id + 1)
      return `ids ${first?.id} and ${second?.id}`
    const user = await db
      .insertInto('users')
      .values({ email: 'cuid@example.com', updated_at: NOW })
      .returning('id')
      .executeTakeFirstOrThrow()
    // Prisma's client makes a cuid; the column has no default, so a raw insert without one fails.
    const code = await failure(
      db.insertInto('profiles').values({ user_id: user.id } as Insertable<t.Profile>),
    )
    return code === 'SQLITE_CONSTRAINT_NOTNULL' ? undefined : `an insert without id gave ${code}`
  },
)

await check(
  '@updatedAt is Prisma’s: the database leaves the column as an update found it',
  async () => {
    const user = await db
      .insertInto('users')
      .values({ email: 'stale@example.com', updated_at: NOW })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.updateTable('users').set({ display_name: 'Stale' }).where('id', '=', user.id).execute()
    const row = await db
      .selectFrom('users')
      .select('updated_at')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    return row.updated_at === NOW ? undefined : `updated_at became ${row.updated_at}`
  },
)

// --- Names --------------------------------------------------------------------------------------

await check('enum columns hold the @map values, apostrophe and hyphen included', async () => {
  const genres: t.Genre[] = ["rock 'n' roll", 'hip-hop', 'jazz', 'CLASSICAL']
  const ids = genres.map(() => randomUUID())
  await db
    .insertInto('records')
    .values(genres.map((genre, i) => ({ ...record(genre, 100 + i), id: ids[i]!, genre })))
    .execute()
  const stored = await db
    .selectFrom('records')
    .select('genre')
    .where('id', 'in', ids)
    .orderBy('catalogue_no')
    .execute()
  return differs(
    stored.map((row) => row.genre),
    genres,
  )
})

await check(
  'a table and a column that are not identifiers, and columns TypeScript reserves',
  async () => {
    await db
      .insertInto('shop settings')
      .values({ key: 'currency', type: 'string', default: 'EUR', constructor: 'Intl' })
      .execute()
    const row = await db
      .selectFrom('shop settings')
      .select(['type', 'default', 'delete', 'constructor', 'last-modified'])
      .where('key', '=', 'currency')
      .executeTakeFirstOrThrow()
    return differs(
      { ...row, 'last-modified': typeof row['last-modified'] },
      {
        type: 'string',
        default: 'EUR',
        delete: 0,
        constructor: 'Intl',
        'last-modified': 'string',
      },
    )
  },
)

// --- Constraints --------------------------------------------------------------------------------

await check('@unique refuses a second row with the same value', async () => {
  const code = await failure(
    db.insertInto('users').values({ email: 'ann@example.com', updated_at: NOW }),
  )
  return code === 'SQLITE_CONSTRAINT_UNIQUE' ? undefined : `got ${code}`
})

await check(
  '@@unique refuses the same pair, and takes the pair with one side changed',
  async () => {
    const recordId = randomUUID()
    await db
      .insertInto('records')
      .values({ ...record('Reviewed', 200), id: recordId })
      .execute()
    const [a, b] = await db
      .insertInto('users')
      .values([
        { email: 'rev-a@example.com', updated_at: NOW },
        { email: 'rev-b@example.com', updated_at: NOW },
      ])
      .returning('id')
      .execute()
    await db
      .insertInto('reviews')
      .values({ record_id: recordId, author_id: a!.id, stars: 5 })
      .execute()
    const again = await failure(
      db.insertInto('reviews').values({ record_id: recordId, author_id: a!.id, stars: 1 }),
    )
    const other = await failure(
      db.insertInto('reviews').values({ record_id: recordId, author_id: b!.id, stars: 3 }),
    )
    return again === 'SQLITE_CONSTRAINT_UNIQUE' && other === undefined
      ? undefined
      : `same pair ${again}, other author ${other}`
  },
)

await check('a composite primary key holds one line per record in an order', async () => {
  const recordId = randomUUID()
  await db
    .insertInto('records')
    .values({ ...record('Keyed', 300), id: recordId })
    .execute()
  const order = await db
    .insertInto('orders')
    .values({ id: 'order-keyed', customer_id: 1 })
    .returning('id')
    .executeTakeFirstOrThrow()
  await db
    .insertInto('order_items')
    .values({ order_id: order.id, record_id: recordId, unit_price: 12.5 })
    .execute()
  const again = await failure(
    db
      .insertInto('order_items')
      .values({ order_id: order.id, record_id: recordId, unit_price: 12.5 }),
  )
  const line = await db
    .selectFrom('order_items')
    .select(['quantity', 'unit_price'])
    .where('order_id', '=', order.id)
    .where('record_id', '=', recordId)
    .executeTakeFirstOrThrow()
  return again === 'SQLITE_CONSTRAINT_PRIMARYKEY'
    ? differs(line, { quantity: 1, unit_price: 12.5 })
    : `a second line gave ${again}`
})

await check('a foreign key refuses an owner that is not there', async () => {
  const code = await failure(
    db.insertInto('records').values({ ...record('Orphan', 400), artist_id: -1 }),
  )
  return code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ? undefined : `got ${code}`
})

// --- Relations and onDelete ---------------------------------------------------------------------

await check('a self relation: the referrals stay, SetNull, when the referrer goes', async () => {
  const referrer = await db
    .insertInto('users')
    .values({ email: 'referrer@example.com', updated_at: NOW })
    .returning('id')
    .executeTakeFirstOrThrow()
  const referred = await db
    .insertInto('users')
    .values({ email: 'referred@example.com', referrer_id: referrer.id, updated_at: NOW })
    .returning('id')
    .executeTakeFirstOrThrow()
  const joined = await db
    .selectFrom('users as u')
    .innerJoin('users as r', 'r.id', 'u.referrer_id')
    .select(['u.email as email', 'r.email as referrer'])
    .where('u.id', '=', referred.id)
    .executeTakeFirstOrThrow()
  if (joined.referrer !== 'referrer@example.com') return `joined ${JSON.stringify(joined)}`
  await db.deleteFrom('users').where('id', '=', referrer.id).execute()
  const row = await db
    .selectFrom('users')
    .select('referrer_id')
    .where('id', '=', referred.id)
    .executeTakeFirstOrThrow()
  return row.referrer_id === null ? undefined : `referrer_id ${row.referrer_id}`
})

await check(
  'one-to-one: a second profile is refused, and the profile goes with its user',
  async () => {
    const user = await db
      .insertInto('users')
      .values({ email: 'profiled@example.com', updated_at: NOW })
      .returning('id')
      .executeTakeFirstOrThrow()
    const avatar = Buffer.from('GIF89a')
    await db
      .insertInto('profiles')
      .values({ id: 'c-profile-1', user_id: user.id, bio: 'Hi', avatar })
      .execute()
    const second = await failure(
      db.insertInto('profiles').values({ id: 'c-profile-2', user_id: user.id }),
    )
    const joined = await db
      .selectFrom('users')
      .innerJoin('profiles', 'profiles.user_id', 'users.id')
      .select(['users.email', 'profiles.avatar'])
      .where('users.id', '=', user.id)
      .executeTakeFirstOrThrow()
    await db.deleteFrom('users').where('id', '=', user.id).execute()
    const left = await db
      .selectFrom('profiles')
      .select('id')
      .where('user_id', '=', user.id)
      .execute()
    const reasons = [
      second === 'SQLITE_CONSTRAINT_UNIQUE' ? undefined : `a second profile gave ${second}`,
      differs(joined, { email: 'profiled@example.com', avatar }),
      left.length === 0 ? undefined : 'the profile survived its user',
    ].filter((reason) => reason !== undefined)
    return reasons.length > 0 ? reasons.join('; ') : undefined
  },
)

await check(
  'one-to-many, Restrict: an artist with records cannot be deleted, one without can',
  async () => {
    // RESTRICT is checked at once, as a trigger would be, and SQLite reports it as one; NO ACTION
    // waits for the end of the statement and reports a foreign key.
    const code = await failure(db.deleteFrom('artists').where('id', '=', artist.id))
    const empty = await db
      .insertInto('artists')
      .values({ name: 'Nobody' })
      .returning('id')
      .executeTakeFirstOrThrow()
    const gone = await db.deleteFrom('artists').where('id', '=', empty.id).executeTakeFirst()
    return code === 'SQLITE_CONSTRAINT_TRIGGER' && gone.numDeletedRows === 1n
      ? undefined
      : `delete with records gave ${code}, without deleted ${gone.numDeletedRows}`
  },
)

await check(
  'NoAction keeps an ordered record; Cascade takes the lines with the order',
  async () => {
    const recordId = randomUUID()
    await db
      .insertInto('records')
      .values({ ...record('Ordered', 500), id: recordId })
      .execute()
    await db.insertInto('orders').values({ id: 'order-cascade', customer_id: 1 }).execute()
    await db
      .insertInto('order_items')
      .values({ order_id: 'order-cascade', record_id: recordId, quantity: 2, unit_price: '9.50' })
      .execute()
    const code = await failure(db.deleteFrom('records').where('id', '=', recordId))
    await db.deleteFrom('orders').where('id', '=', 'order-cascade').execute()
    const lines = await db
      .selectFrom('order_items')
      .select('record_id')
      .where('order_id', '=', 'order-cascade')
      .execute()
    return code === 'SQLITE_CONSTRAINT_FOREIGNKEY' && lines.length === 0
      ? undefined
      : `delete of an ordered record gave ${code}, ${lines.length} lines left`
  },
)

await check(
  'SetDefault: an order passes to the shop’s account when its customer goes',
  async () => {
    const customer = await db
      .insertInto('users')
      .values({ email: 'leaver@example.com', updated_at: NOW })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db
      .insertInto('orders')
      .values({ id: 'order-default', customer_id: customer.id, note: 'gift wrap' })
      .execute()
    await db.deleteFrom('users').where('id', '=', customer.id).execute()
    const order = await db
      .selectFrom('orders')
      .select(['customer_id', 'note'])
      .where('id', '=', 'order-default')
      .executeTakeFirstOrThrow()
    return differs(order, { customer_id: 1, note: 'gift wrap' })
  },
)

await check(
  'an implicit many-to-many is _RecordToTag, A the record and B the tag, both ways',
  async () => {
    const recordId = randomUUID()
    await db
      .insertInto('records')
      .values({ ...record('Tagged', 600), id: recordId })
      .execute()
    const tag = await db
      .insertInto('tags')
      .values({ name: 'bebop' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('_RecordToTag').values({ A: recordId, B: tag.id }).execute()
    const tags = await db
      .selectFrom('records')
      .innerJoin('_RecordToTag', '_RecordToTag.A', 'records.id')
      .innerJoin('tags', 'tags.id', '_RecordToTag.B')
      .select('tags.name')
      .where('records.id', '=', recordId)
      .execute()
    const titles = await db
      .selectFrom('tags')
      .innerJoin('_RecordToTag', '_RecordToTag.B', 'tags.id')
      .innerJoin('records', 'records.id', '_RecordToTag.A')
      .select('records.title')
      .where('tags.id', '=', tag.id)
      .execute()
    await db.deleteFrom('tags').where('id', '=', tag.id).execute()
    const rows = await db.selectFrom('_RecordToTag').select('A').where('A', '=', recordId).execute()
    return differs(
      { tags, titles, rows },
      { tags: [{ name: 'bebop' }], titles: [{ title: 'Tagged' }], rows: [] },
    )
  },
)

await check('a named implicit many-to-many is _Wishlist, A the record and B the user', async () => {
  const recordId = randomUUID()
  await db
    .insertInto('records')
    .values({ ...record('Wished', 700), id: recordId })
    .execute()
  const user = await db
    .insertInto('users')
    .values({ email: 'wisher@example.com', updated_at: NOW })
    .returning('id')
    .executeTakeFirstOrThrow()
  await db.insertInto('_Wishlist').values({ A: recordId, B: user.id }).execute()
  const wished = await db
    .selectFrom('users')
    .innerJoin('_Wishlist', '_Wishlist.B', 'users.id')
    .innerJoin('records', 'records.id', '_Wishlist.A')
    .select(['users.email', 'records.title'])
    .where('users.id', '=', user.id)
    .execute()
  return differs(wished, [{ email: 'wisher@example.com', title: 'Wished' }])
})

// --- What the types refuse ----------------------------------------------------------------------
// Never run: a query built here is only compiled, so `tsc` is the one that checks it. The
// typecheck fails on each expected error below whose line compiles after all.

type Expect<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

export type Cases = [
  Expect<Equal<Selectable<t.User>['display_name'], string | null>>,
  Expect<Equal<Selectable<t.User>['is_active'], number>>,
  Expect<Equal<Selectable<t.User>['created_at'], string>>,
  Expect<Equal<Selectable<t.Record>['catalogue_no'], number>>,
  Expect<Equal<Insertable<t.Record>['catalogue_no'], number | bigint>>,
  Expect<Equal<Selectable<t.Record>['price'], number>>,
  Expect<Equal<Insertable<t.Record>['price'], number | string>>,
  Expect<Equal<Selectable<t.Record>['tracklist'], string | number>>,
  Expect<Equal<Insertable<t.Record>['tracklist'], string>>,
  Expect<Equal<Selectable<t.Record>['cover'], Buffer | null>>,
  Expect<Equal<Selectable<t.Record>['genre'], "rock 'n' roll" | 'hip-hop' | 'jazz' | 'CLASSICAL'>>,
  Expect<Equal<Selectable<t.User>['role'], 'customer' | 'staff' | 'ADMIN'>>,
  // A database default may be left out; a key Prisma's client makes may not.
  Expect<Equal<Insertable<t.User>['id'], number | undefined>>,
  Expect<Equal<Insertable<t.Record>['format'], t.Format | undefined>>,
  Expect<Equal<Insertable<t.Record>['id'], string>>,
  Expect<Equal<Insertable<t.Profile>['id'], string>>,
  Expect<Equal<Selectable<t.RecordToTag>, { A: string; B: number }>>,
]

export function refused() {
  return [
    // @ts-expect-error email is required
    db.insertInto('users').values({ updated_at: NOW }).compile(),
    // @ts-expect-error @updatedAt has no database default: an insert gives it
    db.insertInto('users').values({ email: 'x@example.com' }).compile(),
    // @ts-expect-error a Boolean binds as 0 or 1: better-sqlite3 refuses `true`
    db.insertInto('users').values({ email: 'x', updated_at: NOW, is_active: true }).compile(),
    // @ts-expect-error a DateTime binds as text: better-sqlite3 refuses a Date
    db.insertInto('users').values({ email: 'x', updated_at: new Date() }).compile(),
    // @ts-expect-error the enum's database value is `customer`, not Prisma's name
    db.insertInto('users').values({ email: 'x', updated_at: NOW, role: 'CUSTOMER' }).compile(),
    // @ts-expect-error not a value of Genre
    db.updateTable('records').set({ genre: 'rock and roll' }).compile(),
    // @ts-expect-error a Json binds as its text, not as an object
    db.updateTable('records').set({ tracklist: {} }).compile(),
    // @ts-expect-error the table is `users`, not the model's name
    db.selectFrom('User').selectAll().compile(),
    // @ts-expect-error the column is `display_name`, not the field's name
    db.selectFrom('users').select('displayName').compile(),
    // @ts-expect-error A of _RecordToTag is a record's uuid
    db.insertInto('_RecordToTag').values({ A: 1, B: 1 }).compile(),
    // @ts-expect-error a relation field is not a column
    db.selectFrom('records').select('artist').compile(),
  ]
}
