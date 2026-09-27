# drizzle-mysql

A `DateTime` in every column MySQL has for one, in the schema `hekireki-drizzle` writes from
`schema.prisma` into `src/db/schema.ts`, with Prisma Client beside it on the same database.

```bash
pnpm install
docker compose -f examples/compose.yaml up -d mysql
cd examples/drizzle-mysql
pnpm run demo               # or DRIZZLE_DATABASE=mysql://… pnpm run demo
```

`src/db/schema.ts` is committed as `prisma generate` writes it. `demo` writes it again with Prisma
Client, makes the tables in the database named `drizzle_dates` with `prisma db push`, type-checks
`check.ts` against both, and runs the checks in UTC and in `Asia/Tokyo`, printing one `ok:` line
for each.

## The columns

| Prisma             | MySQL          | drizzle                                |
| ------------------ | -------------- | -------------------------------------- |
| `DateTime`         | `datetime(3)`  | `datetime({ fsp: 3 })`                 |
| `@db.DateTime(6)`  | `datetime(6)`  | `datetime({ fsp: 6 })`                 |
| `@db.DateTime(0)`  | `datetime`     | `datetime({ fsp: 0 })`                 |
| `@db.Timestamp(3)` | `timestamp(3)` | `timestamp({ fsp: 3 })`                |
| `@db.Date`         | `date`         | `utcDate()`, generated                 |
| `@db.Time(3)`      | `time(3)`      | `utcTime({ precision: 3 })`, generated |

## What the checks hold it to

- **The table holds the same text from either client**, column by column as MySQL prints it:
  `2030-01-02` in a date, `03:04:05.678` in a time.
- **A date is UTC's.** 23:30 UTC is the day after in Tokyo, and the column holds the second of
  January from both clients, in a process in either zone. drizzle's own `date()` takes the date
  from the process's clock: in `Asia/Tokyo` it writes the third, and in `America/New_York` the
  first for 03:04 UTC on the second.
- **Each client reads both rows as the same values**: a date as midnight UTC, a time of day on
  1970-01-01, as Prisma Client gives them.
- **An `=` on a date, a time or a timestamp** finds both rows, from drizzle and from Prisma
  Client.
- **Defaults.** A literal default is the date it names, and `@default(now())` and `@updatedAt` are
  filled by drizzle as one instant.

[drizzle](../drizzle/README.md) says what the connection has to be for these to hold: the
session's time zone is UTC, which the check sets on each connection of its pool.
