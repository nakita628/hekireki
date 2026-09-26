# sea-orm

A small blog, written by `hekireki-sea-orm` from `schema.prisma` into `src/entities` and run
through the real SeaORM 1.1 (sqlx) on SQLite, and on PostgreSQL and MySQL. The tables are the ones
`prisma db push` creates; no SeaORM migration runs. The schema has a `DateTime` in each place a
Prisma schema puts one, and Prisma Client shares the database: each reads what the other wrote.

```bash
pnpm install
cd examples/sea-orm
pnpm run demo

docker compose -f ../compose.yaml up -d postgres mysql
pnpm run demo:postgresql       # or SEA_ORM_DATABASE=postgresql://… node provider.ts postgresql
pnpm run demo:mysql
```

`src/entities` is committed as `prisma generate` writes it, so what the schema becomes can be read
here without running anything. `demo` starts from nothing all the same: `prisma generate` writes
`src/entities` and the Prisma Client in `generated/client`, `prisma db push` creates `dev.db`,
`cargo fmt --check` and `cargo clippy -D warnings` read the entities and the check, and `run.ts`
runs, once with the process in `Asia/Tokyo` and once in UTC, `cargo run -- check` (SeaORM alone),
`node interop.ts` (Prisma Client reads what SeaORM wrote and writes rows of its own) and
`cargo run -- interop` (the entities read those). Each prints one `ok:` line per check.

`demo:postgresql` and `demo:mysql` do the same on the database of `examples/compose.yaml` named
`sea_orm`: `provider.ts` writes `schema.prisma` again under `.provider/` with that provider and
the native types the `// postgresql:` and `// mysql:` comments name, generates the entities there,
pushes the tables, and builds the check with `--features postgresql` (or `mysql`), which
`src/lib.rs` reads to take the entities from `.provider/`.

Rust 1.85 or newer is needed. Besides `sea-orm` and `serde`, the entities use `chrono` and
`async-trait` (a `now()` default or an `@updatedAt`) and `uuid` (a `uuid()` key), as
`Cargo.toml` lists.

## How a DateTime is kept

As Prisma Client keeps it, on every provider and in any process time zone:

- **`now()` and `@updatedAt`** are filled by the entity's `ActiveModelBehavior::before_save`, not
  by the database: the current UTC time truncated to milliseconds, `now()` on insert when the
  field was left unset, each `@updatedAt` (an optional one too) on every save that did not set it.
  A literal default (`@default("2020-01-01T00:00:00Z")`) is filled on insert the same way.
- **SQLite** holds the instant as text, which it compares and sorts as text. Prisma writes
  `2030-01-02T03:04:05.000+00:00`; sqlx writes a `DateTimeUtc` without the `.000` on a whole
  second, so a filter or a key would miss Prisma's rows. On SQLite every `DateTime` is a
  `PrismaDateTime`, a type `prisma_date_time.rs` beside the entities defines: it wraps a
  `DateTimeUtc` and binds Prisma's text. **Filter with it**,
  `Column::StartsAt.eq(PrismaDateTime(instant))`: a bare `DateTimeUtc` is bound as sqlx writes
  it.
- **PostgreSQL and MySQL**: a `DateTime` (`timestamp(3)`, `datetime(3)`) is chrono's
  `NaiveDateTime` in UTC, as Prisma reads and writes it; write `instant.naive_utc()`. A
  `@db.Timestamptz` is `DateTimeWithTimeZone`, a MySQL `@db.Timestamp` is `DateTimeUtc` (sqlx
  opens MySQL's session at `+00:00`, as Prisma's adapter does), `@db.Date` is `Date` (the UTC
  date) and `@db.Time` is `Time` (the UTC time). A PostgreSQL `DateTime[]` is `Vec<DateTime>`.
- **`@db.Timetz`** is refused by the generator: sqlx has no Rust type to read a `timetz` into.
  Use `@db.Time` or `@db.Timestamptz`.

## What the check asks

- `now()`, `@updatedAt` (two, and an optional one) and a literal default are filled on insert, in
  UTC with milliseconds, and an update bumps each `@updatedAt` and keeps `now()`.
- A row is found by the `DateTime` in its `@@id`, and by a `@unique` `DateTime`, to the
  millisecond and to the whole second, whichever client wrote it.
- An optional `DateTime` sorts the rows of both clients in time order and is found by its instant.
- Each native type (`Clock`) reads back as it was written, a `@db.Timestamp(6)` with its
  microseconds, and Prisma Client's row of the same instants reads as SeaORM's own.
