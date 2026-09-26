# drizzle

A table of events, written by `hekireki-drizzle` from `schema.prisma` into `src/db/schema.ts` and
run against the real drizzle on SQLite, through better-sqlite3, with Prisma Client beside it on the
same database. What drizzle writes Prisma reads, and the other way round, as the same instant.

```bash
pnpm install
cd examples/drizzle
pnpm run demo
```

`src/db/schema.ts` is committed as `prisma generate` writes it. `demo` starts from nothing all the
same: `prisma generate` writes the schema and Prisma Client, `prisma db push` creates `dev.db`,
`tsc` type-checks `check.ts` against both, and `node check.ts` runs the checks in `Asia/Tokyo`, a
zone that is not UTC, and prints one `ok:` line for each.

## Dates

A `DateTime` is a `Date` in drizzle as it is in Prisma Client, held in UTC to the millisecond.

- **SQLite keeps it as text, and compares the text.** The generated `utcDateTime` column writes
  what Prisma writes, `2030-01-02T03:04:05.678+00:00`, so an `=`, `@unique` and a composite `@@id`
  from either side meet the other's rows. It reads Prisma's text, text without a zone as UTC
  (what `CURRENT_TIMESTAMP` writes), and the milliseconds an older drizzle schema stored.
- **`@default(now())` and `@updatedAt` are filled by drizzle, not the database**, as Prisma Client
  fills them: `utcNow` gives every column of one insert the same instant, so a new row's
  `createdAt` and `updatedAt` are equal, and `$onUpdate` moves `@updatedAt` on every update. On
  SQLite there is no table default for `now()`, since `CURRENT_TIMESTAMP`'s text would sort before
  Prisma's; on PostgreSQL and MySQL the table's `CURRENT_TIMESTAMP` is only for the DDL.
- **PostgreSQL.** `DateTime` is `timestamp(3)`, `@db.Timestamptz` is `timestamp` with a zone, both
  in drizzle's `date` mode, which reads and writes UTC whatever the process's zone. `@db.Date`,
  `@db.Time` and `@db.Timetz` are the generated `utcDate`, `utcTime` and `utcTimetz`: a `Date` on
  1970-01-01 for a time of day, written as UTC (`+00` for `timetz`). A `DateTime[]` is an array
  column, nullable as the one Prisma makes is.
- **CockroachDB** takes the PostgreSQL schema, through node-postgres as Prisma's `@prisma/adapter-pg`
  is: its `timestamp`, `timestamptz`, `date`, `time`, `timetz` and arrays of them read and write as
  PostgreSQL's do, and a bare `@db.Timestamp` or `@db.Timestamptz` is microseconds on both. An `Int`
  key there counts with `@default(sequence())`, which Prisma makes an identity column, and so is
  `generatedByDefaultAsIdentity()`, left out of a drizzle insert. drizzle-kit writes that identity
  with a `sequence name` CockroachDB refuses, and its `integer` is `INT8` there: make the tables
  with Prisma.
- **MySQL.** `DateTime` is `datetime(3)`; `@db.DateTime(p)`, `@db.Timestamp(p)` and `@db.Time(p)`
  keep their precision, and a bare `@db.DateTime` or `@db.Timestamp` is precision 0, as in the
  table Prisma makes.

### What the connection has to be

- **The session's time zone is UTC.** MySQL converts a `TIMESTAMP` through the session's
  `time_zone`, and `CURRENT_TIMESTAMP` in a column without a zone (a `dbgenerated` default on
  PostgreSQL or MySQL) is the session's wall clock. Prisma Client sets neither, so its rows are UTC
  only on a server whose zone is. Where the server's is not, set it on each connection drizzle
  uses: `SET time_zone = '+00:00'` on MySQL (with mysql2's pool,
  `pool.on('connection', (connection) => connection.query("SET time_zone = '+00:00'"))`), and
  `options: '-c TimeZone=UTC'` in pg's config on PostgreSQL and on CockroachDB, whose sessions
  start in UTC unless the client or a role's default says otherwise. The generated MySQL schema says this
  on one line above the tables when it has a `timestamp()` column.
- **An `=` on a MySQL `TIME` with less precision than the value.** mysql2 writes the value into the
  statement and MySQL rounds it to the column, where Prisma binds it: `= 03:04:05.678` on a
  `@db.Time(0)` finds the row holding `03:04:06` through drizzle and none through Prisma. Compare
  at the column's precision.
