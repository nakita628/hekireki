![img](https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/hekireki.png)

# Hekireki

**[Hekireki](https://www.npmjs.com/package/hekireki)** generates validation schemas, ORM models and
ER diagrams from a [Prisma](https://www.prisma.io/) schema, opens the schema and its data in the
browser with Hekireki Studio, and checks the data against a schema before it is migrated.

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

Studio shows the ER diagram, the docs, each model's rows, a Prisma editor, a SQL console and the
migration history, and reloads when the schema changes. The database is found without a flag: `url` in
`hekireki.config.ts` (the one `hekireki seed` fills), then whatever Prisma itself connects with:
the variable `datasource.url` names with `env("...")` in `prisma.config.ts` (or in the schema's
`datasource` block), read from the environment or a `.env` next to `package.json` or the schema,
or the literal written there. `DATABASE_URL` is looked up only when Prisma names no variable, and
`--url` overrides everything.

The Migrate page is `hekireki migrate check` and `hekireki migrate plan` with a database in front
of them, laid out in the order a migration is worked through. Above it, the history: what the
database has applied against what the migrations directory holds, with a deploy for migrations
waiting and a way to mark one that failed as rolled back. When the database differs from the
schema, the page compares the two as it opens, and then:

1. **What the schema changes**: each change in words (a table rebuilt, a column made unique, a
   foreign key added), and what the database does to other rows on its own (an `ON DELETE
CASCADE` that follows a deleted row).
2. **What becomes of the data**: one card for each set of rows the new schema does not take, said
   in a sentence with how many there are (`User.name becomes required, but 2 rows have no value`).
   Each card offers the choices there are (see [Fixes](#fixes)) with one already selected: a
   suggestion read from the schema and the database, and why it is the one. An added `@default`
   fills the rows already there; a unique column gets a value per row from its key; a column
   dropped while the table gains one whose name it shares is read as renamed; an enum that loses
   one member and gains another maps the one to the other; duplicates keep the oldest row by a
   `@default(now())` field, emptying the others' key where it may be NULL; the orphans of an
   optional relation lose their key and those of a required one go; text turning into a number is
   converted with blanks read as NULL. A choice that deletes rows says so. **Use every
   suggestion** takes them all at once; each card can be changed or undone, and the page plans
   again with every change.
3. **Check the result**: what happens to the data, said first: every change that loses rows or
   values (a column or table dropped, a column added again) with how many, the rows themselves on
   a press, read from the database as it is now, and a CSV of them; or that nothing is lost. Then
   each changed model as the decisions will leave it, and the steps in the order they run.
4. **Rehearse it**: the migration run for real where nothing is kept — on SQLite on a copy of the
   database file, on PostgreSQL in a transaction rolled back whatever happens. It shows whether
   each step goes through (and the statement and the database's words where one does not), every
   table's rows before and after, and whether the database it leaves matches the schema. A
   statement no transaction can hold (an index made `CONCURRENTLY`, an enum value added) is said
   to be beyond it. A migration that loses data is not run until its rehearsal has gone through,
   and a plan whose statements change has to be rehearsed again. Losing data is a `DROP`, a
   `DELETE`, and also a fix that writes over values the rows hold: what a new type refuses set to
   NULL, clamped or cut, stored values mapped onto another enum member, the key of a duplicate or
   an orphan cleared. Filling a NULL, and keeping the values of a column that moves, lose nothing.
5. **Run the migration**: once nothing blocks, one press runs every step, writes the migration.sql
   and records it in `_prisma_migrations` without running it again, so Prisma Migrate owns it from
   then on. A run that loses data lists what it loses, asks for `migrate` to be typed, and takes a
   backup first (see below); a backup that cannot be taken stops the run before anything changes.
   Once recorded, the run is checked: every table's rows before and after it, and whether the
   database now matches the schema. The steps can also be run one at a time, to look at the rows
   between them. A step that does not go through leaves the database somewhere the plan no longer
   describes, and the page says so: what ran stays run, comparing again starts from the database
   as it is, and the backup taken for the run can be restored from there.

Backups are listed under the history. On SQLite a backup is a copy of the database file
(`VACUUM INTO`) in `.hekireki/backups` beside the schema, with a `.gitignore` that keeps it out of
the repository, and restoring one puts back every table, row, index and the migration history as
they were, in one transaction. Undoing a run from its result also removes the migration it wrote
from the migrations directory. On PostgreSQL a backup is every table of the schema copied into a
schema named for it (`backup_…`), a column of an enum as the text of its labels: a copy that kept
the enum's type would depend on it, and PostgreSQL would then refuse the `DROP TYPE` Prisma ends
every change of an enum with. Beside the copies, the backup keeps the statements that make the
schema again as PostgreSQL itself writes them when the backup is taken (the tables column by
column, the enums, the sequences and where they had got to, the keys, `CHECK`s and foreign keys,
the indexes and the triggers), and a record of what the database was. Restoring one runs in a
single transaction: the tables and enums of the schema are dropped (never with `CASCADE`), the
statements run, and the database they make is compared with that record before anything is kept.
If a view or anything else the backup does not know how to make again depends on a table, or the
result differs in any way, the transaction is rolled back and nothing changes. A backup taken
before Studio kept those statements is its rows only, and is listed without a restore. What a
backup does not hold is what lives outside the schema's tables (views, functions, grants): for
those, a `pg_dump` (or a `mysqldump`) before a migration that loses data is still the way back, as
`migrate plan` says. Studio does not back up MySQL.

Every migration of the history shows the SQL of its migration.sql on a press; one the database
records whose file is gone is marked so, and how the two histories differ is said in words. The
SQL of the data migration is there too: each decision shows the statements it runs (or says it is
written into the schema change itself), and the review shows the whole migration.sql as it will
be written.

The migrations are the ones Prisma Migrate reads: the `migrations.path` of `prisma.config.ts`
(relative to that file), else `migrations` beside the schema. The page follows them as they change
on disk — a migration written by `prisma migrate dev`, edited by hand, or brought in by a pull —
and reads the history and compares again on its own, as it does when the schema changes; a plan
whose steps have started running is kept as it is. A directory with no `migration_lock.toml`
is read with the provider of the schema's datasource.

A database with tables and no migration history — made with `prisma db push`, or before the
project used migrations — is one Prisma Migrate will not deploy to (P3005, "The database schema is
not empty"). The page says so, and baselines it: each migration, with those before it, is
replayed into an empty shadow database (SQLite in memory; on PostgreSQL a database created for it
and dropped again, which takes the CREATEDB privilege) and compared with the database. The latest
one it matches is suggested, and recording it marks it and every earlier migration as applied in
`_prisma_migrations` without running them, as `prisma migrate resolve --applied` does; one it does
not match is refused, with the SQL of what differs.

Studio keeps the decisions in `.hekireki/migrate.json` beside the schema: commit it, and
`hekireki migrate check` and `plan` make the same plan from the command line and in CI.
`hekireki.config.ts` holds no decisions of a migration. A kept decision the schema no longer has a place
for — a field removed or renamed after it was decided — does not stop the page: the plan is made
without it, and it is listed with why, to be deleted there. The command line, with no one to ask,
refuses such a decision instead.

The Migrate page speaks English or Japanese: the button in its header switches it, and this
browser keeps the choice. Until one is made, it follows the language the browser asks for first.
A request that fails says why on the page, in the words of the server or the database — the
decision that names a field the schema does not have, the statement the database refused — until
it is dismissed.

Prisma Migrate itself does the work: `@prisma/schema-engine-wasm` runs in the Studio process,
reading and writing through the connection the rest of Studio is already on. Nothing is spawned
and no schema engine is downloaded.

The page works on PostgreSQL and SQLite. Prisma Migrate has no MySQL behind a connection rather
than a URL, and no way to read a PostgreSQL schema other than `public` that way either, so Studio
says so for those and leaves them to the command line, where `hekireki migrate check` and
`hekireki migrate plan --migration` do the same work on every database.

The Prisma Client page runs a call as your code writes it, through the project's own generated
client, and lists the SQL the client sent for it — the statements, their bound values and their
timings — each one a click away from the SQL page, where it can be explained and edited. The
schema beside the editor lights up the models the call touches as you type, following its
relations, and marks the fields it names:

```ts
prisma.user.findMany({
  where: { posts: { some: { published: true } } },
  include: { posts: { take: 3 } },
  take: 10,
})
```

A single model operation or a batch `prisma.$transaction([...])` is read, never evaluated: the
arguments are literals (strings, numbers, booleans, `null`, objects, arrays, `new Date(...)`,
bigints like `10n`), so variables, callbacks and `$queryRaw` are refused before anything runs, and
a write asks before it goes through. While you write the call, the SQL tab under the editor shows
the SQL it sends as it changes (a call that only reads runs to show it), and running the call
turns to its result; a write shows its SQL once it has run.
The client is the one `hekireki seed` uses: the output of the schema's `prisma-client` generator
(or `@prisma/client` for `prisma-client-js`) after `prisma generate`, opened with the driver
adapter installed in the project (`@prisma/adapter-pg`, `@prisma/adapter-mariadb` or
`@prisma/adapter-better-sqlite3`). Restart Studio after regenerating the client so it runs
through the new one.

The editor completes, explains and type-checks the call against the generated client's own types
— `where` offers the model's fields and filters, a hover shows the argument's type, a wrong key is
underlined — through the project's TypeScript: install `typescript` 5.x as a dev dependency and
Studio picks it up (`typescript` 7, the native compiler, has no language service API, so the
editor falls back to completing model, operation and argument names from the schema).

## Seed

`hekireki seed` fills the database with rows made by [Faker](https://fakerjs.dev/) that follow the
schema: every foreign key points at a row that exists, one-to-one relations use each parent once,
implicit many-to-many join tables are filled, enums draw from their members (`@map` respected),
unique constraints hold, `@updatedAt` comes after `@default(now())`, and `uuid(7)`, `cuid(2)`,
`ulid()` and `nanoid()` defaults look like the real thing. The same seed always gives the same rows.

```bash
hekireki seed                          # hekireki.config.ts (its `url`, or Prisma's env variable)
hekireki seed --sql prisma/seed.sql    # Write a SQL script instead of inserting
hekireki seed --reset --count 100      # Empty the seeded tables first, 100 faker rows per model (over the config's counts)
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

## Migration check

```bash
hekireki migrate check                               # The schema against the database Studio would open
hekireki migrate check --schema prisma/schema        # A multi-file schema
hekireki migrate check --url postgresql://ro@db/app  # Another database
hekireki migrate check --timeout 30000               # Stop any query that runs longer than 30 s
hekireki migrate check --json                        # A report for CI
hekireki migrate check --decisions ci/migrate.json   # Decisions kept somewhere else
hekireki migrate plan > fixes.sql                    # The fixes decided in Studio as SQL
hekireki migrate plan -m migration.sql -o full.sql   # And written into the migration Prisma wrote
hekireki migrate plan --batch 10000 -o fixes.sql     # A fix over more rows than that, 10000 at a time
```

Run it after editing the schema and before `prisma migrate dev` or `prisma migrate deploy`. It
compares the schema with the tables the database has now and counts, for each change, the rows
the change breaks. It only reads: the connection is set read only before its first query, so the
database itself refuses a write, and a read-only user is enough.

| Change in the schema                                            | Counted                                               | Result   |
| --------------------------------------------------------------- | ----------------------------------------------------- | -------- |
| A column becomes required                                       | NULL rows                                             | blocking |
| A required column is added without a default the database fills | rows of the table                                     | blocking |
| `@id`, `@unique`, `@@unique`                                    | groups of duplicate values                            | blocking |
| An enum loses a member                                          | rows holding a value it no longer has                 | blocking |
| A relation (a foreign key)                                      | orphans: keys that match no row                       | blocking |
| A type the database converts in place, narrower                 | values out of range, too long, or that do not convert | blocking |
| A type the database converts in place, with fewer digits        | values rounded, fractional seconds cut, time dropped  | warning  |
| A type the database cannot cast (PostgreSQL, CockroachDB)       | values lost when the column is dropped and re-added   | warning  |
| A column or a table is dropped                                  | values or rows it takes with it                       | warning  |

```text
⚡️ Migration check: 2 blocking problems, 1 warning
   Schema: /app/prisma/schema.prisma
   Database: postgresql postgresql://app:***@localhost:5432/app
   Checks: 0 passed, 8 already guaranteed by the database's constraints

   Blocking: the migration fails on these rows, or leaves them inconsistent
   ✗ User.email          unique          2 duplicate groups
     Merge or remove the duplicates before the constraint is created, or say which to keep on the Migrate page of hekireki studio.
   ✗ Post.author → User  foreign key     1 orphan row
     Delete the orphans, set them to NULL, or point them at a User that exists; the Migrate page of hekireki studio does the first two.

   Warnings: the rows and values these drop or change
   ! User.nickname       column dropped  1 value
     A renamed field reads as a drop and an add, and so does one moved to a related model: keep the column with @map, or name the field it became on the Migrate page of hekireki studio.
```

`uuid()`, `cuid()`, `nanoid()`, `ulid()` and `@updatedAt` are filled by Prisma Client, not the
database, so a required column with one of them is added with no default: PostgreSQL and SQLite
refuse it on a table with rows, and MySQL fills the rows with `''`, `0` or a zero date.

A type change is judged the way Prisma Migrate writes it and the database carries it out.
PostgreSQL casts with `SET DATA TYPE` where it can (to text, between numbers, to a shorter
`VarChar`, between dates) and refuses the whole change on a value out of range or too long; a
change it cannot cast (text to a number, a `uuid`, a timestamp or an enum, an enum to text) drops
the column and adds it again, and a required one comes back NOT NULL without a default, which
blocks. MySQL converts every change in place with `MODIFY`, and strict mode refuses the text that
is not an integer, a number, a date or valid JSON, the number out of range and the string longer
than the column (a `String` is `VARCHAR(191)`). MySQL rounds text such as `10.5` into an integer
column, where MariaDB refuses it; the check asks the server which one it is and counts
accordingly. A `Decimal` refuses a value with more whole digits than its precision leaves once it
is rounded to its scale (999.995 does not fit `Decimal(5, 2)`), and rounds away the decimals it
has no room for; a float or decimal turned into an integer is rounded; `@db.Date` drops the time
of day; fewer digits of fractional seconds round or cut them. Those changes go through, and each
is counted as a warning. SQLite copies the values into the new table as they are, so there a type
change is a warning. A change the check does not model is a warning too.

What a constraint of the database already rules out is left to it, and no table is scanned for
it: a NOT NULL column, a unique index over the same columns (or some of them), a PostgreSQL enum
or MySQL `enum(...)` column whose members all stay, a validated foreign key on PostgreSQL or a
declared one on MySQL. SQLite enforces foreign keys only on connections that turn them on, so
there the orphans are always counted. Against a database that already matches the schema, every
check is guaranteed.

The command exits with 1 when a blocking check finds rows or a query fails; warnings are printed
and pass. `--json` lists every check with its status (`blocking`, `warning`, `passed`,
`guaranteed` or `failed`), its count, the SQL that counted it, which is where to start looking
for the rows, and the `suggestion` the Migrate page offers for it, with the `facts` it rests on. `--timeout` stops a query that runs longer, on
PostgreSQL and MySQL, and the check it belonged to is reported as not checked. The database is
found the way Studio finds it (`--url`, then `url` in `hekireki.config.ts`, then Prisma's own
settings) and opened with the project's `pg`, `mysql2` or the built-in `node:sqlite`.

It checks PostgreSQL, MySQL, MariaDB, SQLite and CockroachDB (tested on 25.3). CockroachDB speaks
PostgreSQL's protocol, but Prisma migrates it otherwise, and the check follows: Prisma drops and
adds a column again for nearly every type change (only a `BigInt` narrowed to `Int` and an `Int`
turned into an unbounded `String` are converted in place, and a `@db.String(n)` of another length
is re-added), drops an enum member with `DROP VALUE`, which refuses a value in use, and runs the
migration a statement at a time, each in a transaction of its own, so a column or an enum member
it adds is there for the statements after it.
Prisma's own changes of a column's type fail there whatever the rows, on the session Prisma sets
up ([prisma/prisma#26864](https://github.com/prisma/prisma/issues/26864)): `hekireki migrate plan
--migration` writes them with the declarative schema changer, which makes them. SQL Server is not
supported. MongoDB has no migration to check: Prisma Migrate does not write one for it, and
`prisma db push` changes no documents.

A renamed field or model reads as a drop and an add, to Prisma Migrate as to the check: keep the
old name in the database with `@map` or `@@map`, or, for a field, name the column it is in now
with a decision on the Migrate page (see [Fixes](#fixes)), and the plan renames it in the migration.
A table or a column the schema does not have is reported as dropped, with the rows or values it
takes. Tables the schema adds are listed, with nothing to check until they exist.

### Fixes

What to do about the rows is a decision the check cannot make. Make it on the Migrate page of
`hekireki studio`: each check that stands in the way offers what can be decided about it, and the
plan is made again with the answer.

| Check                           | Decisions                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A column becomes required       | set the NULLs to a value, or with SQL evaluated per row (`concat('user-', id)`)                                                             |
| A required column is added      | the same, for the rows already there                                                                                                        |
| `@id`, `@unique`, `@@unique`    | keep the first or the last of each group, ordered by a field (the primary key when none is), and delete the others or set their key to NULL |
| A relation (a foreign key)      | set the orphans' key to NULL, or delete them                                                                                                |
| An enum loses a member          | the member each stored value becomes: `EDITOR=VIEWER, GUEST=MEMBER`                                                                         |
| A value the new type refuses    | clamp it to the range, cut it to the length, set it to NULL, a value or SQL, or delete the row                                              |
| A type the database cannot cast | SQL that converts each value (`CAST(NULLIF(views, '') AS INTEGER)`)                                                                         |
| A column is dropped             | it was renamed to the field named: the column is renamed and its values kept; it moved to `Model.field` of a related model; or drop it      |

Studio keeps them in `.hekireki/migrate.json` beside the schema, which `hekireki migrate check`
and `plan` read (`--decisions` names another file). It is plain JSON, one entry per decision, and
the file is all of them:

```json
{
  "decisions": [
    {
      "kind": "not-null",
      "modelName": "User",
      "field": "name",
      "choice": "value",
      "value": "unknown"
    },
    {
      "kind": "unique",
      "modelName": "User",
      "field": "email",
      "choice": "keep-first-delete",
      "value": "createdAt"
    },
    {
      "kind": "column-dropped",
      "modelName": "User",
      "field": "handle",
      "choice": "rename",
      "value": "displayName"
    },
    {
      "kind": "foreign-key",
      "modelName": "Post",
      "field": "author",
      "choice": "null",
      "value": null
    }
  ]
}
```

A column moved to a related model (`User.bio` to `Profile.bio`) reads to Prisma as dropped from
one table and added to the other, in whichever order its migration writes the two. The move
follows the foreign key between the models, over one column. Where the target points at the
source (a profile at its user), each row gets the value of the row it points at; where the source
points at the target (`Post.authorName` up to `User`), each row gets the value of the row pointing
at it with the smallest primary key that has one, in the preview and in the plan alike; where the
rows pointing at one row do not agree, the check says so (`move-ambiguous`, a warning with how many
rows it happens to), because the other values go with the column. The plan keeps the values in a table of their own (`hk_move_User_bio`) before the
migration, fills the column the migration adds from there, and drops it once the migration is
done. A table of that name already in the database is what a plan that did not finish left, and
may hold the only copy of the values: the check refuses the move until a person has looked at it
and dropped it. When the migration creates the target, its rows are made from the values, one for each
source row with one: every other required column needs a default the database fills, or
`uuid()`, `cuid()`, `nanoid()`, `ulid()` or `@updatedAt`, which the plan writes. A dropped column is weighed against every column the migration adds to its table (a rename) or
to a related model (a move): the same name but for case and separators first, then the longest run
of letters the names share (three at least), a kind the values fit (text takes any), and whether
it may be empty as the dropped one may. The Migrate page lists them, likeliest first, and a pick
fills the decision in. One is suggested when it stands out (the same name, or a likeness no other
place has) and no other column dropped reads as going there more; a column with no place at all
is said to be lost unless something is decided. The field a rename or a move names is completed
from the columns the migration adds, with each one's type and whether its table is new. Beside
every decision, a panel draws how it migrates as it is being made: the column and a few of its
values now, the key the values move along or the rename, where they end up (an added column, a new
table, or lost), and the steps the plan takes; a name the migration does not add is flagged there
before the plan refuses it. The relation has
to be there before the migration that moves the column.

A file that is not there is no decisions; one that cannot be read, or a decision that names a
model, field, relation or enum member the schema does not have, stops the check and says which.

The check then counts what is left once the fixes have run, reading each fixed table through
the fixes, one column after another in the order they were decided, then the duplicates,
then the orphans, with parents settled before the children that point at them. So the fixes
answer to each other: filling the NULL emails of a unique column with one value is counted as
duplicates, and deleting a duplicate user counts the posts left pointing at it as orphans. Each
fix is listed with the rows it changes; one with nothing to change says so, to be dropped once
the migration has shipped.

A fix that keeps one row of a group and drops the rest names the rows by a key the database has
now, the key being fixed aside: the primary key it has today, or another unique key. The
migration may be adding or dropping the key the schema will have, so the key of the schema is not
the one to go by. Where the table has nothing else to tell its rows apart, the check says so and
the plan is not written: those rows have to be settled by hand.

`hekireki migrate plan` writes the same fixes, in the same order, as UPDATE and DELETE
statements: put them at the top of the migration Prisma writes for the schema (`prisma migrate
dev --create-only` writes one to edit), so they run right before the schema change. Prisma runs a
migration a statement at a time, with no transaction around it: if a statement fails, the ones
before it, these fixes included, stay done. `-o fixes.sql` writes a file and prints the report.

Some decisions only the migration itself can carry out: a column renamed, a value converted where
the database has no cast, the rows of a required column it adds, an enum value mapped to a member
the old type does not have. The check counts them as the migration will leave
the rows, and `--migration` (`-m`) with the migration.sql Prisma wrote writes the whole of it, the
fixes first and these changes written into Prisma's own statements, to put in its place:

```bash
npx prisma migrate dev --create-only --name profile
npx hekireki migrate plan -m prisma/migrations/20260915000000_profile/migration.sql \
  -o prisma/migrations/20260915000000_profile/migration.sql
npx prisma migrate dev
```

| Decision                        | PostgreSQL                                                  | MySQL, MariaDB                                  | SQLite                                   |
| ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| a rename                        | `RENAME COLUMN`, then the new type, nullability and default | `CHANGE COLUMN` in place of the drop and add    | the copy of the table carries it over    |
| a conversion                    | `SET DATA TYPE ... USING` it, in place of the drop and add  | an UPDATE before the `MODIFY`                   | the copy of the table converts the value |
| an added column filled          | added nullable, filled, then made NOT NULL                  | the same                                        | filled in the copy of the table          |
| a value to a member that is new | in the cast of the column to the new enum type              | over an `ENUM` widened to both lists for a time | stored as text: before the migration     |

On PostgreSQL the whole plan is one statement, a `DO` block that PostgreSQL runs whole or not at
all: if a statement in it fails, none of it is done, the fixes included, and Prisma records the
migration as failed with that statement's error (`prisma migrate resolve --rolled-back` lets it
run again once it is fixed). Where a `DO` block cannot hold the migration, the plan says so in its
header and leaves the statements as they are: an enum value added, which PostgreSQL cannot use in
the transaction that adds it, or an index made `CONCURRENTLY`. MySQL commits each change of a
table as it runs, and SQLite and CockroachDB run the statements one by one too, so there a failure
leaves what ran before it: try the plan on a copy of the data first.

CockroachDB gets PostgreSQL's changes one clause per statement, the mapped values between the
`ADD VALUE` and the `DROP VALUE` of the enum, and each change of a type with the declarative
schema changer. Without `--migration`, decisions that ask for any of these stop the plan and say
so; and a change the plan cannot find in the migration given (one that is not the migration
Prisma wrote for this schema) is reported, never guessed at.

The plan leaves each table as the check read it, and the check reads the rows as the database
leaves them after the plan, with its own foreign keys: where a fix deletes rows other tables point
at, `ON DELETE CASCADE` deletes theirs too (down a table pointing at itself, and on to the tables
beyond) and `SET NULL` clears their key; where a fix changes a key other tables point at, `ON
UPDATE CASCADE` gives them the new key and `SET NULL` clears it. Each is a warning with the rows it
changes. A `RESTRICT` or `NO ACTION` key refuses the change, and so does MySQL an `ON UPDATE`
cascade into a table it has already changed (a table pointing at itself): blocking, as the plan
would fail. `SET DEFAULT`, and a cascade from a fix that changes the primary key itself, are
counted but not followed. A decision that names what the schema or the database does not have
stops the check and says what, as does a value an enum's current type cannot hold before the migration
without `--migration` to map it in.

A fix is one `UPDATE` or `DELETE`, and holds its locks until it ends: over many rows of a table in
use, that is a long time. `migrate plan --batch <rows>` writes a fix over more rows than that as
the same statement that many rows at a time (as many times as the rows the check counted need),
followed by the statement as it is, which takes whatever was written since the check. MySQL,
MariaDB and CockroachDB take a `LIMIT` on the statement; PostgreSQL and SQLite name the rows by
where they are stored (`ctid`, `rowid`). An orphan fix, written over an alias, is left whole, and so
is everything inside the one `DO` block of PostgreSQL with `--migration`: one transaction holds
every lock until it ends, however its statements are cut. The plan says which it did. On the
Migrate page of Studio the same is asked for with **Rows at a time**: each step runs a statement
at a time, so a batch holds its locks for its own rows on PostgreSQL too.

What Prisma's schema does not describe is read from the database's catalogue, for the tables the
fixes or their cascades write to. A `CHECK` constraint is asked about the rows as the fixes leave
them: the ones it refuses are counted (`check-constraint`, blocking), because the database would
stop the plan at the statement that writes them. Where the table keeps its constraints (PostgreSQL
and MySQL: an `ALTER TABLE` does), the constraint is asked again of what the migration itself makes
of the rows, a value converted, an enum value mapped, an added column filled; a constraint the new
type cannot even be compared with reads as not checked, which is what the database would say of the
change of type too. A trigger fires on every `UPDATE` and `DELETE` of
the plan, and what it then does is code the check cannot read: the table's triggers are named
(`trigger-unfollowed`, a warning) so they are read before the plan runs. A fix of a column the
database generates is refused, as the database refuses the statement. On SQLite, where Prisma
changes a table by making a new one and dropping the old, the old table's triggers and `CHECK`
constraints go with it without a word from SQLite: `migrate plan --migration` says which, so they
can be written into the migration again. On PostgreSQL and MySQL an `ALTER TABLE` keeps both.

## License

Distributed under the MIT License. See [LICENSE](https://github.com/nakita628/hekireki?tab=MIT-1-ov-file) for more information.
