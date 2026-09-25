![img](https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/hekireki.png)

# Hekireki

**[Hekireki](https://www.npmjs.com/package/hekireki)** generates validation schemas, ORM models and
ER diagrams from a [Prisma](https://www.prisma.io/) schema, and seeds a database.

## Installation

```bash
npm install -D hekireki
```

## Generators

Add a generator to `schema.prisma` and run `npx prisma generate`. `output` is required. Every
generator reads the tables and columns Prisma creates: a model or field without `@map` keeps the
name it has in the schema (`"Todo"`, `"authorId"`), and each ORM is told so where its own
convention would say otherwise.

```prisma
generator Hekireki-Zod {
    provider = "hekireki-zod"
    output   = "./zod"
    type     = true  // Export TypeScript types
}
```

| Provider                                                                                      | Generates                                               | Options                                                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `hekireki-zod`                                                                                | [Zod](https://zod.dev/)                                 | `type`, `comment`, `relation`, `zod` (`"v4"`, `"mini"`, `"@hono/zod-openapi"`) |
| `hekireki-valibot`, `hekireki-arktype`, `hekireki-effect`, `hekireki-typebox`, `hekireki-ajv` | Valibot, ArkType, Effect Schema, TypeBox, AJV           | `type`, `comment`, `relation`                                                  |
| `hekireki-pydantic`                                                                           | Pydantic                                                | `comment`, `relation`                                                          |
| `hekireki-drizzle`, `hekireki-kysely`, `hekireki-sqlalchemy`, `hekireki-django`               | Drizzle, Kysely, SQLAlchemy, Django                     |                                                                                |
| `hekireki-activerecord`                                                                       | Active Record                                           | `locales`                                                                      |
| `hekireki-gorm`                                                                               | GORM                                                    | `package`                                                                      |
| `hekireki-sea-orm`                                                                            | SeaORM                                                  | `renameAll`                                                                    |
| `hekireki-ecto`                                                                               | Ecto                                                    | `app`                                                                          |
| `hekireki-eloquent`                                                                           | Eloquent                                                | `namespace`                                                                    |
| `hekireki-efcore` (PostgreSQL)                                                                | EF Core                                                 | `namespace`, `context`                                                         |
| `hekireki-exposed` (PostgreSQL)                                                               | Exposed                                                 | `package`, `dao`                                                               |
| `hekireki-atlas`                                                                              | Atlas HCL                                               | `schemaName`, `comment`                                                        |
| `hekireki-er`                                                                                 | ER diagram                                              | `outputs` (`.md`, `.dbml`, `.png`, `.svg`), `theme`                            |
| `hekireki-seed`                                                                               | The schema module `hekireki.config.ts` is typed against |                                                                                |

A `///` line starting with `@z.`, `@v.`, `@a.`, `@e.`, `@t.`, `@j.`, `@p.`, `@ar.` or `@ecto.` is
used as-is by Zod, Valibot, ArkType, Effect Schema, TypeBox, AJV, Pydantic, Active Record or Ecto:

```prisma
model User {
    /// @z.email()
    /// @v.pipe(v.string(), v.email())
    email String @unique
}
```

### Rails

`hekireki-activerecord` writes `app/models` from the schema: `application_record.rb` and one model
per Prisma model, as a Rails developer would write them. What Rails works out on its own
(`table_name`, `class_name`, `foreign_key`, `inverse_of` where the names follow its conventions)
is left unsaid; what the schema promises is written: `attribute` defaults, `enum`, timestamps,
associations with `dependent:` from `onDelete`, and validations from the columns (`presence`,
`uniqueness`, `length`).

A `/// @ar.` line on a field is a validator (`presence`, `length(maximum: 255)`) added to that
field's `validates`; on a model it is a Ruby line written into the class as it is
(`has_secure_password`, `has_many :tags, through: :post_tags`, `scope ...`). A message or name
given per locale, `message: { ja: "...", en: "..." }` or `@ar.name(ja: "...")`, goes to
`config/locales/models/<model>/<locale>.yml` under the key Rails reads.

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
create the test database with `prisma migrate deploy`. `examples/active-record` in the repository
runs a fuller schema against Active Record on SQLite, and is the place to read what each thing
becomes.

### Ecto

`hekireki-ecto` writes one `Ecto.Schema` module per model. A model with a `/// @ecto` line on it
or on one of its fields also gets a `changeset/2`: `cast` of every field it can write,
`validate_required` of the required fields Prisma gives no default, a `unique_constraint` for each
`@unique` and `@@unique`, a `foreign_key_constraint` for each foreign key, and a
`no_assoc_constraint` for each `has_one` or `has_many` whose rows the database will not let go of
(`Restrict` or `NoAction` on delete, which Prisma makes of a required relation that names neither),
so a refused delete is an error on the association. Each constraint is
named as the database reports it: Prisma's `<table>_<columns>_key` and `_fkey`, cut to the
database's limit in bytes as Prisma cuts them, or the `map:` given. On SQLite a unique key takes
the name Ecto derives itself, and a foreign key gets no constraint, since SQLite names none when it
refuses a row; with `relationMode = "prisma"` there is no foreign key in the database to report.

A `/// @ecto.` line on a field is an `Ecto.Changeset` function that takes the field first, without
the field: `validate_length(max: 50)`, or `validate_required(message: "...")` for a message of the
field's own. `unique_constraint(message: "...")` on a `@unique` field and
`foreign_key_constraint(message: "...")` on a foreign key give the constraint its message. On a
relation field, `assoc_constraint` (the side with the key) puts a missing row's error on the
association, and `no_assoc_constraint(message: "...")` on a `has_one` or `has_many` gives a refused
delete its message (or asks for one where the database cascades). On a model a line is a step of the pipeline written as it is
(`validate_confirmation(:password)`), `unique_constraint([:a, :b], message: "...")` on the fields of
a `@@unique` gives that constraint its message, `cast(empty_values: [])` hands its options to the
changeset's `cast`, and a bare `/// @ecto` asks for the changeset with nothing added. With empty
values of the model's own, `""` is a value, as it is to the column, so the required fields are
checked by a `validate_not_null` written into the module, which counts only `nil` as missing
(`validate_required` would count `""` too); a field's own `validate_required` line keeps Ecto's
meaning. Ecto has no association for a foreign key of several columns, so the constraints of one
are `foreign_key_constraint`s with the error on the relation's name.

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

`examples/ecto` in the repository runs a schema against Ecto on SQLite.

## Studio

```bash
npx hekireki studio                  # ./prisma/schema.prisma or ./schema.prisma, port 5555
npx hekireki studio --url file:./dev.db
```

Your schema and database in the browser, on SQLite, PostgreSQL and MySQL.

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
