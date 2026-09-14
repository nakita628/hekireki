![img](https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/hekireki.png)

# Hekireki

**[Hekireki](https://www.npmjs.com/package/hekireki)** generates validation schemas, ORM models and
ER diagrams from a [Prisma](https://www.prisma.io/) schema, and opens the schema and its data in the
browser with Hekireki Studio.

## Installation

```bash
npm install -D hekireki
```

## Usage

Add a generator to `schema.prisma` and run `npx prisma generate`. `output` is required.

```prisma
datasource db {
    provider = "postgresql"
}

generator Hekireki-Zod {
    provider = "hekireki-zod"
    output   = "./zod"
    type     = true
}

generator Hekireki-Drizzle {
    provider = "hekireki-drizzle"
    output   = "./drizzle"
}

model User {
    /// Primary key
    /// @z.uuid()
    id    String @id @default(uuid())
    /// Display name
    /// @z.string().min(1).max(50)
    name  String
    posts Post[]
}

model Post {
    /// Primary key
    /// @z.uuid()
    id     String @id @default(uuid())
    /// Article title
    /// @z.string().min(1).max(100)
    title  String
    userId String
    user   User   @relation(fields: [userId], references: [id])
}
```

## Generators

### Validation schemas

- `hekireki-zod` — [Zod](https://zod.dev/)
- `hekireki-valibot` — [Valibot](https://valibot.dev/)
- `hekireki-arktype` — [ArkType](https://arktype.io/)
- `hekireki-effect` — [Effect Schema](https://effect.website/docs/schema/introduction/)
- `hekireki-typebox` — [TypeBox](https://github.com/sinclairzx81/typebox)
- `hekireki-ajv` — [AJV](https://ajv.js.org/)
- `hekireki-pydantic` — [Pydantic](https://docs.pydantic.dev/)

### ORM models

- `hekireki-drizzle` — [Drizzle](https://orm.drizzle.team/)
- `hekireki-kysely` — [Kysely](https://kysely.dev/)
- `hekireki-sqlalchemy` — [SQLAlchemy](https://www.sqlalchemy.org/)
- `hekireki-django` — [Django](https://www.djangoproject.com/)
- `hekireki-gorm` — [GORM](https://gorm.io/)
- `hekireki-sea-orm` — [SeaORM](https://www.sea-ql.org/SeaORM/)
- `hekireki-ecto` — [Ecto](https://hexdocs.pm/ecto/Ecto.Schema.html)
- `hekireki-activerecord` — [Active Record](https://guides.rubyonrails.org/active_record_basics.html)
- `hekireki-eloquent` — [Eloquent](https://laravel.com/docs/eloquent)
- `hekireki-efcore` — [EF Core](https://learn.microsoft.com/ef/core/)
- `hekireki-exposed` — [Exposed](https://github.com/JetBrains/Exposed)
- `hekireki-atlas` — [Atlas](https://atlasgo.io/) HCL

### ER diagrams

- `hekireki-er` — Mermaid, DBML, PNG and SVG

### Seed data

- `hekireki-seed` — the schema module `hekireki.config.ts` is typed against; see [Seed](#seed)

## Configuration

Every generator with every option. All options are optional.

### Validation schemas

```prisma
generator Hekireki-Zod {
    provider = "hekireki-zod"
    output   = "./zod"
    type     = true  // Export TypeScript types
    comment  = true  // Keep /// comments
    relation = true  // Add <Model>Relations schemas
    zod      = "v4"  // "v4" (default), "mini" or "@hono/zod-openapi"
}

generator Hekireki-Valibot {
    provider = "hekireki-valibot"
    output   = "./valibot"
    type     = true
    comment  = true
    relation = true
}

generator Hekireki-ArkType {
    provider = "hekireki-arktype"
    output   = "./arktype"
    type     = true
    comment  = true
    relation = true
}

generator Hekireki-Effect {
    provider = "hekireki-effect"
    output   = "./effect"
    type     = true
    comment  = true
    relation = true
}

generator Hekireki-TypeBox {
    provider = "hekireki-typebox"
    output   = "./typebox"
    type     = true
    comment  = true
    relation = true
}

generator Hekireki-AJV {
    provider = "hekireki-ajv"
    output   = "./ajv"
    type     = true
    comment  = true
    relation = true
}

generator Hekireki-Pydantic {
    provider = "hekireki-pydantic"
    output   = "./pydantic"
    comment  = true
    relation = true
}
```

### ORM models

```prisma
generator Hekireki-Drizzle {
    provider = "hekireki-drizzle"
    output   = "./drizzle"
}

generator Hekireki-Kysely {
    provider = "hekireki-kysely"
    output   = "./kysely"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "./sqlalchemy"
}

generator Hekireki-Django {
    provider = "hekireki-django"
    output   = "./django"
}

generator Hekireki-GORM {
    provider = "hekireki-gorm"
    output   = "./gorm"
    package  = "model"  // Go package name (default: "model")
}

generator Hekireki-SeaORM {
    provider  = "hekireki-sea-orm"
    output    = "./sea-orm"
    renameAll = "camelCase"  // #[serde(rename_all = "...")]
}

generator Hekireki-Ecto {
    provider = "hekireki-ecto"
    output   = "./ecto"
    app      = "MyApp"  // Module prefix (default: "MyApp")
}

generator Hekireki-ActiveRecord {
    provider = "hekireki-activerecord"
    output   = "./activerecord"
}

generator Hekireki-Eloquent {
    provider  = "hekireki-eloquent"
    output    = "./eloquent"
    namespace = "App.Models"  // "." becomes "\" (default: "App\Models")
}

// PostgreSQL only
generator Hekireki-EFCore {
    provider  = "hekireki-efcore"
    output    = "./efcore"
    namespace = "MyApp.Models"   // C# namespace (default: "Models")
    context   = "AppDbContext"   // DbContext class name (default: "AppDbContext")
}

// PostgreSQL only
generator Hekireki-Exposed {
    provider = "hekireki-exposed"
    output   = "./exposed"
    package  = "com.example.db"  // Kotlin package (default: "models")
    dao      = false             // Tables only, no DAO entities (default: true)
}

generator Hekireki-Atlas {
    provider   = "hekireki-atlas"
    output     = "./atlas"
    schemaName = "public"  // Default: "public" ("main" on SQLite)
    comment    = true      // Keep /// comments
}
```

#### Exposed

Hekireki-Exposed writes Kotlin for Exposed 1.x (`org.jetbrains.exposed.v1`) over JDBC: a `<Model>Table`
object per model, a `<Model>Entity` class per model when `dao` is on, a table per implicit
many-to-many relation, an enum class per enum, `ColumnTypes.kt` with the column types PostgreSQL needs
beyond Exposed's own, and `PrismaSchema`, which lists the schemas, the enum types and the tables in
the order `SchemaUtils.create` wants them. It is checked against Exposed 1.0 and 1.5, Kotlin 2.3 and
ktlint 1.8.

- Dependencies: `exposed-core` and `exposed-jdbc`, `exposed-dao` for the entities, `exposed-json` for
  `Json` fields, `io.github.thibaultmeyer:cuid` for `cuid()`, `com.github.f4b6a3:ulid-creator` for
  `ulid()`, and the PostgreSQL JDBC driver.
- Defaults are the ones Prisma Client and Prisma Migrate apply: `uuid()`, `cuid()`, `ulid()`,
  `nanoid()` and `@updatedAt` are filled in by the client, `now()` by both, `dbgenerated()` by the
  database. The entities stamp `@updatedAt` on every update; an update through the DSL has to set it.
- Temporal columns bind `java.time` values, so the JVM's time zone never shifts a value. A `DateTime`
  without a time zone holds UTC, as Prisma Client writes it.
- `money` is read from the text PostgreSQL formats by `lc_monetary`.
- Partial indexes (`where`) keep their condition. Views, `@@ignore` models, and `@ignore` and
  `Unsupported` fields are left out, as DMMF leaves them out, and so is an index over such a field.
- The DAO leaves out the relations Exposed cannot follow: a foreign key that shares its columns with
  another, one to a key of another column type or to a `@db.SmallInt` autoincrement key, one that
  pairs a key column with a column that is not a key, and a composite one unless it is the only one
  between two tables and references a whole composite key. Their columns are there all the same.
  With `relationMode = "prisma"` there are no foreign keys, and the DAO follows no relation.
- Exposed puts an autoincrement column first in a composite primary key, and writes a constraint or
  index name that needs quoting and is longer than 61 characters unquoted, which PostgreSQL folds to
  lower case. Its `MigrationUtils` misreads tables with a schema or a name in capitals; keep
  migrations with Prisma Migrate.

### ER diagrams

The extension of each path picks the format: `.md` (Mermaid), `.dbml`, `.png` or `.svg`.

```prisma
generator Hekireki-ER {
    provider = "hekireki-er"
    outputs  = ["docs/er.md", "docs/er.dbml", "docs/er.png", "docs/er.svg"] // One file: output = "docs/er.md"
    theme    = "dark"  // .png / .svg: "light" (default) or "dark"
}
```

## Annotations

A `///` line starting with `@z.`, `@v.`, `@a.`, `@e.`, `@t.`, `@j.` or `@p.` is used as-is by Zod,
Valibot, ArkType, Effect Schema, TypeBox, AJV or Pydantic. Any other `///` line is documentation.

```prisma
model User {
    /// Display name
    /// @z.string().min(1).max(50)
    /// @v.pipe(v.string(), v.minLength(1), v.maxLength(50))
    /// @a."1 <= string <= 50"
    /// @e.Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50))
    /// @t.Type.String({ minLength: 1, maxLength: 50 })
    /// @j.{ type: 'string' as const, minLength: 1, maxLength: 50 }
    /// @p.Annotated[str, StringConstraints(min_length=1, max_length=50)]
    name  String
    /// @z.email()
    /// @v.pipe(v.string(), v.email())
    /// @a."string.email"
    /// @e.Schema.String.pipe(Schema.pattern(/^[^@]+@[^@]+\.[^@]+$/))
    /// @t.Type.String({ format: 'email' })
    /// @j.{ type: 'string' as const, format: 'email' as const }
    /// @p.EmailStr
    email String @unique
}
```

On a model, `@p.ConfigDict(...)` becomes Pydantic's `model_config`, and
`@relation <Model>.<field> <Model>.<field> <type>` adds a relation without a foreign key to the ER
diagram (drawn dashed).

```prisma
/// @p.ConfigDict(extra='forbid')
/// @relation User.id Post.userId one-to-many
model Post {
    id     String @id @default(uuid())
    userId String
}
```

## Studio

```bash
hekireki studio                         # ./prisma/schema.prisma or ./schema.prisma
hekireki studio --schema prisma/schema  # A multi-file schema
hekireki studio --url file:./dev.db     # A database of your choice
hekireki studio -p 3000                 # Another port (default: 5555)
```

Studio shows the ER diagram, the docs, each model's rows, a Prisma editor and a SQL console, and
reloads when the schema changes. The database is found without a flag: `url` in
`hekireki.config.ts` (the one `hekireki seed` fills), then whatever Prisma itself connects with:
the variable `datasource.url` names with `env("...")` in `prisma.config.ts` (or in the schema's
`datasource` block), read from the environment or a `.env` next to `package.json` or the schema,
or the literal written there. `DATABASE_URL` is looked up only when Prisma names no variable, and
`--url` overrides everything.

## Seed

`hekireki seed` fills the database with rows made by [Faker](https://fakerjs.dev/) that follow the
schema: every foreign key points at a row that exists, one-to-one relations use each parent once,
implicit many-to-many join tables are filled, enums draw from their members (`@map` respected),
unique constraints hold, `@updatedAt` comes after `@default(now())`, and `uuid(7)`, `cuid(2)`,
`ulid()` and `nanoid()` defaults look like the real thing. The same seed always gives the same rows.

```bash
hekireki seed                          # hekireki.config.ts (its `url`, or Prisma's env variable)
hekireki seed --sql prisma/seed.sql    # Write a SQL script instead of inserting
hekireki seed --reset --count 100      # Empty the seeded tables first, 100 rows per model
hekireki seed --seed 7 --locale ja     # Another seed, Japanese names and text
```

Options live in `hekireki.config.ts` next to `package.json`, TypeScript only so the schema check
below applies; every flag above overrides it. With the `hekireki-seed` generator in `schema.prisma`, `prisma generate`
writes a schema module, and `defineConfig(schema, { ... })` checks the config against it: only
the schema's models, fields and enum members are accepted, each bound fits its field's type, and
a rule function knows the row it is given. No option has a value of its own: each one takes
effect when it is set, and until then faker's own behaviour stands (fresh randomness, English,
dates in the year before the run, optional fields filled). Only the models named under `models`
are seeded, unless `count` at the top gives every other model a row count.

```ts
import { defineConfig } from 'hekireki'

import { schema } from './prisma/seed/schema' // written by hekireki-seed

export default defineConfig(schema, {
  seed: 42, // Same seed, same rows
  locale: ['ja', 'en'], // Faker locales, tried in order
  nullRate: 0.1, // How often an optional field is null
  dates: { from: '2025-01-01', to: '2025-12-31' }, // Every DateTime falls in this window
  output: 'prisma/seed.sql', // Write SQL here instead of inserting
  reset: false, // DELETE the seeded tables first
  models: {
    // Faker: count rows, shaped by rules per field.
    User: {
      count: 100,
      fields: {
        role: { values: ['ADMIN', 'EDITOR'] }, // Members of the Role enum
        age: { min: 18, max: 65 }, // Int / Float / BigInt / Decimal
        createdAt: { from: '2024-01-01' }, // DateTime
        bio: { nullRate: 0.5, length: 200 }, // Optional String: null rate, longest length
        name: (faker, { row }) => faker.person.fullName(), // Or make the value yourself
      },
    },
    Post: {
      count: 500,
      relations: { tags: { min: 0, max: 3 } }, // Tags per post (implicit many-to-many)
    },
    // Real rows, no faker: inserted as written, the rest of each row from its defaults.
    Tag: {
      data: [{ label: 'prisma' }, { label: 'effect' }, { label: 'faker' }],
    },
  },
})
```

A model is seeded from real rows or from faker, never both: `data` names the rows to insert as
written, `count` and `fields` shape the rows faker makes, and giving both is a type error and a
runtime error. A real row carries the required fields that have no `@default`; a field left out
takes its default (`uuid(7)`, `now()`, `autoincrement()`, a literal, `@updatedAt`) or is null, and
faker is not involved. No id is ever written by hand: children are nested under their parent, a
parent elsewhere is named by a unique key, an implicit many-to-many lists the other side by key or
id, and a required key left out is linked to a row that exists. Every reference is checked before
anything is inserted, and unique constraints must hold.

```ts
export default defineConfig(schema, {
  models: {
    Tag: { data: [{ label: 'prisma' }, { label: 'effect' }] },
    User: {
      data: [
        {
          email: 'ann@example.com',
          name: 'Ann',
          profile: { bio: 'Wrote the first program.' }, // one-to-one child, userId filled
          posts: [
            // one-to-many children, authorId filled
            {
              title: 'Hello, Prisma',
              tags: [{ label: 'prisma' }, { label: 'effect' }], // implicit many-to-many, by key
              comments: [{ body: 'Thanks!', author: { email: 'bob@example.com' } }], // parent by key
            },
          ],
          followers: [{ follower: { email: 'bob@example.com' } }], // a join model with two keys
        },
        { email: 'bob@example.com', name: 'Bob' },
      ],
    },
    Category: {
      data: [{ name: 'Engineering', children: [{ name: 'Databases' }] }], // a self relation nests too
    },
  },
})
```

A field that is not the model's, a value of the wrong type, a key that is not one of the model's
unique keys, or a nested row missing one of its own required fields does not compile.

How many related rows each row has is bounded by `relations`, on the parent side of a key
(`posts`, `profile`, `children`) as well as on an implicit many-to-many (`tags`). Real rows are
checked against it and faker rows are dealt out to satisfy it; a row that breaks a bound stops the
run and is named by its key:

```ts
User: {
  data: users,
  relations: { profile: { min: 1 }, posts: { min: 1, max: 5 } },
},
```

```text
Relations out of bounds, nothing was inserted.
   User[1] { email: "bob@example.com" }.posts: 0 rows, at least 1 expected (models.User.relations.posts.min)
```

The schema itself only says whether a relation is optional or required, so these bounds are the
one thing about a relation the config has to say; a field that is not a relation, or the side of
a relation that owns the key, is not accepted there.

Rows can live in their own variables or files and keep that type: `defineData(schema, 'User',
rows)` types the rows of one model, `Row<typeof schema, 'User'>` one row, and `Row<typeof schema,
'Post', 'authorId'>` a row that will be nested under a user (the key the nesting fills is left out).
`hekireki seed` runs the config as TypeScript and resolves its relative imports the way a bundler
does, so `./data/users` finds `data/users.ts` with no tsconfig setting.

```ts
// data/users.ts
export const users = defineData(schema, 'User', [{ email: 'ann@example.com', name: 'Ann' }])

// hekireki.config.ts
import { users } from './data/users'
export default defineConfig(schema, { models: { User: { data: users } } })
```

Before the first insert, every row, given or generated, is checked against a
[zod](https://zod.dev/) schema built from the Prisma schema itself, so there is no validation
schema to write: the plain types (a `String` is a string, an `Int` an integer in range, a
`Decimal` a decimal string), enum members, the id formats through zod's own `z.uuid()`,
`z.uuidv7()`, `z.cuid2()`, `z.ulid()` and `z.nanoid()` (`uuid()`, `uuid(7)`, `cuid(2)`, `ulid()`,
`nanoid(n)`, `@db.Uuid`; `cuid()` by its shape), `z.email()` in a field named `email` and
`z.url()` in one named `url`, the length of `@db.VarChar(n)`, the digits of `@db.Decimal(p, s)`,
valid dates, lists and nullability. One value that fails stops the whole run and names the row and
field. Generated ids come from the libraries Prisma clients use (uuid, cuid2, cuid, nanoid, ulidx)
with their randomness drawn from the seeded faker, so they repeat with the seed; `cuid()` and
`cuid(2)` stamp the clock in and do not.

`defineConfig({ ... })` without the schema module accepts any model and field name; `hekireki
seed` reports the ones the schema does not have. `schema` names the Prisma schema when it is not
at `prisma/schema.prisma` or `schema.prisma`, next to the working directory or the config.

[examples/](https://github.com/nakita628/hekireki/tree/main/examples) has a SQLite, a MySQL and
a PostgreSQL project to try all of this on: `pnpm setup`, `pnpm seed`, `pnpm studio`.

The rows go through the project's Prisma Client when there is one: `hekireki seed` reads the
`prisma-client` generator's `output` from the schema, imports the client from there, and builds
the driver adapter the project has for its database (`@prisma/adapter-pg`,
`@prisma/adapter-mariadb`, `@prisma/adapter-better-sqlite3`) with the connection URL. Every write
then runs in one `$transaction`: `deleteMany` first under `reset`, `createMany` per model, `connect`
per implicit many-to-many pair, and the PostgreSQL sequence fix-ups. The Prisma Client is the only
way rows reach a database: without a generated client or the adapter package, `hekireki seed`
stops and says what to add (`prisma generate`, `@prisma/adapter-*`, or `--sql` for a script that
touches nothing). `client` in the config hands it a client of your own instead, adapter and all:

```ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.js'

export default defineConfig(schema, {
  client: () =>
    new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }),
  models: { User: { count: 100 } },
})
```

Field names steer the data: `email`, `name`, `title`, `body`, `url`, `phone`, `city`, `slug`,
`price` and the like get matching Faker values; `@db.VarChar(n)`, `@db.SmallInt` and
`@db.Decimal(p, s)` bound them. Rows are inserted in dependency order inside one transaction
(children are deleted first with `reset`), and on PostgreSQL the `autoincrement()` sequences are
moved past the seeded ids. `dbgenerated()` columns are left to the database.

## License

Distributed under the MIT License. See [LICENSE](https://github.com/nakita628/hekireki?tab=MIT-1-ov-file) for more information.
