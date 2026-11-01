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

### Database and documents

| Provider           | Writes                            | Options                                                                                         |
| ------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `hekireki-atlas`   | Atlas HCL                         | `schemaName` (`public`, `main` on SQLite)                                                       |
| `hekireki-openapi` | OpenAPI 3.1 (`.yaml`, `.json`)    | `title`, `version`, `paths`: the CRUD of each model                                             |
| `hekireki-er`      | ER diagram                        | `outputs`: files, one per extension (`.md`, `.dbml`, `.png`, `.svg`); `theme` (`light`, `dark`) |
| `hekireki-seed`    | Schema module for `hekireki seed` |                                                                                                 |

`hekireki-atlas` writes the tables as Prisma Migrate makes them, so `atlas schema diff` against a
database Prisma made has nothing to change. `hekireki-openapi` writes them as the
`components.schemas` Atlas's template writes, `///` comments as descriptions; with `paths`, each
model gets `GET` and `POST /users` and `GET`, `PATCH` and `DELETE /users/{id}`.

Every generator keeps Prisma's names: a model or field without `@map` keeps the name it has in the
schema, and each ORM is told so where its own convention would say otherwise. What each generator
does beyond that, and what it leaves to the caller, is in
[docs/generators.md](https://github.com/nakita628/hekireki/blob/main/packages/hekireki/docs/generators.md).
Active Record and Ecto take `///` lines of their own, so they are here.

### Active Record

`hekireki-activerecord` writes `app/models` from the schema: `application_record.rb` and one model
per Prisma model, as a Rails developer would write them (and `prisma_date_time.rb` where a column
needs it). What Rails works out on its own (`table_name`, `class_name`, `foreign_key`,
`inverse_of` where the names follow its conventions) is left unsaid; what the schema promises is
written: `attribute` defaults, `enum`, timestamps, associations with `dependent:` from `onDelete`,
and validations from the columns (`presence`, `uniqueness`, `length`).

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

`examples/ecto` in the repository runs a schema against Ecto on SQLite.

## Studio

```bash
npx hekireki studio
npx hekireki studio --url file:./dev.db
```

Your schema and database in the browser, on SQLite, PostgreSQL and MySQL. Without flags, Studio
reads the `schema` of `prisma.config.ts`, else `./prisma/schema.prisma` or `./schema.prisma`, and
listens on port 5555.

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
