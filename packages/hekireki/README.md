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
reloads when the schema changes. The database comes from `--url`, `DATABASE_URL` or
`prisma.config.ts`.

## License

Distributed under the MIT License. See [LICENSE](https://github.com/nakita628/hekireki?tab=MIT-1-ov-file) for more information.
