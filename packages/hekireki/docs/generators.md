# Generators in detail

What each generator writes beyond the schema's shape, and what it leaves to the caller. The
[README](https://github.com/nakita628/hekireki#readme) lists the generators and their options; this
page is the rest.

Every ORM generator stores a `DateTime` as Prisma Client stores it, so that the ORM and Prisma
read each other's rows alike. What that takes differs per ORM, and each section says what it does.

## Drizzle

On MySQL, `hekireki-drizzle` reads and writes a `@db.Timestamp` column as UTC, and MySQL converts
a `TIMESTAMP` through the connection's `time_zone`. Set it to `'+00:00'` on drizzle's connection,
as Prisma's adapter does on its own, or the two see times that differ by the offset.

On CockroachDB it writes the PostgreSQL schema, for node-postgres, and an `Int` key with
`@default(sequence())` is an identity column, as Prisma makes it. Keep the session's `TimeZone` at
UTC there, as on PostgreSQL, for a `dbgenerated("CURRENT_TIMESTAMP")` default to be UTC.

## Kysely

`hekireki-kysely` writes one `DB` interface, each column typed as the driver of the datasource
reads and binds it: better-sqlite3 on SQLite, pg on PostgreSQL, mysql2 on MySQL. Kysely converts
nothing and runs no hook, so what the types cannot say is the caller's:

- On SQLite a `DateTime` is text, compared as text: write it as Prisma does,
  `date.toISOString().replace('Z', '+00:00')`, or `=`, `@unique` and `@@id` do not meet Prisma's
  rows. A `DateTime` with `now()` or a literal default is asked for on insert there, as Prisma
  Client writes it itself: SQLite's own default is other text (`CURRENT_TIMESTAMP` sorts before
  Prisma's rows, and Prisma reads the literal as an Invalid Date).
- pg and mysql2 read a column without a zone in the process's zone, Prisma in UTC: set pg's type
  parsers 1114, 1082, 1115 and 1182 to UTC with `pg.defaults.parseInputDatesAsUTC = true`, and
  give mysql2 `timezone: 'Z'`. MySQL refuses ISO text with a `Z`; write a `Date` or MySQL's
  `2030-01-02 03:04:05.678901`.
- `@db.Time` and `@db.Timetz` are `string`, the time of day the drivers read.
- `@updatedAt` is asked for on insert, optional or not, and must be set on every update.

`examples/kysely` in the repository runs a schema against Kysely on SQLite.

## Django

`hekireki-django` keeps a `DateTime` as Prisma Client keeps it:

- A column without a zone is declared with the `UtcDateTimeField` written into `models.py`. It
  stores the UTC instant (on SQLite Prisma's text, `2030-01-02T03:04:05.678+00:00`) and reads it
  back as UTC, aware under `USE_TZ = True` and in `TIME_ZONE` under `False`. A `@db.Timestamptz`
  is Django's own field.
- `now()` is filled in by the model, in UTC (the UTC date or time on `@db.Date` and `@db.Time`),
  and a literal default on a date or time column is its UTC date or time.
- An `@updatedAt` on a date or time column stamps the UTC date or time (`UtcDateField`,
  `UtcTimeField`) where Django's `auto_now` would take the local one. A model with `@updatedAt`
  is managed by `AutoNowQuerySet`, so `QuerySet.update()` bumps it as `updateMany` does.

Keep `USE_TZ = True`, Django's default: with `False`, Django sets a PostgreSQL session to
`TIME_ZONE`, and a `dbgenerated()` default such as `CURRENT_TIMESTAMP` is evaluated in that zone.

## Exposed

`hekireki-exposed` keeps a `DateTime` as Prisma Client keeps it, with no conversion through the
JVM's zone: an `Instant` bound and read as the UTC instant, to the millisecond (a finer value is
truncated, as a JavaScript Date holds it, in every native type), the UTC date of a `@db.Date`, the
UTC time of a `@db.Time`, and a `@db.Timetz` at offset zero.

`now()`, literal defaults and every `@updatedAt` are filled in by the client on a DAO or DSL
insert, and the DAO bumps `@updatedAt` on update. A DSL `Table.update` has no such hook, so set it
there yourself: `it[updatedAt] = Instant.now()`.

pgjdbc sets the session to the JVM's zone, so open the connection in UTC, as Prisma's is, for a
`dbgenerated("CURRENT_TIMESTAMP")` default or `now()` in SQL:

```kotlin
Database.connect(url, setupConnection = { it.createStatement().use { s -> s.execute("SET TIME ZONE 'UTC'") } })
```

## EF Core

`hekireki-efcore` stores a `DateTime` as Prisma Client does, whatever its `DateTimeKind`: the UTC
instant (a `Local` value converted), read back as `Utc`, in Prisma's text form on SQLite, and
`now()` filled in by EF Core rather than by the database's clock. It takes Npgsql's legacy
timestamp behaviour to be off.

On MySQL, compare a `@db.Time` column with a parameter rather than a constant:
MySql.EntityFrameworkCore writes a constant `TimeSpan` as `TIME '03:04:05'`, without its fraction.

## SeaORM

`hekireki-sea-orm` writes one entity per model into a directory, with a `mod.rs` and a
`prelude.rs`. A `DateTime` is kept as Prisma Client keeps it:

- `now()`, `@updatedAt` and a literal default are filled by `ActiveModelBehavior::before_save`, in
  UTC with milliseconds, so the crate needs `chrono` and `async-trait` beside `sea-orm`.
- On SQLite every `DateTime` is a `PrismaDateTime` (written into `prisma_date_time.rs`), which
  binds Prisma's text, `2030-01-02T03:04:05.000+00:00`: filter with
  `Column::At.eq(PrismaDateTime(instant))`, not a bare `DateTimeUtc`, which sqlx writes without
  the `.000` of a whole second.
- On PostgreSQL and MySQL a `DateTime` is a `NaiveDateTime` in UTC, `@db.Timestamptz` a
  `DateTimeWithTimeZone`, a MySQL `@db.Timestamp` a `DateTimeUtc`. `@db.Timetz` is refused: sqlx
  has no type to read it into.

`examples/sea-orm` in the repository runs a schema against SeaORM on SQLite, PostgreSQL and MySQL.

## Atlas

`hekireki-atlas` writes the tables as Prisma Migrate makes them, so that `atlas schema diff`
against a database Prisma made has nothing to change. Its `schemaName` is `public` unless given
(`main` on SQLite): on MySQL, where the schema is the database, give the database's name.

## OpenAPI

`hekireki-openapi` writes the OpenAPI 3.1 document that Atlas's `openapi.tmpl` writes for the
database Prisma Migrate makes, so the two can be set side by side: `components.schemas` holds one
schema per table, under the table's name, with the columns as properties under their database
names and the NOT NULL ones in `required`. Without `paths` the document has none: it is what an
API's own document refers to, `$ref: "./openapi.yaml#/components/schemas/users"`.

```prisma
generator Hekireki-OpenAPI {
  provider = "hekireki-openapi"
  output   = "generated/openapi.yaml"
  title    = "Blog API"
  version  = "1.0.0"
  paths    = true
}
```

- `output` is the file, or a directory for `openapi.yaml` in it; `.yaml` and `.yml` are written as
  YAML, `.json` as JSON. `title` and `version` fill `info` (`Generated from schema.prisma` and
  `1.0.0` otherwise).
- A column is an `integer` (`Int`, `BigInt`), a `boolean` or a `string`, a `DateTime` one of
  format `date-time`, as the template reads them; an enum is a `string` over the values the
  database stores, a list a nullable `array`. A nullable column has `"null"` beside its type.
- A literal `@default` is the `default`, an enum member by the value stored; one the database or
  the client computes (`autoincrement()`, `now()`, `uuid()`, `dbgenerated(...)`) shows no value.
- The `description` of a table is the prose of the model's `///` comment, then a line per foreign
  key as the template writes it, `FK posts_author_id_fkey: (author_id) -> users`, with the name
  Prisma Migrate gives the key. A column's `description` is the prose of its field's comment; the
  lines a validation generator reads (`@z.`, `@v.`, …) are left out of both.
- The join table of an implicit many-to-many follows the models, as Prisma Migrate makes it:
  `_PostToTag` with `A` and `B` and a foreign key each.
- `paths` writes the CRUD of each model, one convention for all of them. The resource is the
  model's name as a plural noun in kebab-case, `/users`, `/order-items`, `/categories` (a number is
  appended where two models would share one): `GET` and `POST /{resource}` for the rows, and
  `GET`, `PATCH` and `DELETE /{resource}/{key}` for one, with a path parameter per field of the key
  (`@id`, or `@@id`, or the first `@@unique`; a model with none has the first two only), named as
  the field is, `/follows/{followerId}/{followingId}`. The operations are `listOrderItems`,
  `createOrderItem`, `getOrderItem`, `updateOrderItem` and `deleteOrderItem`, tagged `OrderItem`.
  A `POST` takes `{table}_create`, in which the NOT NULL columns without a `@default` are required,
  `@updatedAt` aside; a `PATCH` takes `{table}_update`, in which nothing is. Both follow the table
  under `components.schemas`. A row read, made or changed is answered with the table's schema, a
  missing one with `404`, a deleted one with `204`. There is no paging, filtering or error schema:
  those are the API's own to add, which is why the option is off unless asked for. A join table
  has no paths.
