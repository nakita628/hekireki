# sqlalchemy

A small shop written by `hekireki-sqlalchemy` from `schema.prisma` and run against the real
SQLAlchemy 2.1 on SQLite. The schema is written as a Prisma schema is written, with a corner of the
language in each model, and `check.py` makes no table of its own: it compares the generated
metadata with the tables `prisma db push` made, then uses every column, key and relationship on
them. mypy `--strict` reads the generated module and the check.

```bash
pnpm install
cd examples/sqlalchemy
pnpm run demo
```

`app/models.py` is committed as `prisma generate` writes it, so what the schema becomes can be read
here without running anything. `demo` starts from nothing all the same: `prisma generate` writes
`app/models.py`, `prisma db push` creates `dev.db`, `setup` makes a virtualenv in `.venv` and
installs the pinned `requirements.txt` (SQLAlchemy and mypy), `typecheck` runs mypy with
`mypy.ini`, and `verify` runs `check.py`, which prints one `ok:` line for each check and stops
with what it saw otherwise. Python 3.10 or newer is needed for SQLAlchemy 2.1.

## What the check asks

It opens with the metadata against the database, read through `inspect(engine)`:

- **Tables.** Every table Prisma made is mapped, the join tables `_Follows` and
  `_CategoryToProduct` among them, and nothing else.
- **Columns.** The same names, the same nullability, the same primary keys. Prisma's join table on
  SQLite has a unique index on `(A, B)` where the metadata has a primary key: the same promise.
- **Foreign keys.** The same columns and targets, with the `ON DELETE` and `ON UPDATE` Prisma
  wrote, including the ones it writes when the schema names none.
- **Unique and plain indexes.** `@unique`, `@@unique` and `@@index` by columns, the plain ones by
  the names Prisma gave them (`products_name_idx`, `orders_by_account`, `_Follows_B_index`).

Then each thing the schema promises, as the session keeps it. SQLAlchemy's warnings are errors in
this run, so a relationship that overlaps another or a join the mapper had to guess stops it:

- **Columns.** Every scalar type SQLite has round-trips: an `Int`, a `BigInt` past 2^53, a `Float`,
  a `Decimal`, a `Boolean`, a `String`, a `DateTime` to the millisecond, a nested `Json` and
  `Bytes` with NUL in them. Optional fields left out are `None` and NULL in the table; an optional `Json`
  set to `None` is NULL as well, not the JSON text `null`. Literal defaults are on the row, `now()`
  and `@updatedAt` are the clock in UTC, and `@updatedAt` is bumped on UPDATE.
- **Keys.** An `autoincrement()` key comes from the database, a `uuid()` key from the model. A
  `cuid()` key has no Python default (no maintained library makes one), so a row without an id
  stops at the flush instead of writing NULL. A composite `@@id` finds one row and refuses a
  second; `@unique` and `@@unique` refuse a duplicate, and two roots with a NULL parent share a
  name.
- **Names.** `@map` and `@@map` put Python's case over the database's names; `metadata`,
  `registry` and `class` become `metadata_`, `registry_` and `class_` over columns of their own
  name while `Account.metadata` stays the `MetaData`; `query` and `type` stay what they are; the
  `Order` table is quoted in every statement; an enum stores its `@map`ped values, under its
  `@@map`.
- **Relationships.** `back_populates` both ways for a 1-1, a 1-n, a self relation, an explicit
  many-to-many through `OrderLine` and Prisma's implicit one through `_CategoryToProduct`. A relation
  named `from` is `from_`. The self many-to-many `following` / `followers` writes its rows the way
  Prisma Client does: `ann.following.append(bob)` is the row `A = bob, B = ann`.
- **onDelete.** Each action through the session and in the database alone. `Cascade` deletes the
  order lines the session has loaded and leaves the rest to the database; `Restrict` and `NoAction`
  refuse, with the children loaded, instead of the session setting their key to NULL; `SetNull`
  nulls the reports of a manager; `SetDefault` hands a closed account's transfers to account 1.

## Dates

A `DateTime` is what Prisma Client makes of it: an aware `datetime` in UTC, whatever the time zone
of the process or of the database session, so a row either one writes reads back as the same
instant through the other. The module defines the types that do it, and `Base` maps a plain
`Mapped[datetime]` to the first:

- **`UtcDateTime`** on SQLite is the text Prisma writes, `2026-04-01T09:30:15.123+00:00`, to the
  millisecond. On PostgreSQL and MySQL it is a `timestamp(3)` or `DATETIME(3)` (or the precision a
  `@db.Timestamp(p)` or `@db.DateTime(p)` names) holding UTC. A naive value is taken as UTC.
- **`UtcDateTimeTz`** is a `@db.Timestamptz`: read back in UTC rather than the session's zone.
- **`UtcTimestamp`** is MySQL's `@db.Timestamp`, which the server shifts by the session's
  `time_zone`; `CONVERT_TZ` shifts it back on both sides.
- `@db.Date` and `@db.Time` are a `date` and a `time`: the UTC day and time of day of the instant.
- `now()` and `@updatedAt` take the process's clock in UTC, as Prisma Client does, not the
  database's `NOW()`, which is the session zone's wall time in a column without a time zone.

Nothing needs setting. A `dbgenerated()` default is SQL the database runs, in the session's zone,
for Prisma Client as for SQLAlchemy.

## What the schema leaves out

`Product.attributes` has no `@default("{}")`: Prisma 8.1 writes a `Json` default into SQLite's
DDL unquoted (`DEFAULT {}`), and `prisma db push` fails before anything is generated. SQLite has no
decimal type either: SQLAlchemy warns each time a `Decimal` goes through it, and `check.py` lets
that one warning through.
