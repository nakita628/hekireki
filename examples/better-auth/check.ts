// Better Auth on the drizzle schema hekireki-drizzle wrote, beside Better Auth on Prisma Client,
// on the tables `prisma db push` made from <provider>/schema.prisma: `node check.ts sqlite` (or
// `postgresql`, `mysql`). Each of the two signs a user up and in and the other reads what it
// wrote, the plugins' tables among them. Each check prints `ok: <name>`, or throws with what it
// saw instead.
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { betterAuth } from 'better-auth'
import { getTableColumns, getTableName, is, Table } from 'drizzle-orm'

import { plugins } from './plugins.ts'

const URLS: Readonly<Record<string, string>> = {
  sqlite: `file:${new URL('sqlite/dev.db', import.meta.url).pathname}`,
  postgresql: 'postgresql://postgres:postgres@localhost:5432/better_auth',
  mysql: 'mysql://root:root@localhost:3306/better_auth',
}
const provider = process.argv[2] ?? ''
const url = process.env.BETTER_AUTH_DATABASE ?? URLS[provider]
if (url === undefined) {
  console.error('usage: node check.ts sqlite|postgresql|mysql')
  process.exit(1)
}

function check(name: string, problem: string | undefined) {
  if (problem !== undefined) throw new Error(`${name}: ${problem}`)
  console.log(`ok: ${name}`)
}

const schema: Record<string, unknown> = await import(`./${provider}/schema.ts`)
const { PrismaClient } = await import(`./${provider}/generated/client/client.ts`)

// The two clients on one database, the columns the database has, and how to let go of it.
const connect = async () => {
  if (provider === 'sqlite') {
    const { default: Database } = await import('better-sqlite3')
    const { drizzle } = await import('drizzle-orm/better-sqlite3')
    const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3')
    const connection = new Database(url.replace('file:', ''))
    const names = connection
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\'",
      )
      .pluck()
      .all() as string[]
    const db = drizzle(connection, { schema })
    return {
      db,
      // The schema is read at run time, so a table is whichever provider's it is.
      first: async (table: Table) =>
        db
          .select()
          .from(table as never)
          .limit(1),
      prisma: new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) }),
      columns: names.flatMap((table) =>
        (
          connection.prepare(`PRAGMA table_info("${table}")`).all() as {
            name: string
            notnull: number
            pk: number
          }[]
        ).map((column) => ({
          table,
          column: column.name,
          required: column.notnull === 1 || column.pk > 0,
        })),
      ),
      close: async () => {
        connection.close()
      },
    }
  }
  if (provider === 'postgresql') {
    const { default: pg } = await import('pg')
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const { PrismaPg } = await import('@prisma/adapter-pg')
    const pool = new pg.Pool({ connectionString: url, options: '-c TimeZone=UTC' })
    const { rows } = await pool.query<{ table: string; column: string; required: boolean }>(
      `SELECT table_name AS "table", column_name AS "column", is_nullable = 'NO' AS required
       FROM information_schema.columns WHERE table_schema = 'public'`,
    )
    const db = drizzle(pool, { schema })
    return {
      db,
      first: async (table: Table) =>
        db
          .select()
          .from(table as never)
          .limit(1),
      prisma: new PrismaClient({ adapter: new PrismaPg(url) }),
      columns: rows,
      close: () => pool.end(),
    }
  }
  const { default: mysql } = await import('mysql2')
  const { drizzle } = await import('drizzle-orm/mysql2')
  const { PrismaMariaDb } = await import('@prisma/adapter-mariadb')
  const pool = mysql.createPool({ uri: url, supportBigNumbers: true, bigNumberStrings: true })
  pool.on('connection', (connection) => connection.query("SET time_zone = '+00:00'"))
  const [rows] = await pool.promise().query(
    `SELECT table_name AS \`table\`, column_name AS \`column\`, is_nullable = 'NO' AS required
     FROM information_schema.columns WHERE table_schema = DATABASE()`,
  )
  const db = drizzle(pool, { schema, mode: 'default' })
  return {
    db,
    first: async (table: Table) =>
      db
        .select()
        .from(table as never)
        .limit(1),
    prisma: new PrismaClient({ adapter: new PrismaMariaDb(url) }),
    columns: (rows as { table: string; column: string; required: number | string }[]).map(
      (row) => ({ ...row, required: Number(row.required) === 1 }),
    ),
    close: () => pool.promise().end(),
  }
}
const { db, prisma, columns, first, close } = await connect()

// Every table of every plugin: the columns drizzle names are the columns the table has, required
// where they are, and a select of all of them is one the database takes.
const tables = Object.values(schema).filter((value) => is(value, Table))
const held = columns
  .filter((column) => !column.table.startsWith('_'))
  .map((column) => `${column.table}.${column.column}${column.required ? ' required' : ''}`)
  .toSorted()
const declared = tables
  .flatMap((table) =>
    Object.values(getTableColumns(table)).map(
      (column) => `${getTableName(table)}.${column.name}${column.notNull ? ' required' : ''}`,
    ),
  )
  .toSorted()
const apart = [
  ...held
    .filter((column) => !declared.includes(column))
    .map((column) => `database only: ${column}`),
  ...declared.filter((column) => !held.includes(column)).map((column) => `drizzle only: ${column}`),
]
check(
  `the ${declared.length} columns of the ${tables.length} tables are the database's`,
  apart.length === 0 ? undefined : apart.join(', '),
)
for (const table of tables) await first(table)
check(`drizzle selects from each of the ${tables.length} tables`, undefined)

// better-sqlite3 runs a transaction in one go and takes no promise in it, so Better Auth has none
// on drizzle there, and SCIM, which asks for them, is left out: its tables are checked above.
const transaction = provider !== 'sqlite'
const options = {
  baseURL: 'http://localhost:3000',
  secret: 'f3a9c1d27b8e4f60a5d3c9e1b7f2a8d4c6e0b9a3',
  emailAndPassword: { enabled: true },
  plugins: plugins.filter((plugin) => transaction || plugin.id !== 'scim'),
}
const onDrizzle = betterAuth({
  ...options,
  database: drizzleAdapter(db, {
    provider: provider === 'postgresql' ? 'pg' : provider === 'mysql' ? 'mysql' : 'sqlite',
    schema,
    transaction,
  }),
})
const onPrisma = betterAuth({
  ...options,
  database: prismaAdapter(prisma, {
    provider: provider === 'postgresql' ? 'postgresql' : provider === 'mysql' ? 'mysql' : 'sqlite',
    transaction,
  }),
})

// Emptied child first; the users take their sessions, accounts and memberships with them.
await prisma.apikey.deleteMany()
await prisma.organization.deleteMany()
await prisma.user.deleteMany()

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value))
const cookies = (headers: Headers) =>
  new Headers({
    cookie: headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; '),
  })

const before = Date.now()
const signedUp = await onDrizzle.api.signUpEmail({
  body: { name: 'Drizzle', email: 'drizzle@example.com', password: 'correct horse battery' },
  returnHeaders: true,
})
const byPrisma = await prisma.user.findUniqueOrThrow({ where: { email: 'drizzle@example.com' } })
check(
  'Prisma reads the user Better Auth signed up on drizzle',
  byPrisma.id === signedUp.response.user.id &&
    iso(byPrisma.createdAt) === iso(signedUp.response.user.createdAt) &&
    byPrisma.createdAt.getTime() >= before - 1000 &&
    byPrisma.createdAt.getTime() <= Date.now() &&
    byPrisma.emailVerified === false
    ? undefined
    : `created ${iso(byPrisma.createdAt)}, Better Auth said ${iso(signedUp.response.user.createdAt)}`,
)

const signedIn = await onPrisma.api.signInEmail({
  body: { email: 'drizzle@example.com', password: 'correct horse battery' },
  returnHeaders: true,
})
check(
  'Better Auth on Prisma signs in with the password stored through drizzle',
  signedIn.response.user.id === byPrisma.id ? undefined : `signed in ${signedIn.response.user.id}`,
)
const session = await onDrizzle.api.getSession({ headers: cookies(signedIn.headers) })
const stored = await prisma.session.findFirstOrThrow({
  where: { token: signedIn.response.token },
})
check(
  'Better Auth on drizzle reads the session made through Prisma, to the instant it ends',
  session !== null &&
    session.user.email === 'drizzle@example.com' &&
    iso(session.session.expiresAt) === iso(stored.expiresAt) &&
    stored.expiresAt.getTime() > Date.now()
    ? undefined
    : `session ${iso(session?.session.expiresAt)}, stored ${iso(stored.expiresAt)}`,
)

const other = await onPrisma.api.signUpEmail({
  body: { name: 'Prisma', email: 'prisma@example.com', password: 'correct horse battery' },
  returnHeaders: true,
})
const otherSession = await onDrizzle.api.getSession({ headers: cookies(other.headers) })
check(
  'Better Auth on drizzle reads the user signed up through Prisma',
  otherSession?.user.id === other.response.user.id &&
    iso(otherSession.user.createdAt) === iso(other.response.user.createdAt)
    ? undefined
    : `read ${otherSession?.user.id} created ${iso(otherSession?.user.createdAt)}`,
)

// The organization plugin: an organization and its first member through drizzle.
const organization = await onDrizzle.api.createOrganization({
  body: { name: 'Hekireki', slug: 'hekireki' },
  headers: cookies(signedUp.headers),
})
const members = await prisma.member.findMany({ where: { organizationId: organization.id } })
check(
  'Prisma reads the organization and its owner made through drizzle',
  members.length === 1 &&
    members[0].userId === byPrisma.id &&
    members[0].role === 'owner' &&
    iso(members[0].createdAt) === iso(organization.members[0]?.createdAt)
    ? undefined
    : JSON.stringify(members),
)
const listed = await onPrisma.api.listOrganizations({ headers: cookies(signedIn.headers) })
check(
  'Better Auth on Prisma lists it, created at the same instant',
  listed.length === 1 && iso(listed[0]?.createdAt) === iso(organization.createdAt)
    ? undefined
    : JSON.stringify(listed),
)

// The API key plugin: a key through drizzle that ends in a day, verified through Prisma.
const key = await onDrizzle.api.createApiKey({
  body: { name: 'ci', expiresIn: 60 * 60 * 24, userId: byPrisma.id },
})
const verified = await onPrisma.api.verifyApiKey({ body: { key: key.key } })
const storedKey = await prisma.apikey.findUniqueOrThrow({ where: { id: key.id } })
check(
  'Better Auth on Prisma takes the API key made through drizzle, and when it ends',
  verified.valid &&
    iso(storedKey.expiresAt) === iso(key.expiresAt) &&
    Math.abs(storedKey.expiresAt.getTime() - Date.now() - 86_400_000) < 5000
    ? undefined
    : `valid ${verified.valid}, ends ${iso(storedKey.expiresAt)}, Better Auth said ${iso(key.expiresAt)}`,
)

// The admin plugin: a ban that ends, set through drizzle by the first user, made an admin here.
await prisma.user.update({ where: { id: byPrisma.id }, data: { role: 'admin' } })
await onDrizzle.api.banUser({
  body: { userId: other.response.user.id, banReason: 'a check', banExpiresIn: 60 * 60 },
  headers: cookies(signedUp.headers),
})
const banned = await prisma.user.findUniqueOrThrow({ where: { id: other.response.user.id } })
check(
  'Prisma reads the ban set through drizzle, and the hour it ends in',
  banned.banned === true &&
    banned.banReason === 'a check' &&
    Math.abs(banned.banExpires.getTime() - Date.now() - 3_600_000) < 5000
    ? undefined
    : `banned ${banned.banned}, ends ${iso(banned.banExpires)}`,
)

await prisma.$disconnect()
await close()
