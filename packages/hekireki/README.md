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

`hekireki-activerecord` writes `app/models` whole, for Rails 7.1 or later: `application_record.rb`
as `rails new` writes it (when `output` is a directory named `models`) and one `.rb` file per
model, so the directory can go in `.gitignore` and be regenerated with `prisma generate`. Each
model is written as a Rails developer would write it, and what Rails derives on its own is left
unsaid: `table_name` appears only when the table is not the plural of the class (without `@@map`
it is the model's own name, `"Todo"`, as Prisma creates it), `class_name`, `foreign_key` and
`inverse_of` only where the names depart from Rails' conventions (`has_many :todos` over `user_id`
needs none of them; its `belongs_to :user` keeps `inverse_of: :todos`, the plural inverse Rails
infers only with `automatically_invert_plural_associations`), and no comment at all: the `///`
documentation stays in the schema. The files pass `rubocop-rails-omakase` and RuboCop's own
defaults with `rubocop-rails` as written.

What the model does carry: an `attribute` default for each literal `@default`, for `uuid()`,
`ulid()`, `cuid()`, `cuid(2)` and `nanoid()` (the `ulid`, `cuid`, `cuid2` and `nanoid` gems) and an
empty array for a list without one, as the Prisma client reads it; `implicit_order_column` on the
created timestamp when the primary key is random (`uuid()`, `cuid()`, `nanoid()`); `alias_attribute`
for a `createdAt` or `@updatedAt` column so Rails fills and bumps it as the Prisma client would;
`enum` with snake_case keys (`PENDING_REVIEW` gives `record.pending_review?` and the
`pending_review` scope, the stored value stays the database's), its `default:`, `prefix: true` when a
key is a method Ruby or Active Record already has, and `validate: true` so a value outside the enum
is a validation error rather than an `ArgumentError`; `dependent:` on every `has_many` and `has_one`
as the foreign key's `onDelete` acts (`Cascade` destroys, `SetNull` nullifies, `Restrict` and
`NoAction` refuse with an error); and validations from the columns: a required column without a
default is `presence` (`inclusion` in `[ true, false ]` for a `Boolean`, `exclusion` of `nil` for
`Json` and `Bytes`), `@unique` and `@@unique` are `uniqueness`, `@db.VarChar(n)` is `length`.

Validation stays in the model, as Active Record has it. A `/// @ar.` call on a field is one
validator on one `///` line, written as Rails spells it (`presence`, `length(maximum: 255)`), and
becomes an option of that field's `validates`, replacing the one the schema implied when it names
the same validator; a `/// @ar.` line on the model is written into the class as it is. A message
given per locale, `message: { ja: "...", en: "..." }` or `too_long: { ja: "...", en: "..." }`, is
not written into the model: it goes to `config/locales/models/todo/<locale>.yml` under the key the
[Rails i18n guide](https://guides.rubyonrails.org/i18n.html#error-message-scopes) lists for that
validator (`activerecord.errors.models.todo.attributes.title.blank`). `too_long` is a key already;
`message` stands for every key the validator can raise: `blank` for `presence`, all three of
`length`, and for `numericality` and `comparison` the keys of the options given
(`greater_than: 0` raises `greater_than`), so the one translation covers whichever fails. A locale's
value may be plural forms, `{ one: "...", other: "%{count} ..." }`, which I18n picks by `count`, and
`%{count}`, `%{value}`, `%{model}` and `%{attribute}` interpolate as Rails' own messages do.
`@ar.name(ja: "...", en: "...")` on a field or a model translates its name the same way
(`activerecord.attributes.todo.title`, `activerecord.models.todo`), plural forms included.
The files are laid out as the guide's
[organization of locale files](https://guides.rubyonrails.org/i18n.html#organization-of-locale-files)
has them, `models/<model>/<locale>.yml`, one directory per model and one file per locale it names,
so model and attribute names stay apart from the text of the views and from the defaults; Rails
loads `config/locales` through its subdirectories. `locales` names that directory; from
`app/models` it is `config/locales`. The comment has one shape: the description first, then the `@ar.` calls, each `name` or `name(arguments)` with its
parentheses closed on that line; a description line after a call, a call that runs on to the next
`///` or a call of another shape stops `prisma generate` with the model and field it is on. Rails
joins attribute and message with a space (`errors.format`), which Japanese does not want: the
`rails-i18n` gem's `ja.yml` sets it to `%{attribute}%{message}`, and the generated files sit beside
it. Point `output` at `app/models`, and `todo.rb` is the model, nothing left to edit by hand:

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
# app/models/application_record.rb
class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class
end

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

```gitignore
/app/models/
/config/locales/models/
```

Which file answers is the request's locale. The guide's
[managing the locale across requests](https://guides.rubyonrails.org/i18n.html#managing-the-locale-across-requests)
sets it once per request with `I18n.with_locale`, which puts it back when the action ends rather
than leaving it on the thread for the next request, and names the locales the application serves:

```ruby
# config/application.rb
config.i18n.available_locales = %i[ja en]
config.i18n.default_locale = :ja

# app/controllers/application_controller.rb
class ApplicationController < ActionController::Base
  around_action :switch_locale

  private
    def switch_locale(&action)
      locale = params[:locale] || I18n.default_locale
      I18n.with_locale(locale, &action)
    end
end
```

The tables stay Prisma's to create, so Rails must not run its own migrations against them:

```ruby
# config/application.rb
config.active_record.migration_error = false
config.active_record.maintain_test_schema = false
```

Create the test database with `prisma migrate deploy` (from `test_helper.rb`, or before the test
run) rather than `db:test:prepare`.

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
