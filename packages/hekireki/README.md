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
generator Hekireki-Zod {
    provider = "hekireki-zod"
    output   = "./zod"
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
- `hekireki-atlas` — [Atlas](https://atlasgo.io/) HCL

### ER diagrams

- `hekireki-er` — Mermaid, DBML, PNG and SVG

## Options

```prisma
generator Hekireki-Zod {
    provider = "hekireki-zod"
    output   = "./zod"
    type     = true  // Export TypeScript types
    comment  = true  // Keep /// comments
    relation = true  // Add <Model>Relations schemas
    zod      = "v4"  // "v4" (default), "mini" or "@hono/zod-openapi"
}
```

- `type`, `comment`, `relation` — every validation schema generator (Pydantic: `comment`, `relation`)
- `package` — GORM package name (default: `model`)
- `renameAll` — SeaORM `#[serde(rename_all = "...")]`
- `app` — Ecto module prefix (default: `MyApp`)
- `namespace` — Eloquent (default: `App\Models`) and EF Core (default: `Models`)
- `context` — EF Core `DbContext` class name (default: `AppDbContext`)
- `schemaName`, `comment` — Atlas
- `outputs`, `theme` — ER

## Annotations

A `///` line starting with `@z.`, `@v.`, `@a.`, `@e.`, `@t.`, `@j.` or `@p.` is used as-is by Zod,
Valibot, ArkType, Effect Schema, TypeBox, AJV or Pydantic. Any other `///` line is documentation.

```prisma
model User {
    /// Display name
    /// @z.string().min(1).max(50)
    /// @v.pipe(v.string(), v.minLength(1), v.maxLength(50))
    name String
}
```

## ER diagrams

The extension of each path picks the format: `.md` (Mermaid), `.dbml`, `.png` or `.svg`.

```prisma
generator Hekireki-ER {
    provider = "hekireki-er"
    outputs  = ["docs/er.md", "docs/er.svg"] // One file: output = "docs/er.md"
    theme    = "dark"                         // .png / .svg: "light" (default) or "dark"
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
