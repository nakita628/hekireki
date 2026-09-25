# eloquent

A small shop, written by `hekireki-eloquent` from `schema.prisma` into `app/Models` and run against
the real Eloquent (`illuminate/database`) on SQLite. The tables are the ones `prisma db push`
creates; no Laravel migration runs. Everything the generator writes into a model is used by
`check.php`, not only loaded.

```bash
pnpm install
cd examples/eloquent
pnpm run demo
```

`app/Models` is committed as `prisma generate` writes it, so what the schema becomes can be read
here without running anything. `demo` starts from nothing all the same: `prisma generate` writes
`app/Models`, `prisma db push` creates `dev.db`, `composer install` puts the packages pinned in
`composer.lock` in `vendor/`, `php -l` reads every generated file and the check, and
`php check.php` runs the checks and prints one `ok:` line for each.

PHP 8.2 or newer is needed, with `pdo_sqlite`. Eloquent is `illuminate/database` 12 without the
rest of Laravel, so `composer.json` asks for what a Laravel application would bring along and the
generated models need: `ramsey/uuid` for the `uuid()` keys `HasVersion4Uuids` makes and
`symfony/uid` for the `ulid()` keys. `check.php` opens the database through Eloquent's `Capsule`
with `foreign_key_constraints` on, as Laravel's SQLite connection does by default.

## What the check asks

It opens with what running these models found in the generator, so none comes back:

| Found                                                                                                                  | Asked of the generated model                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| An enum value with an apostrophe (`@map("it's fine")`) ended the PHP string, and `Mood.php` did not parse              | `php -l` reads every file; the row holds `it's fine`                           |
| A doc comment with `*/` in it ended the docblock, and `Keyword.php` did not parse                                      | the class's docblock has the comment, `*/` written `*\/`                       |
| A self relation whose list side comes first was taken for a many-to-many through a `_Tree` table that does not exist   | a category's `children` and `parent` load                                      |
| Both sides of a many-to-many of a model with itself read their own key from `A`                                        | `alice->followers` and `bob->following` read `_Follows` as Prisma Client wrote |
| A composite primary key was `$primaryKey = null`: `delete()` threw, and `save()` could not name the row                | one line item is updated and deleted, the other left as it was                 |
| A `cuid()` key was not fillable: `create(['id' => ...])` dropped it, and the insert failed on the NOT NULL key         | a coupon is created with the key it is given                                   |
| No literal default was on a new model: `new Account()` had no `role`, and `create()` returned one without `active`     | a new product, account and order carry each default before they are saved      |
| `HasUlids` makes a ULID in lower case, Prisma Client in upper: one column would hold both, and SQLite compares by case | a tag's key is 26 upper-case Crockford characters                              |

Then each thing the schema promises, as Eloquent keeps it:

- **Tables and columns.** Every model names a table `prisma db push` made, and every column of it
  is fillable, the key, or a timestamp: nothing is named that is not there, and nothing there goes
  unsaid.
- **Types.** Int, BigInt beyond 2^53, Float, Decimal, Boolean, String with a newline, DateTime,
  Json with nested lists and `null` (in a column named `attributes`, the property Eloquent keeps a
  model's columns in), and Bytes with a zero byte are written and read back through the casts.
- **Defaults.** Literal defaults are on a new model before it is saved, as the database holds
  them: `0.0` for a Float the schema writes as `0`, a string with quotes and a backslash, a
  DateTime literal, an enum member's `@map` value, a foreign key. A default the database fills from
  its clock is there once the row is read again.
- **Keys.** An `autoincrement()` key is counted up by SQLite and read back, a `uuid()` key is made
  by `HasVersion4Uuids` and a `ulid()` key by `HasUlids`, a `cuid()` key has to be given (Eloquent
  has no cuid), and a key named `number` stored as `order_number` is the model's `$primaryKey`.
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
  `SetDefault` moves a product back to category 1; `Restrict` and `NoAction` refuse, as a
  `QueryException`.
- **Timestamps.** `created_at`/`updated_at` under `@map`, `createdAt`/`updatedAt` as Prisma names
  them, and an `@updatedAt` alone (`changed_at`, with `CREATED_AT = null`) are filled, and an
  update bumps each; a model with neither has `$timestamps = false`.

## Left out

- **A Json `@default`.** `prisma db push` writes it into SQLite's `CREATE TABLE` unquoted, and
  SQLite refuses the table: a Prisma bug, not the generator's.
- **`find()` on a composite key.** Eloquent has no composite key: the first column stands for it,
  so `find()` takes that column alone. An update, a delete and a refresh name every column of it.
- **A column named `exists`, `incrementing` or `timestamps`.** Eloquent keeps public properties
  under those names, and `$model->exists` answers with the property, not the column.
