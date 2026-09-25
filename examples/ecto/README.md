# ecto

A small shop, written by `hekireki-ecto` from `schema.prisma` into `lib/shop` and run against the
real Ecto on SQLite through `ecto_sqlite3`. The tables are the ones `prisma db push` creates; no
Ecto migration runs. Everything the generator writes into a schema is used by `check.exs`, not only
compiled.

```bash
pnpm install
cd examples/ecto
pnpm run demo
```

`lib/shop` is committed as `prisma generate` writes it, so what the schema becomes can be read here
without running anything. `demo` starts from nothing all the same: `prisma generate` writes
`lib/shop`, `prisma db push` creates `dev.db`, `setup` installs Hex and rebar3 if they are missing,
fetches the dependencies pinned in `mix.lock` into `deps/` and compiles with
`--warnings-as-errors`, so a warning Ecto raises about a generated schema (an association naming a
field that is not there, say) fails it. `mix run check.exs` then runs the checks and prints one
`ok:` line for each.

The versions are the newest that still run on Elixir 1.14: Ecto 3.13.6, `ecto_sql` 3.13.5,
`ecto_sqlite3` 0.17.6 and `exqlite` 0.37.0, which downloads a precompiled SQLite NIF (or builds it
with a C compiler where there is none for the platform). `decimal` is held at 3.1.1 over the 2.x
`ecto_sqlite3` asks for, which EEF-CVE-2026-32686 affects. Ecto 3.13 has no UUIDv7, so the schema
uses no `uuid(7)`.

## What the check asks

It opens with what running these schemas found in the generator, so none comes back:

| Found                                                                                                     | Asked of the generated schema                                                    |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A doc comment with `#{...}` became an interpolation in `@moduledoc`, and the schema did not compile       | the `@moduledoc` of `Shop.Keyword` is the comment, word for word                 |
| `references: [number]` on a key Ecto calls `:id` wrote `references: :number`, a field that is not there   | the schemas compile with `--warnings-as-errors`; a line item's order loads       |
| A key referencing a unique `String` was typed `:id`, and `has_many` read it by the primary key            | `gifts` and `gift_target` load through `references: :handle`                     |
| A `uuid()`-keyed schema's `@foreign_key_type :binary_id` reached a `belongs_to` of an integer key         | a wishlist and a product are saved with their account and category ids           |
| Both sides of a many-to-many of a model with itself read their own key from `A`                           | `alice.followers` and `bob.following` read `_Follows` as Prisma Client writes it |
| A self relation whose list side comes first was taken for a many-to-many                                  | a category's `children` and `parent` load                                        |
| A foreign key with a `@default` had none in Ecto                                                          | a new product is in category 1 before it is saved                                |
| `@default(now())` on a column that is not a timestamp stayed `nil` on the struct Ecto returned            | `at` and `placed_at` are on the struct `Repo.insert!` returns                    |
| `@default(uuid())` on a column that is not the key was left to a database that has no such default        | a wishlist's `share_token` is a UUID Ecto made                                   |
| A `BigInt` `autoincrement()` key was a plain field that Ecto never read back (in `example/schema.prisma`) | the unit tests; SQLite counts no `BigInt` key up (below)                         |

Then each thing the schema promises, as Ecto keeps it:

- **Types.** Int, BigInt beyond 2^53, Float, Decimal, Boolean, String with a newline and a
  backslash, DateTime, Json with nested lists and `nil`, and Bytes with a zero byte are written and
  read back. SQLite keeps a Decimal as a `REAL`, so 15 significant digits come back and 20 do not;
  that is the column, not the schema.
- **Defaults.** Literal defaults are on a new struct before it is saved: `0.0` for a Float the
  schema writes as `0`, a string with `#{name}` in it left alone, a DateTime literal, an enum
  member, a foreign key. A default the database fills from its clock is read back.
- **Keys.** An `autoincrement()` key is counted up by SQLite, a `uuid()` key and column are made by
  Ecto, a `cuid()` key has to be given (Ecto has no cuid, and the NOT NULL column refuses a row
  without one), and a key named `number` stored as `order_number` is `:id` with a `source:`.
- **Names.** `@@map` is the table, `@map` the column; `__meta__` is a column only, under the field
  `meta`; `type`, `end`, `do`, `fn`, `when`, `schema`, `changeset`, `rescue` and `in` are plain
  columns, read, written and queried.
- **Enums.** `Ecto.Enum` stores the `@map` value (`staff`) and the member's name where there is no
  `@map` (`ADMIN`), loads a row another client wrote, and refuses a value outside the enum.
- **Constraints.** Foreign keys are on for the connection `ecto_sqlite3` opens. `@unique` and a
  composite `@@unique` are a changeset error with `unique_constraint`; a composite primary key
  finds, refuses a second row and deletes one.
- **Associations.** `has_one`/`belongs_to` for a 1-1, `has_many` for a 1-n with two relations to
  one model kept apart, a tree and a thread of replies on themselves, and `many_to_many` through
  Prisma's `_ProductToTag`, the named `_Wished` and `_Follows`, with the `A` and `B` rows checked.
- **ON DELETE.** Left to the database, as Prisma wrote it: `Cascade` takes a profile, a wishlist,
  reviews and their replies; `SetNull` empties a parent, an account and a key that references a
  handle; `SetDefault` moves a product back to category 1; `Restrict` and `NoAction` refuse. SQLite
  names no constraint when it refuses, so `foreign_key_constraint/3` has nothing to match and the
  refusal is an `Ecto.ConstraintError`.
- **Timestamps.** `timestamps()` fills `created_at`/`updated_at`, `createdAt`/`updatedAt` and an
  `@updatedAt` alone (`changed_at`, with no inserted-at), and an update bumps each.

## Left out

- **A Json `@default`.** `prisma db push` writes it into SQLite's `CREATE TABLE` unquoted
  (`DEFAULT {"color": "none"}`), and SQLite refuses the table: a Prisma bug, not the generator's.
- **A `BigInt` `autoincrement()` key.** On SQLite `prisma db push` makes it `BIGINT NOT NULL
PRIMARY KEY`, which is not SQLite's row id, so nothing counts it up for any client. The generator
  writes it as `{:id, :id, autogenerate: true}`, which is what a server's `bigserial` needs.
- **A field named `nil`.** Prisma takes it and the schema compiles, and an update or a read works,
  but `ecto_sqlite3` reads the atom `nil` in an INSERT as a cell left to its default and refuses
  the row.
