![img](https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/hekireki.png)

# Hekireki

**[Hekireki](https://www.npmjs.com/package/hekireki)** reads a [Prisma](https://www.prisma.io/)
schema and writes what the rest of the project needs from it: validation schemas, ORM models, an
OpenAPI document, an ER diagram and seed data. It also comes with a Studio for the schema and its
database.

## Installation

```bash
npm install -D hekireki
```

## Quick start

Add a generator block to `schema.prisma` and run `npx prisma generate`. `output` is required.

```prisma
generator Hekireki-Zod {
    provider = "hekireki-zod"
    output   = "./zod"
    type     = true  // Export TypeScript types
}
```

A `///` comment on a field can carry a line for a validation generator, which uses it as it is.
The prefix says which: `@z.` Zod, `@v.` Valibot, `@a.` ArkType, `@e.` Effect Schema, `@t.`
TypeBox, `@j.` AJV, `@p.` Pydantic, `@ar.` Active Record, `@ecto.` Ecto.

```prisma
model User {
    /// @z.email()
    /// @v.pipe(v.string(), v.email())
    email String @unique
}
```

The rest of a `///` comment, the prose without those lines, is written into the code each
generator emits, above the model, the field or the enum it documents, as a comment of that
language: JSDoc in TypeScript, docstrings in Python, `//` in Go, `///` in Rust, `<summary>` in C#,
KDoc in Kotlin, PHPDoc in PHP (a column's as its `@property` tag), `@moduledoc` and `#` in Elixir,
and `#` in Ruby (a column's as an entry `name:: prose` above the class) and in Atlas HCL.

## Generators

The `provider` of the generator block picks the output. Every option is optional.

### Validation schemas

| Provider            | Writes        | Options                                                             |
| ------------------- | ------------- | ------------------------------------------------------------------- |
| `hekireki-zod`      | Zod           | `type`, `relation`, `zod` (`"v4"`, `"mini"`, `"@hono/zod-openapi"`) |
| `hekireki-valibot`  | Valibot       | `type`, `relation`                                                  |
| `hekireki-arktype`  | ArkType       | `type`, `relation`                                                  |
| `hekireki-effect`   | Effect Schema | `type`, `relation`                                                  |
| `hekireki-typebox`  | TypeBox       | `type`, `relation`                                                  |
| `hekireki-ajv`      | AJV           | `type`, `relation`                                                  |
| `hekireki-pydantic` | Pydantic      | `relation`                                                          |

`type` also exports the TypeScript type of each schema; `relation` adds a schema per relation.

### ORM models

| Provider                | Writes                        | Options                                            |
| ----------------------- | ----------------------------- | -------------------------------------------------- |
| `hekireki-drizzle`      | Drizzle tables                |                                                    |
| `hekireki-kysely`       | Kysely `DB` interface         |                                                    |
| `hekireki-sqlalchemy`   | SQLAlchemy models             |                                                    |
| `hekireki-django`       | Django models                 |                                                    |
| `hekireki-activerecord` | Rails models                  | `locales`: directory of the translated messages    |
| `hekireki-gorm`         | GORM structs                  | `package` (`model`)                                |
| `hekireki-sea-orm`      | SeaORM entities               | `renameAll`: serde's `rename_all`                  |
| `hekireki-ecto`         | Ecto schemas                  | `app` (`MyApp`)                                    |
| `hekireki-eloquent`     | Eloquent models               | `namespace` (`App\Models`)                         |
| `hekireki-efcore`       | EF Core entities, `DbContext` | `namespace` (`Models`), `context` (`AppDbContext`) |
| `hekireki-exposed`      | Exposed tables                | `package` (`models`), `dao` (`true`)               |

Every ORM generator stores a `DateTime` as Prisma Client stores it, so the ORM and Prisma read
each other's rows alike.

On MySQL, `hekireki-gorm` gives a `String` with no native type `VARCHAR(191)`, the column Prisma
Migrate creates, whatever `mysql.Config{DefaultStringSize}` says, a `uuid()` or `ulid()` key
included. The next `AutoMigrate` alters a column an earlier one made `longtext`, `varchar(n)` or
`char(36)` to it, which fails (or, outside strict mode, cuts the value) on a value longer than 191
characters: check with `SELECT MAX(CHAR_LENGTH(column))` first, and give a field that holds longer
values `@db.Text`.

`hekireki-gorm` also gives a native type the column Prisma Migrate makes for it: `uuid` for a
PostgreSQL or CockroachDB `@db.Uuid` (not `char(36)`), `int unsigned` and the like for MySQL's
unsigned types, `decimal(65,30)` for a MySQL `Decimal`. On a database an earlier `AutoMigrate`
made, the next one alters such a column, and the database refuses that while a foreign key points
at it or from it: drop the foreign keys, alter the key and its foreign key columns together, and
add the foreign keys back, or migrate with Prisma Migrate.

`hekireki-sqlalchemy` and `hekireki-django` give a `uuid()`, `cuid()`, `ulid()` or `nanoid()`
default the value Prisma Client would make, with a package from PyPI where Python's standard
library has none: `uuid6` for `uuid(7)`, `python-ulid` for `ulid()`, `cuid` for `cuid()`, `cuid2`
for `cuid(2)` (2.1 or later, for `create_id()`) and `nanoid` for `nanoid()` (and `types-nanoid`
for mypy). A module imports only the ones its schema uses. With such a default on a Django primary
key, `save()` on a new instance given an existing key inserts, as with `uuid()`: update with
`update_or_create()` or `save(force_update=True)`.

On PostgreSQL, `hekireki-django` writes a `Json @db.Json` field as Prisma Client does: the value
goes in as compact JSON text, which a `json` column keeps as given, key order included. Lookups and
key lookups on the column compare it as `jsonb`. The value on the other side of a comparison is not
cast, so these still fail: comparing two `@db.Json` columns with `F()`, filtering a whole
`Json[] @db.Json` list, and `distinct()`, `order_by()` or grouping on the whole column, since
`json` has no equality or ordering.

On PostgreSQL, hand the `MapEnums` of the `DbContext` `hekireki-efcore` writes to Npgsql:
`UseNpgsql(connectionString, AppDbContext.MapEnums)`, or `AppDbContext.MapEnums(builder)` on your
own `NpgsqlDataSourceBuilder` as well when you pass `UseNpgsql` the data source it builds. It maps
the enums, and it is also what reads a `Decimal` with no native type: that column is
`numeric(65,30)`, every value of which has 30 decimal places, and Npgsql refuses to read more than
the 28 of `System.Decimal` into a `decimal`, whatever the value ("Numeric value does not fit in a
System.Decimal"). For a schema with such a column (or a `@db.Decimal(p, s)` with `s` over 28) the
context carries a converter of its own, which `MapEnums` registers: the property stays a `decimal`
and reads what a `decimal` can hold of the value, the decimal places past the 28th rounded off, and
still fails on a value too large for it. The converter is written against `Npgsql.Internal`, the
API of Npgsql's own plugins, which Npgsql marks experimental (`NPG9001`; checked against Npgsql 10). With a
`DbConnection` passed to `UseNpgsql`, EF Core uses no data source and the converter is not
applied. `@db.Decimal(p, s)` with `s` up to 28 needs none of this. A Prisma `view` is mapped with
`ToView`, so `EnsureCreated()` and migrations leave it alone.

A Prisma `view` is the database's own, which Prisma Migrate never creates. `hekireki-django`
marks its model `managed = False` and a `ForeignKey` to or from it `db_constraint=False` (one from it also `on_delete=DO_NOTHING`), so `migrate`
leaves it alone. GORM and SeaORM have no way for a model to say it is a view: the struct or entity
`hekireki-gorm` and `hekireki-sea-orm` write says so in its comment, and is not to be passed to
`AutoMigrate` or `Schema::create_table_from_entity`. SeaORM 1.1 also writes a foreign key for every
`belongs_to`, so the entity of a model that points at a view says that its table is not to be
created with `Schema::create_table_from_entity` either.

### Database and documents

| Provider           | Writes                              | Options                                                                                         |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `hekireki-atlas`   | Atlas HCL                           | `schemaName` (`public`, `main` on SQLite)                                                       |
| `hekireki-openapi` | OpenAPI 3.1 (`.yaml`, `.json`)      | `title`, `version`, `paths`: the CRUD of each model                                             |
| `hekireki-er`      | ER diagram                          | `outputs`: files, one per extension (`.md`, `.dbml`, `.png`, `.svg`); `theme` (`light`, `dark`) |
| `hekireki-docs`    | Schema docs (`README.md`, diagrams) | `output`: the directory; `theme` (`light`, `dark`)                                              |
| `hekireki-seed`    | Schema module for `hekireki seed`   |                                                                                                 |

`hekireki-atlas` writes the tables as Prisma Migrate makes them, so `atlas schema diff` against a
database Prisma made has nothing to change. `hekireki-openapi` writes them as the
`components.schemas` Atlas's template writes, `///` comments as descriptions; with `paths`, each
model gets `GET` and `POST /users` and `GET`, `PATCH` and `DELETE /users/{id}`.

`hekireki-docs` writes the schema's docs into the directory `output` names: `README.md`, every
model with its fields, constraints, defaults, indexes, relations both ways, `CREATE TABLE` and
queries, and every enum, each described by its `///` comment; `er.svg`, the ER
diagram it opens with; and `tables/<Model>.svg`, one diagram per model with a relation, of the
model and the models it joins. The definitions are what `prisma migrate diff --from-empty` writes
for PostgreSQL, MySQL and SQLite. The queries (every row, how many, with the relations, one by its
key, a create, update and delete) are shown in Prisma Client beside the SQL they send, compiled by
the query compiler of the project's own `@prisma/client` (Prisma 7 or newer); without one, they
are shown as code. Nothing connects to a database for either.
[example/generated/docs](https://github.com/nakita628/hekireki/tree/main/example/generated/docs)
is such a directory.

Every generator keeps Prisma's names: a model or field without `@map` keeps the name it has in the
schema, and each ORM is told so where its own convention would say otherwise. Active Record and Ecto
take `///` lines of their own, described below.

### API

| Provider                    | Writes                                     | Options                                                                                |
| --------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `hekireki-zod-openapi-hono` | Hono app of the CRUD (`@hono/zod-openapi`) | `prisma` (`./prisma`), `auth` (`jwt`, `jwks`, `cloudflare-access`), `title`, `version` |

`hekireki-zod-openapi-hono` writes, in the directory `output` names, `openapi.yaml`: the CRUD of
each model, `GET` and `POST /users` and `GET`, `PATCH` and `DELETE /users/{id}`, with the rows as
Prisma Client reads them, fields under their Prisma names. It then runs the template of
[Hono Takibi](https://github.com/nakita628/hono-takibi) on it, `routeHandler`, which writes the
routes and their Zod schemas in one file (`routes.ts`), a file of `RouteHandler`s per model
(`handlers/`) and the app that registers each route with its handler (`index.ts`), and fills each
handler with the call to Prisma Client: `prisma.user.findMany()`, `create`, and `findFirst`,
`updateMany` and `deleteMany` by the key, answering 404 for a key no row has. The handlers import
`prisma` from the module `prisma` names, as the app entry sees it; that module exports the client:

```ts
// src/prisma.ts
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from './generated/prisma/client'

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})
```

`GET /users` answers a page: `limit` rows (20 by default, at most 100) after `offset`, in the
order of the key, and the number of rows in all in the `X-Total-Count` header. No request reads a
whole table.

A `POST` or a `PATCH` takes only the fields a client may write. A field the server fills is left
out: `@updatedAt`, and a `@default` the database or Prisma makes (`autoincrement()`, `now()`,
`uuid()`, `cuid()`, `ulid()`, `nanoid()`, `dbgenerated()`); a plain `@default("user")` is not. A
`///` line keeps any other field from the API: `@api.readonly` answers it and never takes it,
`@api.hidden` neither answers nor takes it, and every query omits it. Zod drops a field its schema
does not have, so a request that sends one changes nothing.

```prisma
model User {
  id           Int      @id @default(autoincrement()) // answered, never taken
  email        String   @unique
  /// @api.readonly
  role         String   @default("user")              // answered, never taken
  /// @api.hidden
  passwordHash String                                  // neither answered nor taken
  createdAt    DateTime @default(now())                // answered, never taken
}
```

A required field the API never takes and that has no `@default` (`passwordHash` above) leaves
`POST /users` unable to make a row: such a model is created by a handler of your own.

With `auth`, every operation asks for a token (`bearerAuth` in the document, `cloudflareAccess`
for `cloudflare-access`, and a 401 and a 403 among its answers), and the app entry runs `auth` on every model's paths, `app.use('/users/*', auth)`.
`auth.ts`, written when it is not there and left as it is after, checks the token; a handler reads
its payload with `c.get('jwtPayload')`. A guard of a model's paths that is not in the app entry is
added again when the generator runs.

| `auth`              | The token                                                                                            | Environment                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `jwks`              | Signed by an issuer with a key it publishes (RS256, PS256, ES256, EdDSA)                             | `JWKS_URI`, `JWT_ISSUER`, `JWT_AUDIENCE`   |
| `jwt`               | Signed with HS256 by a secret the app shares with the issuer                                         | `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE` |
| `cloudflare-access` | Put in `Cf-Access-Jwt-Assertion` by Cloudflare Access, signed with RS256 by a key the team publishes | `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`   |

Whatever the kind, a token passes only with the `iss` and `aud` named, and with an `exp`: Hono checks `exp`
only when a token has it, so `auth.ts` refuses one without it, which would never expire. A missing
variable fails every request with 500 rather than let one through.

With `jwt` and `jwks`, the API writes every model, so a valid token also has to hold the `admin`
role, in its `role` claim (a string or an array of strings), or it is answered 403. `REQUIRED_ROLES` and `ROLE_CLAIM` in
`auth.ts` say which roles and which claim (an identity provider may put roles under a claim of its
own, such as `https://example.com/roles`); an empty `REQUIRED_ROLES` lets any valid token through.

`jwks` is safer than `jwt`: the app holds no key that signs a token, and the issuer (an identity
provider such as Auth0, Clerk or Okta) rotates and revokes them. `JWKS_URI` is https
(http only on `localhost`); the keys are cached for ten minutes and fetched again for a `kid` the
cache lacks, at most once a minute.

`cloudflare-access` is for an app behind
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/), on Workers
or behind a Cloudflare Tunnel. `CF_ACCESS_TEAM_DOMAIN` is the team domain
(`https://<team>.cloudflareaccess.com`), the token's `iss`, and `CF_ACCESS_AUD` the application's
Application Audience (AUD) tag. The keys come from `<team domain>/cdn-cgi/access/certs`, cached as
with `jwks`. Access's token carries no role, since its policy decides who passes, so
`REQUIRED_ROLES` starts empty there. The signature is checked all the same, so a request that
reaches the app around Access (its `workers.dev` URL, the origin's own address) is refused. The
document names the header (`cloudflareAccess`) rather than a bearer token.

With `jwt`, `JWT_SECRET` is at least 32 bytes (`openssl rand -base64 48`), shared with nothing but
the issuer, and a token lives at most an hour from its `iat` (`MAX_TOKEN_LIFETIME_SECONDS` in
`auth.ts`). A token cannot be taken back before its `exp`; only a new secret ends every token.

An `auth.ts` written by a release before 0.52.0 lets through a token without `exp`, and does not
check `iss`, `aud` or a role. Delete it and run the generator to have the current one, then set the
variables above.

A handler that has a body is kept when the generator runs again, as Hono Takibi keeps it, so a
handler changed by hand stays as it is; only an empty one is filled. A `BigInt` is answered as a
number and `Bytes` as base64, which the handler encodes and decodes with `Buffer`. `hono-takibi`
is a peer dependency: `npm install -D hono-takibi`.

### Active Record

`hekireki-activerecord` writes `app/models` from the schema: `application_record.rb` and one model
per Prisma model, as a Rails developer would write them (and `prisma_date_time.rb` where a column
needs it). What Rails works out on its own (`table_name`, `class_name`, `foreign_key`,
`inverse_of` where the names follow its conventions) is left unsaid; what the schema promises is
written: `attribute` defaults, `enum`, timestamps, associations with `dependent:` from `onDelete`,
and validations from the columns (`presence`, `uniqueness`, `length`).

Rails' own inflections decide what is left unsaid: `has_many :event_data` of `EventData` names
the class, as Rails would look for `EventDatum`. A name Rails refuses is given another: a model
named after a constant Ruby or Rails has already loaded (`Monitor`, `Set`, `Data`) is written as
`MonitorRecord`, with its table named, and a relation named after a method Active Record defines
on a record (`attributes`, `errors`) becomes the association Rails would name after its class
(`contact_attributes`), or where that is the same name, one with the model's name before it
(`organization_errors`). A column whose attribute methods Active Record defines itself (`invalid`
for `invalid?`, `hash`, `class`) leaves those methods to Active Record and is reached through an
alias with `_value` after its name (`alias_attribute :invalid_value, :invalid`), which its
validations and translations name too; such an enum column is held to its values by an `inclusion`
validation instead of `enum`. Its messages name the alias ("Hash value can't be blank") unless an
`@ar.name` names the column.

A `/// @ar.` line on a field is a validator (`presence`, `length(maximum: 255)`) added to that
field's `validates`; on a model it is a Ruby line written into the class as it is
(`has_secure_password`, `has_many :tags, through: :post_tags`, `scope ...`). A message or name
given per locale, `message: { ja: "...", en: "..." }` or `@ar.name(ja: "...")`, goes to
`config/locales/models/<model>/<locale>.yml` under the key Rails reads. From `app/models` that
directory is the application's own; from anywhere else, `locales` has to name it, relative to
`output`.

```prisma
generator Hekireki-ActiveRecord {
    provider = "hekireki-activerecord"
    output   = "../app/models"
}

/// @ar.name(ja: "やること", en: "Todo")
model Todo {
  id        Int      @id @default(autoincrement())
  /// @ar.name(ja: "タイトル", en: "Title")
  /// @ar.presence(message: { ja: "を入力してください", en: "is required" })
  /// @ar.length(maximum: 255, too_long: { ja: "%{count}文字以内で入力してください", en: "must be %{count} characters or less" })
  title     String   @db.VarChar(255)
  completed Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("todos")
}
```

```ruby
# app/models/todo.rb
class Todo < ApplicationRecord
  attribute :completed, default: false

  validates :title, presence: true, length: { maximum: 255 }
end
```

```yaml
# config/locales/models/todo/ja.yml
ja:
  activerecord:
    models:
      todo: 'やること'
    attributes:
      todo:
        title: 'タイトル'
    errors:
      models:
        todo:
          attributes:
            title:
              blank: 'を入力してください'
              too_long: '%{count}文字以内で入力してください'
```

The tables stay Prisma's to create, so set `config.active_record.migration_error = false` and
create the test database with `prisma migrate deploy`.

A `DateTime` is stored as Prisma Client stores it:

- Every `@updatedAt` column is bumped, not only the one aliased to `updated_at`.
- A column holding fewer than three digits of a second (`@db.Timestamp(0)`, MySQL's bare
  `@db.DateTime`) is sent Prisma's milliseconds for the database to round (`precision: 3`), where
  Active Record would cut them off first.
- A `@db.Timetz` column is read as a time, not a String. Active Record still warns
  `unknown OID 1266` once as it reads the table's columns, before the declared type takes over.
- On SQLite every `DateTime` column is declared with `PrismaDateTime`, which writes Prisma's text
  (`2030-01-02T03:04:05.678+00:00`) so that comparisons, unique indexes and ordering see both
  clients' rows alike. On SQL Server a `@db.DateTime` or `@db.SmallDateTime` column is too: it
  sends milliseconds for the server to round to 1/300 s or to the minute as Prisma's are, where
  the adapter would round or cut them first. The type is generated into `prisma_date_time.rb`
  beside the models, so Zeitwerk loads it from wherever it loads them, whatever `output` is.
- On SQLite and SQL Server, whose `CURRENT_TIMESTAMP` is text of another shape or the server's
  local time, `now()` is filled in by the model.

Keep `config.active_record.default_timezone` at `:utc`, Rails' default: with `:local`, a
`timestamp` column is written in the process's zone and Prisma reads it as UTC.

`examples/active-record` in the repository runs a fuller schema against Active Record on SQLite,
and is the place to read what each thing becomes.

### Ecto

`hekireki-ecto` writes one `Ecto.Schema` module per model. A model with a `/// @ecto` line on it
or on one of its fields also gets a `changeset/2`:

- `cast` of every field it can write;
- `validate_required` of the required fields Prisma gives no default;
- a `unique_constraint` for each `@unique` and `@@unique`;
- a `foreign_key_constraint` for each foreign key;
- a `no_assoc_constraint` for each `has_one` or `has_many` whose rows the database will not let
  go of (`Restrict` or `NoAction` on delete, which Prisma makes of a required relation that names
  neither), so a refused delete is an error on the association.

Each constraint is named as the database reports it: Prisma's `<table>_<columns>_key` and
`_fkey`, cut to the database's limit in bytes as Prisma cuts them, or the `map:` given. On SQLite
a unique key takes the name Ecto derives itself, and a foreign key gets no constraint, since
SQLite names none when it refuses a row; with `relationMode = "prisma"` there is no foreign key in
the database to report.

A `/// @ecto.` line on a field is an `Ecto.Changeset` function that takes the field first, written
without the field: `validate_length(max: 50)`, or `validate_required(message: "...")` for a
message of the field's own. `unique_constraint(message: "...")` on a `@unique` field and
`foreign_key_constraint(message: "...")` on a foreign key give the constraint its message. On a
relation field, `assoc_constraint` (the side with the key) puts a missing row's error on the
association, and `no_assoc_constraint(message: "...")` on a `has_one` or `has_many` gives a refused
delete its message (or asks for one where the database cascades).

On a model, a line is a step of the pipeline written as it is (`validate_confirmation(:password)`);
`unique_constraint([:a, :b], message: "...")` on the fields of a `@@unique` gives that constraint
its message; `cast(empty_values: [])` hands its options to the changeset's `cast`; and a bare
`/// @ecto` asks for the changeset with nothing added. With empty values of the model's own, `""`
is a value, as it is to the column, so the required fields are checked by a `validate_not_null`
written into the module, which counts only `nil` as missing (`validate_required` would count `""`
too); a field's own `validate_required` line keeps Ecto's meaning. Ecto has no association for a
foreign key of several columns, so the constraints of one are `foreign_key_constraint`s with the
error on the relation's name.

```prisma
model User {
  id    Int     @id @default(autoincrement())
  /// @ecto.validate_required(message: "名前を入力してください")
  /// @ecto.validate_length(max: 50, message: "%{count}文字以内で入力してください")
  name  String
  age   Int?
  email String? @unique
}
```

```elixir
def changeset(user, attrs) do
  user
  |> cast(attrs, [:name, :age, :email])
  |> validate_required([:name], message: "名前を入力してください")
  |> validate_length(:name, max: 50, message: "%{count}文字以内で入力してください")
  |> unique_constraint(:email, name: "User_email_key")
end
```

A `DateTime` is kept as Prisma Client keeps it, through modules written alongside the schemas:
`PrismaDateTime` holds the instant in UTC in milliseconds (on SQLite the text Prisma writes,
`2030-01-01T09:00:00.000+00:00`, so an equality or a range finds Prisma's rows), `PrismaDate` a
`@db.Date` and `PrismaTime` a `@db.Time` or `@db.Timetz`. `now()` and `@updatedAt` are
`timestamps()` calls of those types. An optional `@updatedAt` is stored as null on insert only when
given by `Ecto.Changeset.force_change/3`, as a struct's `nil` is no change. On PostgreSQL and MySQL
the module's documentation names the session time zone a `@db.Timestamptz`, `@db.Timetz` or
`TIMESTAMP` column needs.

A `Json` is kept in `PrismaJson`, written alongside them too: Ecto's `:map` loads a JSON object
only, and a `Json` column holds any JSON value, so an array, a string, a number or a boolean that
Prisma Client wrote reads back as it is (on SQLite as the column keeps it: a `1.0` is `1`), and an
`@default("[]")` is a default of the field.

A `uuid()` or `uuid(7)` key without `@db.Uuid` or `@db.UniqueIdentifier` is a text column, so it
is a `:string` key that `Repo.insert/2` fills with `Ecto.UUID.generate()` (`generate(version: 7)`
for `uuid(7)`, Ecto 3.14 or later). As in Prisma Client, an id you give is neither checked nor
lower-cased. `Repo.insert_all/3` fills only an `autoincrement()` key and a `uuid()` key of a
`@db.Uuid` or `@db.UniqueIdentifier` column (`:id` and `:binary_id`), so its rows need an `id` of their own for any other
generated key (a text `uuid()`, a `uuid(7)`, a `ulid()`), as they need a value for a `uuid()` or
`ulid()` field that is not the key.

On SQL Server, a `String @db.UniqueIdentifier` is `:binary_id`, or `Tds.Ecto.UUID` where Ecto
fills it (a `uuid()` or `uuid(7)` default, a `uuid(7)` key): the Tds adapter loads and dumps both
in SQL Server's byte order, where `Ecto.UUID` would write the bytes of another GUID and `:string`
would hold the raw bytes.

`examples/ecto` in the repository runs a schema against Ecto on SQLite.

## Studio

```bash
npx hekireki studio
npx hekireki studio --url file:./dev.db
```

Your schema and database in the browser, on SQLite, PostgreSQL and MySQL. Without flags, Studio
reads the `schema` of `prisma.config.ts`, else `./prisma/schema.prisma` or `./schema.prisma`, and
listens on port 5555.

The database driver is your project's own: `pg` for PostgreSQL (Neon, Supabase, PlanetScale
Postgres), `mysql2` for MySQL (PlanetScale), the built-in `node:sqlite` for a SQLite file, and
`@libsql/client` for a libSQL server (Turso, or `sqld`). A token in the URL is shown as `***`.

```bash
npx hekireki studio --url "postgresql://user:pass@ep-x.neon.tech/app?sslmode=require"
npx hekireki studio --url 'mysql://user:pass@aws.connect.psdb.cloud/app?ssl={"rejectUnauthorized":true}'
npx hekireki studio --url "libsql://app-org.turso.io?authToken=$TURSO_AUTH_TOKEN"
```

On a libSQL server, the Migrate page takes no backup and runs no rehearsal: both copy the database
file, which is not here. The service's own point-in-time restore takes the backup's place.

**Browse the rows** of each model: search, add, edit and export them.

![The rows of the User model](https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/studio-data.png)

**Run SQL** with completion from the schema. The ER diagram marks the tables a statement reads,
and the result comes with the TypeScript types of its rows.

![A SELECT typed in the SQL console](https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/studio-sql.gif)

**Try Prisma Client calls** and see the SQL each one sends.

![prisma.user.findMany() in the Prisma Client playground](https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/studio-prisma-client.gif)

**Edit the schema** beside its ER diagram, which follows the file as it changes.

![The Prisma schema editor and the ER diagram](https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/studio-prisma-schema.png)

**Read the docs** of every model: its fields, and an example of each operation.

![The generated docs of the User model](https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/studio-docs.png)

## Seed

```bash
npx hekireki seed                    # Through the project's Prisma Client
npx hekireki seed --sql seed.sql     # Or as a SQL script
```

The `hekireki-seed` generator writes a schema module; `hekireki.config.ts` imports it and is typed
against it, so each model's fields are known as the config is written.

```ts
// hekireki.config.ts
import { defineConfig } from 'hekireki'

import { schema } from './prisma/seed/schema' // written by the hekireki-seed generator

export default defineConfig(schema, {
  seed: 42,
  models: {
    User: { count: 100, fields: { age: { min: 18, max: 65 } } },
    Tag: { data: [{ label: 'prisma' }, { label: 'effect' }] },
  },
})
```

Every foreign key, unique constraint and enum is respected.

## License

MIT. See [LICENSE](https://github.com/nakita628/hekireki?tab=MIT-1-ov-file).
