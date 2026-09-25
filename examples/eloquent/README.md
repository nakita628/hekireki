# eloquent

A small shop, written by `hekireki-eloquent` from `schema.prisma` into `app/Models` and run against
the real Eloquent (`illuminate/database`) on SQLite, and on PostgreSQL and MySQL. The tables are the
ones `prisma db push` creates; no Laravel migration runs. Everything the generator writes into a model is used by
`check.php`, not only loaded, and Prisma Client shares the database: each reads what the other
wrote.

```bash
pnpm install
cd examples/eloquent
pnpm run demo

docker compose -f ../compose.yaml up -d postgres mysql
pnpm run demo:postgresql       # or ELOQUENT_DATABASE=postgresql://… node provider.ts postgresql
pnpm run demo:mysql
```

`app/Models` is committed as `prisma generate` writes it, so what the schema becomes can be read
here without running anything. `demo` starts from nothing all the same: `prisma generate` writes
`app/Models`, `prisma db push` creates `dev.db`, `composer install` puts the packages pinned in
`composer.lock` in `vendor/`, `php -l` reads every generated file and the checks, and the checks
run and print one `ok:` line each: `php check.php` on Eloquent alone, then `node interop.ts`, where
the Prisma Client the same `prisma generate` writes into `generated/client` reads what Eloquent
wrote and writes rows of its own, and `php interop.php`, where the models read those.

`check.php` runs twice: as Capsule alone, in UTC, which drops model events, and as a Laravel
application opens the connection, with an event dispatcher and `Asia/Tokyo` for the app's
timezone (`ELOQUENT_LARAVEL=1`; `bootstrap.php` holds both). `demo:postgresql` and `demo:mysql`
run the same four steps on the database of `examples/compose.yaml` named `eloquent`: `provider.ts`
writes `schema.prisma` again under `.provider/` with that provider, generates the models and the
client there (a model says per provider how it writes a DateTime), and pushes the tables. It
changes two things on the way, for bugs of `prisma db push` below. When the schema has changed
since the database was made, drop the database first.

PHP 8.2 or newer is needed, with `pdo_sqlite`, and `pdo_pgsql` and `pdo_mysql` for the other two. Eloquent is `illuminate/database` 12 without the
rest of Laravel, so `composer.json` asks for what a Laravel application would bring along and the
generated models need: `ramsey/uuid` for the `uuid()` keys `HasVersion4Uuids` makes and
`symfony/uid` for the `ulid()` keys, and `illuminate/events` for the dispatcher. `check.php` opens
the database through Eloquent's `Capsule`, on SQLite with `foreign_key_constraints` on, as
Laravel's SQLite connection does by default.

## What the check asks

It opens with what running these models found in the generator, so none comes back:

| Found                                                                                                                                                                               | Asked of the generated model                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| An enum value with an apostrophe (`@map("it's fine")`) ended the PHP string, and `Mood.php` did not parse                                                                           | `php -l` reads every file; the row holds `it's fine`                                                 |
| A doc comment with `*/` in it ended the docblock, and `Keyword.php` did not parse                                                                                                   | the class's docblock has the comment, `*/` written `*\/`                                             |
| An enum member `CLASS` became `case CLASS`, which PHP refuses: `Kind::class` is the enum's name                                                                                     | the member is `Kind::CLASS_`, stored as `CLASS`                                                      |
| A self relation whose list side comes first was taken for a many-to-many through a `_Tree` table that does not exist                                                                | a category's `children` and `parent` load                                                            |
| Both sides of a many-to-many of a model with itself read their own key from `A`                                                                                                     | `followers` and `following` read `_Follows` as Prisma Client's `connect` filled it                   |
| A composite primary key was `$primaryKey = null`, and `delete()` threw; the first column standing for it let `LineItem::destroy(1)` delete every line of order 1                    | a line item is found, updated and destroyed by an array of both columns; one column is refused       |
| A `cuid()` key was not fillable: `create(['id' => ...])` dropped it, and the insert failed on the NOT NULL key                                                                      | a coupon is created with the key it is given                                                         |
| No literal default was on a new model: `new Account()` had no `role`, and `create()` returned one without `active`                                                                  | a new product, account and order carry each default before they are saved                            |
| `HasUlids` makes a ULID in lower case, Prisma Client in upper: one column would hold both, and SQLite compares by case                                                              | a tag's key is 26 upper-case Crockford characters, Eloquent's and Prisma's                           |
| Bytes were bound as a string, so SQLite kept TEXT, and Prisma Client refused to read the column as bytes                                                                            | the avatar is a BLOB, and Prisma Client reads its bytes                                              |
| A DateTime was written `2030-01-01 09:30:00`, and Prisma Client writes `2030-01-01T09:00:00.000+00:00`: SQLite sorts text, so `orderBy` put the later row first                     | three rows written by both sort in time order                                                        |
| A DateTime was written `…09:00:00.000Z` on SQLite, and Prisma Client writes `…09:00:00.000+00:00`: SQLite compares the text, so `where: { releasedAt }` found no row Eloquent wrote | Prisma Client finds a product by the DateTime Eloquent wrote                                         |
| A `now()` default was left to SQLite's `CURRENT_TIMESTAMP`, `2030-01-01 10:00:00`: an order Eloquent placed after one Prisma Client placed the same day sorted before it            | `placed_at` is filled by the model in Prisma's form, and the two orders sort in time order           |
| A `uuid()` or `ulid()` that is not the key was made by neither trait, and the insert failed on the NOT NULL column                                                                  | an order's `public_id` and a wishlist's `share_token` are made on create; a value given is kept      |
| A model with no `@id` was keyed by `id`, a column it does not have, so an update or a delete reached nothing                                                                        | `store_setting` is keyed by its `@unique`, `exchange_rates` by its `@@unique` pair, column by column |
| A second `@updatedAt` was left to the caller, and the insert failed on the NOT NULL column                                                                                          | `synced_at` is stamped with `updated_at`, on insert and on update                                    |
| `model store_setting` became `class StoreSetting` in `store_setting.php`, which autoloading does not find                                                                           | the file is `StoreSetting.php`                                                                       |
| A Decimal came back from SQLite as a float, or an int where it had no fraction, and from PostgreSQL and MySQL padded to scale 30 (`12.340000000000000000000000000000`)              | the price is the string `'12.34'`, a rate of `10.00` the string `'10'`, as Prisma's Decimal prints   |
| On PostgreSQL and MySQL a DateTime was written `Y-m-d H:i:s` in the app's timezone: the milliseconds were lost, and under `Asia/Tokyo` the time was nine hours off                  | written in UTC with milliseconds, and read back as UTC where the table holds no zone                 |
| Bytes made `toJson()` throw: `json_encode` refuses bytes that are not UTF-8                                                                                                         | `toJson()` has the avatar in base64, as Prisma writes Bytes in JSON                                  |
| An enum's doc comment was dropped                                                                                                                                                   | `Mood` has its docblock                                                                              |

Then each thing the schema promises, as Eloquent keeps it:

- **Tables and columns.** Every model names a table `prisma db push` made, and every column of it
  is fillable, the key, or a timestamp: nothing is named that is not there, and nothing there goes
  unsaid.
- **Types.** Int, BigInt beyond 2^53, Float, Decimal, Boolean, String with a newline, DateTime,
  Json with nested lists and `null` (in a column named `attributes`, the property Eloquent keeps a
  model's columns in), and Bytes with a zero byte are written and read back through the casts.
  Bytes go through `AsBytes`, a cast written beside the models, which binds a stream so the column
  holds a BLOB, and Decimal through `AsDecimal`, which reads the string Prisma's Decimal prints. A
  DateTime goes through `PrismaDates`, a trait written beside the models, which writes it as Prisma
  Client does: in UTC with milliseconds, and on SQLite as ISO 8601 text, so the rows of both
  clients compare and sort as text in time order. One given with no zone is in the app's timezone,
  as Eloquent reads it; one the table holds with no zone is UTC, as Prisma reads it.
- **Defaults.** Literal defaults are on a new model before it is saved, as the database holds
  them: `0.0` for a Float the schema writes as `0`, a string with quotes and a backslash, a
  DateTime literal, an enum member's `@map` value, a foreign key. A `now()` is filled by the model
  as it saves, as Prisma Client fills it, not left to the table's clock.
- **Keys.** An `autoincrement()` key is counted up by SQLite and read back, a `uuid()` key is made
  by `HasVersion4Uuids` and a `ulid()` key by `HasUlids`, a `cuid()` key has to be given (Eloquent
  has no cuid), and a key named `number` stored as `order_number` is the model's `$primaryKey`. A
  `uuid()` or `ulid()` column that is not the key is made by the model's `save()`. A model with no
  `@id` is keyed by its `@unique`, or by its `@@unique` as by a composite key.
- **Composite keys.** Eloquent has none, so `$primaryKey` is null and a key of several columns is
  an array of each by name (`['order_number' => 1, 'product_id' => $id]`), the columns listed in
  `LineItem::KEY_COLUMNS`. `find()`, `findMany()`, `findOrFail()`, `whereKey()` and `whereKeyNot()`
  take one or a list of them through `CompositeKeyBuilder`, written beside the models, and so do
  `destroy()`, `getKey()` and `is()`; an update, a refresh and a delete name every column. A
  collection of them is a `CompositeKeyCollection`, which keys the models by the JSON of the key:
  Eloquent's own casts the array to the string `Array`, so `unique()` left one model of three and
  `find()` found none. Its `unique()`, `diff()`, `intersect()`, `only()`, `except()`, `find()`,
  `findOrFail()`, `fresh()` and `toQuery()` take a key as the query does. A key
  that leaves a column out (`LineItem::destroy(1)`, `find(['order_number' => 1])`) is an
  `InvalidArgumentException`: it would reach every line of the order.
- **Names.** `@@map` is the table and `@map` the column, and the models read and query them by
  those names; `type`, `class`, `function`, `match`, `list` and `static` are plain columns.
- **Enums.** A backed enum stores the `@map` value (`staff`, `it's fine`) and the case's name where
  there is no `@map` (`ADMIN`), loads a row another client wrote, and refuses a value outside the
  enum.
- **Constraints.** Foreign keys are on for the connection; `@unique` and a composite `@@unique` are
  a `UniqueConstraintViolationException`; a composite primary key refuses a second row.
- **Relations.** `hasOne`/`belongsTo` for a 1-1, `hasMany` for a 1-n with two relations to one
  model kept apart and one on a key that is not the primary (`references: [handle]`), a tree and a
  thread of replies on themselves, and `belongsToMany` through Prisma's `_ProductToTag`, the named
  `_Wished` and `_Follows`, with the `A` and `B` rows checked. A key of two columns has no relation
  method, which Eloquent cannot express; its columns stay plain.
- **ON DELETE.** Left to the database, as Prisma wrote it: `Cascade` takes a profile, a wishlist,
  reviews and their replies; `SetNull` empties a parent and a key that references a handle;
  `SetDefault` moves a product back to category 1 (not on MySQL, below); `Restrict` and `NoAction`
  refuse, as a `QueryException`.
- **Timestamps.** `created_at`/`updated_at` under `@map`, `createdAt`/`updatedAt` as Prisma names
  them, and an `@updatedAt` alone (`changed_at`, with `CREATED_AT = null`) are filled, and an
  update bumps each; a model with neither has `$timestamps = false`. A second `@updatedAt` takes the
  time Eloquent gives the first, and a save that changes nothing changes neither.

- **Prisma Client.** It reads every type Eloquent wrote (Decimal, BigInt, Json, DateTime, Bytes,
  an enum value with an apostrophe, an upper-case ULID) and the models read every type it wrote,
  milliseconds included, and the join tables its `connect` fills.

## What the generator refuses

What would give models that do not load, or load and do not do what they say, stops
`prisma generate` with the model or field named:

- a model or enum named after a word PHP keeps from a class (`List`, `Case`, `Match`), or two
  whose classes differ only by case (`user_role` and `UserRole`), which PHP takes for one class,
  or one named `AsBytes` beside a Bytes column, which is the cast's;
- a column named after a public property of `Model` (`exists`, `incrementing`, `timestamps`,
  `wasRecentlyCreated`, `preventsLazyLoading`, `usesUniqueIds`): `$model->exists` answers with the
  property, never the column;
- a relation named after a method of Eloquent's `Model` (`push`, `save`, `delete`, `query` and the
  rest; PHP matches method names without regard to case), which would redeclare it, or after
  another relation of its model but for case;
- a relation named after a column of its own model (`author` beside a key `@map("author")`), which
  `$model->author` would read as the column.

A model or enum that has the short name of a class the models use (`Model`, `HasMany`, `Str`) is
not refused: the models write Laravel's class in full (`\Illuminate\Database\Eloquent\Model`)
and the short name is the model's.

## Left out

- **A Json `@default`.** `prisma db push` writes it into SQLite's `CREATE TABLE` unquoted, and
  SQLite refuses the table: a Prisma bug, not the generator's.
- **An enum value with a quote or a backslash, on PostgreSQL and MySQL.** `prisma db push` writes
  `it's fine` into `CREATE TYPE` and `ENUM(...)` unescaped, and the statement fails; MySQL reads
  the backslash of `back\slash` as an escape, so the column holds `backslash` and the next push
  wants to change it. `provider.ts` writes them `it is fine` and `back/slash`.
- **`onDelete: SetDefault` on MySQL.** InnoDB refuses it, and Prisma writes it all the same;
  `provider.ts` leaves it out there.
- **Aggregates loaded onto a collection with a composite key.** `loadCount()` and
  `loadAggregate()` select and key the models by `getKeyName()`, which is null here. Count through
  the query (`withCount()`), or per model.
- **A query that binds a date.** `where('created_at', '>', $carbon)` binds the date in the
  connection's own format, not the one the models write on SQLite; compare against a string in
  Prisma's form, or order by the column.
