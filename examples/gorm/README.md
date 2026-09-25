# gorm

A blog with an address book around it, and a model holding one column of every scalar type,
written by `hekireki-gorm` from `schema.prisma` and run against the real GORM on SQLite. GORM never
creates a table here: `main.go` reads and writes every generated struct on the tables
`prisma db push` made, through the table and column names the generator gave it.

```bash
pnpm install
cd examples/gorm
pnpm run demo
```

`models/models.go` is committed as `prisma generate` writes it, so what the schema becomes can be
read here without running anything. `demo` starts from nothing all the same: `prisma generate`
writes `models/models.go`, `prisma db push` creates `dev.db`, `gofmt -l` and `go vet` read the
generated file and the check, and `go run .` runs the checks and prints one `ok:` line for each.
The driver is `github.com/glebarez/sqlite`, pure Go, so the check builds with `CGO_ENABLED=0`; Go
1.23 or newer is needed, and the modules are pinned in `go.mod` and `go.sum`.

## What the check asks

It opens with the schema itself: every struct names a table Prisma made, and the columns GORM
would read and write are exactly the columns of that table, no more and no fewer.

Then each thing the schema promises, as GORM keeps it:

- **Scalars.** `Int`, `BigInt` past 2^53, `Float`, `Decimal`, `Boolean`, `String` with quotes, a
  backslash and a semicolon, `DateTime`, `Json`, `Bytes` and an enum read back as they were
  written; each optional one left `nil` is `NULL` in the table and `nil` again when read. Field
  names that are Go keywords (`type`, `func`, `range`, `map`, `select`), initialisms (`userID`,
  `URL`, `html_body`, `websiteURL`) and `tableName`, a method GORM calls, are plain columns.
- **Defaults.** A field left out takes the schema's default, the `@map`ped value of an enum member
  included (`member`, not `MEMBER`); a zero value set on purpose (`false` under `@default(true)`,
  `""` under `@default("untitled")`, `0` under `@default(9.99)`) is stored as it is. `now()` is
  filled on create, and `@updatedAt` is bumped by an update while `createdAt` stays.
- **Keys.** Autoincrement keys come back into the struct; `uuid()`, `cuid()`, `cuid(2)` and
  `nanoid(8)` are made in Go before the insert, one per row, and a key given by hand is kept; a
  composite primary key finds one row, refuses a second `(a, b)` as `gorm.ErrDuplicatedKey` and
  deletes one row.
- **Constraints.** `@unique` and `@@unique([postId, slot])` refuse a second row as
  `gorm.ErrDuplicatedKey`, the pair and not either half; a foreign key to nothing is
  `gorm.ErrForeignKeyViolated`.
- **Relations.** Each loads with `Preload` from both sides: a 1-1 whose key (`ownerId`) is not the
  one GORM would guess from the field (`user`); 1-n on the primary key, on a unique column that is
  not the key (an audit log names its user by email) and on a primary key that is not `id` (a
  country by its code); a self relation for replies; an explicit many-to-many through `Follow`,
  two relations to the same model; and an implicit many-to-many through Prisma's own `_PostToTag`,
  columns `A` and `B`, whose rows the check also reads with SQL and removes one of with
  `Association("Tags").Delete`.
- **onDelete and onUpdate.** `Cascade` takes a user's profile and follows, and a post's comments
  and join rows; `SetNull` empties a post's author and a reply's parent; `SetDefault` hands a
  deleted category's posts to category 1; `Restrict` and `NoAction` refuse to delete an owner with
  children; `onUpdate: Cascade` carries a changed email into the audit log.

`main.go` opens the connection with two things GORM leaves to the application: foreign keys, which
SQLite turns on per connection (`_pragma=foreign_keys(1)`), and `TranslateError`, which turns the
driver's constraint codes into GORM's errors. It passes `models.NamingStrategy`, which the
generator writes when the schema has an implicit many-to-many: under GORM's default naming,
`_PostToTag` would be looked for as `_post_to_tags` and its columns as `a` and `b`.

## Left out

- A `BigInt` autoincrement key: on SQLite Prisma writes it as `BIGINT PRIMARY KEY`, which is not the
  rowid, so the database never fills it and the first insert fails whatever the ORM.
- An implicit many-to-many from a model to itself: which of the two fields Prisma puts in column
  `A` is not something the generator can tell from the schema yet, so both sides would read the
  same column.
- `Decimal` is a `float64` in the generated struct, so the check uses values a `float64` holds
  exactly.
- The driver reports `Restrict` as a trigger constraint (SQLite's code 1811) rather than a foreign
  key one, so `TranslateError` leaves it untranslated; the check reads the message for that one.
