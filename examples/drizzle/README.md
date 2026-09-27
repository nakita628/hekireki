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
`tsc` type-checks `check.ts` against both, and `zones.ts` runs the checks once in each time zone
and prints one `ok:` line for each.

## Time zones

The checks run in UTC, in `Asia/Tokyo` (JST), in `America/New_York`, which has daylight saving,
and in `Asia/Kolkata`, half an hour off the hour. `DRIZZLE_ZONES` names others:

```bash
DRIZZLE_ZONES=Europe/Paris,Pacific/Auckland pnpm run verify
```

What is written is UTC in every one of them, and what is read is the instant: the process's zone
changes how a `Date` prints, not what the column holds.

On PostgreSQL and MySQL, with the databases of `examples/compose.yaml`:

```bash
docker compose -f ../compose.yaml up -d postgres mysql
pnpm run demo:postgresql       # or DRIZZLE_DATABASE=postgresql://… node provider.ts postgresql
pnpm run demo:mysql
```

`provider.ts` writes `schema.prisma` again under `.provider/` with that provider and a `Slot`
model of what SQLite has not (a date, a time, microseconds, a `timestamptz` and a `timetz` on
PostgreSQL, a `TIMESTAMP` on MySQL) beside a `Bytes`, a `BigInt` past 2^53 and a `Decimal`. It
generates there, pushes the tables to the database named `drizzle`, type-checks
`check.postgresql.ts` or `check.mysql.ts` against what was generated, and runs it in each time
zone.

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

## Bytes

A `Bytes` is a `Uint8Array` in drizzle as it is in Prisma Client, in the column Prisma makes.

- **PostgreSQL** has it in `bytea`, which drizzle has no column for: the generated `bytea` is one.
- **MySQL** has it in `longblob`, or in what `@db.Binary`, `@db.VarBinary`, `@db.TinyBlob`,
  `@db.Blob` and `@db.MediumBlob` name. drizzle's `binary()` and `varbinary()` read the bytes as
  text, which loses every byte that is not UTF-8, and it has no blob: the generated `bytes` takes
  the column's type and leaves the bytes alone.
- **A `@default` on one** is the bytes in the table, written as the database reads them:
  `decode('0001ff', 'hex')` on PostgreSQL, `0x0001ff` on MySQL, `X'0001ff'` on SQLite.

## Keys, indexes and foreign keys

The tables drizzle-kit would make from the schema are the ones Prisma Migrate makes, under its
names: a composite key is `<table>_pkey`, a unique is the unique index `<table>_<columns>_key`, an
index `<table>_<columns>_idx`, and a foreign key `<table>_<columns>_fkey` with the actions Prisma
implies where the schema names none (`onUpdate: Cascade`; `onDelete: Restrict`, or `SetNull` on an
optional relation). An implicit many-to-many is `_<relation>` with its pair as the key on
PostgreSQL and as a unique index on MySQL and SQLite.

Two things stay apart from Prisma's tables, in form and not in what they hold:

- **A unique a relation points at is a constraint**, not an index, on PostgreSQL and MySQL:
  drizzle-kit adds a table's foreign keys before its indexes, and a foreign key is refused where
  what it points at is not unique yet. The name is Prisma's.
- **A list's default** is written `'{}'` by drizzle-kit and `ARRAY[]::text[]` by Prisma Migrate.

### What the connection has to be

- **A MySQL `BIGINT` comes as text.** mysql2 gives one as a number, which is exact to 2^53:
  `9007199254740993` is read as `9007199254740992n`. With `supportBigNumbers: true` and
  `bigNumberStrings: true` in the pool's options it is text, which drizzle makes a `bigint` of.

- **The session's time zone is UTC.** MySQL converts a `TIMESTAMP` through the session's
  `time_zone`, and `CURRENT_TIMESTAMP` in a column without a zone (a `dbgenerated` default on
  PostgreSQL or MySQL) is the session's wall clock. Prisma Client sets neither, so its rows are UTC
  only on a server whose zone is. Where the server's is not, set it on each connection drizzle
  uses: `SET time_zone = '+00:00'` on MySQL (with mysql2's pool,
  `pool.on('connection', (connection) => connection.query("SET time_zone = '+00:00'"))`), and
  `options: '-c TimeZone=UTC'` in pg's config on PostgreSQL and on CockroachDB, whose sessions
  start in UTC unless the client or a role's default says otherwise.
- **An `=` on a MySQL `TIME` with less precision than the value.** mysql2 writes the value into the
  statement and MySQL rounds it to the column, where Prisma binds it: `= 03:04:05.678` on a
  `@db.Time(0)` finds the row holding `03:04:06` through drizzle and none through Prisma. Compare
  at the column's precision.
