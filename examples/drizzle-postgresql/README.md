# drizzle-postgresql

A `DateTime` in every column PostgreSQL has for one, in the schema `hekireki-drizzle` writes from
`schema.prisma` into `src/db/schema.ts`, with Prisma Client beside it on the same database.

```bash
pnpm install
docker compose -f examples/compose.yaml up -d postgres
cd examples/drizzle-postgresql
pnpm run demo               # or DRIZZLE_DATABASE=postgresql://… pnpm run demo
```

`src/db/schema.ts` is committed as `prisma generate` writes it. `demo` writes it again with Prisma
Client, makes the tables in the database named `drizzle_dates` with `prisma db push`, type-checks
`check.ts` against both, and runs the checks in UTC and in `Asia/Tokyo`, printing one `ok:` line
for each.

## The columns

| Prisma                              | PostgreSQL       | drizzle                                           |
| ----------------------------------- | ---------------- | ------------------------------------------------- |
| `DateTime`                          | `timestamp(3)`   | `timestamp({ precision: 3 })`                     |
| `@db.Timestamp(6)`                  | `timestamp(6)`   | `timestamp({ precision: 6 })`                     |
| `@db.Timestamp(0)`                  | `timestamp(0)`   | `timestamp({ precision: 0 })`                     |
| `@db.Timestamptz(3)`                | `timestamptz(3)` | `timestamp({ withTimezone: true, precision: 3 })` |
| `@db.Date`                          | `date`           | `utcDate()`, generated                            |
| `@db.Time(3)`                       | `time(3)`        | `utcTime({ precision: 3 })`, generated            |
| `@db.Timetz(3)`                     | `timetz(3)`      | `utcTimetz({ precision: 3 })`, generated          |
| `DateTime[]`, `DateTime[] @db.Date` | arrays of them   | `.array()` on the column                          |

## What the checks hold it to

- **The table holds the same text from either client**, column by column as PostgreSQL prints it:
  `2030-01-02` in a date, `03:04:05.678` in a time, `03:04:05.678+00` in a `timetz`.
- **A date is UTC's.** 23:30 UTC is the day after in Tokyo, and the column holds the second of
  January from both clients, in a process in either zone.
- **Each client reads both rows as the same values**: a date as midnight UTC, a time of day on
  1970-01-01, as Prisma Client gives them.
- **An `=` on a date, a time or a `timetz`** finds both rows, from drizzle and from Prisma Client.
- **Defaults.** `@default(now())` on a date is today in UTC, a literal default is the date or the
  time it names, and `@default(now())` and `@updatedAt` are filled by drizzle as one instant.

[drizzle](../drizzle/README.md) says what the connection has to be for these to hold.
