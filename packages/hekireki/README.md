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

A `///` line starting with `@z.`, `@v.`, `@a.`, `@e.`, `@t.`, `@j.`, `@p.` or `@ar.` is used
as-is by Zod, Valibot, ArkType, Effect Schema, TypeBox, AJV, Pydantic or Active Record:

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

## Studio

```bash
npx hekireki studio                  # ./prisma/schema.prisma or ./schema.prisma, port 5555
npx hekireki studio --url file:./dev.db
```

The ER diagram, the rows of each model, a schema editor, a SQL console and a Prisma Client
playground, in the browser. SQLite, PostgreSQL and MySQL.

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
