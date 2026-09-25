# kysely

A record shop, written by `hekireki-kysely` from `schema.prisma` into one `DB` interface and run
against the real Kysely on SQLite, through better-sqlite3 as Kysely's `SqliteDialect` drives it.
Every table in `DB` is queried by `check.ts` under the name the interface gives it, every scalar is
written and read back, and each value is held to the type the interface declares for it.

```bash
pnpm install
cd examples/kysely
pnpm run demo
```

`src/db/types.ts` is committed as `prisma generate` writes it, so what the schema becomes can be
read here without running anything. `demo` starts from nothing all the same: `prisma generate`
writes `src/db/types.ts`, `prisma db push` creates `dev.db`, `tsc` type-checks `check.ts` against
the generated file, and `node check.ts` runs the checks and prints one `ok:` line for each.

## What the check asks

- **Scalars, as the driver has them.** better-sqlite3 binds numbers, strings, bigints, buffers
  and `null`, and reads back what SQLite keeps, so on SQLite the interface says: a `Boolean` is
  `number` (0 or 1), a `DateTime` is `string` (`CURRENT_TIMESTAMP` writes
  `YYYY-MM-DD HH:MM:SS`), a `Decimal` reads as `number` and binds as `number | string`, a
  `BigInt` reads as `number` and binds as `number | bigint`, a `Json` binds as its text and reads
  as `string | number`, since Prisma's `JSONB` column has numeric affinity and keeps a bare number
  as one, and `Bytes` is a `Buffer`. Each goes in and comes back; a `BigInt` past 2^53 is kept
  exactly, as better-sqlite3's `safeIntegers` reads it, though Kysely reads it as a number.
- **Defaults and keys.** A database default (`autoincrement()`, `now()`, a literal, an enum
  member) is `Generated<>` and may be left out of an insert; `uuid()` and `cuid()` are made by
  Prisma's client, so the column has no default and the insert gives the key; `@updatedAt` is
  Prisma's too, so an insert gives it and an update leaves it as it was.
- **Names.** Tables and columns go by their `@@map` and `@map` names, the ones Kysely queries by;
  a table named `shop settings` and a column named `last-modified` are quoted keys, and columns
  named `type`, `default`, `delete` and `constructor` are plain ones. An enum is the union of its
  database values, `@map` ones included: `rock 'n' roll` has its apostrophe escaped.
- **Constraints.** `@unique`, the `@@unique` pair of a review, the composite primary key of an
  order line, and a foreign key to an owner that is not there are each refused by the database.
- **Relations and `onDelete`.** A self relation (`SetNull`), a one-to-one (`Cascade`), a
  one-to-many under `Restrict`, an ordered record held by `NoAction`, order lines taken by
  `Cascade`, an order passed to the shop's account by `SetDefault`, and the two implicit
  many-to-many tables, `_RecordToTag` and the named `_Wishlist`, joined both ways.
- **What the types refuse.** The end of `check.ts` is for the compiler alone: type equalities for
  the columns above, and `@ts-expect-error` on queries that must not compile: a required column
  left out, `true` for a `Boolean`, a `Date` for a `DateTime`, Prisma's name for an enum member
  where the database has its `@map` value, a model's name where the table has its `@@map` name, an
  object for a `Json`, and a relation field selected as a column.

`check.ts` turns on `PRAGMA foreign_keys`: SQLite enforces a foreign key only on a connection
that asks, and Prisma's client asks where a plain better-sqlite3 connection does not.

## Left out

The generated file names its own types `DB`, `Generated`, `Timestamp` and `ColumnType`, and
refers to the globals `Buffer` and, off SQLite, `Date`: a model or enum named one of those
shadows or merges with it, so the schema here has none. A field marked `@ignore`, a model marked
`@@ignore`, and an `Unsupported(...)` column are not in what Prisma hands a generator, so their
columns are missing from the interface although the tables have them.
