![img](https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/hekireki.png)

# Hekireki

**[Hekireki](https://www.npmjs.com/package/hekireki)** generates validation schemas, ORM models and
ER diagrams from a [Prisma](https://www.prisma.io/) schema, seeds a database, and helps you migrate
it without breaking the data in it.

## Installation

```bash
npm install -D hekireki
```

## Generators

Add a generator to `schema.prisma` and run `npx prisma generate`. `output` is required.

```prisma
generator Hekireki-Zod {
    provider = "hekireki-zod"
    output   = "./zod"
    type     = true  // Export TypeScript types
}
```

| Provider                                                                                                 | Generates                                               | Options                                                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `hekireki-zod`                                                                                           | [Zod](https://zod.dev/)                                 | `type`, `comment`, `relation`, `zod` (`"v4"`, `"mini"`, `"@hono/zod-openapi"`) |
| `hekireki-valibot`, `hekireki-arktype`, `hekireki-effect`, `hekireki-typebox`, `hekireki-ajv`            | Valibot, ArkType, Effect Schema, TypeBox, AJV           | `type`, `comment`, `relation`                                                  |
| `hekireki-pydantic`                                                                                      | Pydantic                                                | `comment`, `relation`                                                          |
| `hekireki-drizzle`, `hekireki-kysely`, `hekireki-sqlalchemy`, `hekireki-django`, `hekireki-activerecord` | Drizzle, Kysely, SQLAlchemy, Django, Active Record      |                                                                                |
| `hekireki-gorm`                                                                                          | GORM                                                    | `package`                                                                      |
| `hekireki-sea-orm`                                                                                       | SeaORM                                                  | `renameAll`                                                                    |
| `hekireki-ecto`                                                                                          | Ecto                                                    | `app`                                                                          |
| `hekireki-eloquent`                                                                                      | Eloquent                                                | `namespace`                                                                    |
| `hekireki-efcore` (PostgreSQL)                                                                           | EF Core                                                 | `namespace`, `context`                                                         |
| `hekireki-exposed` (PostgreSQL)                                                                          | Exposed                                                 | `package`, `dao`                                                               |
| `hekireki-atlas`                                                                                         | Atlas HCL                                               | `schemaName`, `comment`                                                        |
| `hekireki-er`                                                                                            | ER diagram                                              | `outputs` (`.md`, `.dbml`, `.png`, `.svg`), `theme`                            |
| `hekireki-seed`                                                                                          | The schema module `hekireki.config.ts` is typed against |                                                                                |

A `///` line starting with `@z.`, `@v.`, `@a.`, `@e.`, `@t.`, `@j.` or `@p.` is used as-is by Zod,
Valibot, ArkType, Effect Schema, TypeBox, AJV or Pydantic:

```prisma
model User {
    /// @z.email()
    /// @v.pipe(v.string(), v.email())
    email String @unique
}
```

## Studio

```bash
npx hekireki studio                  # ./prisma/schema.prisma or ./schema.prisma, on port 5555
npx hekireki studio --url file:./dev.db
```

The ER diagram, the rows of each model, a Prisma schema editor, a SQL console and a Prisma Client
playground, in the browser. The database is the one Prisma connects to (or `--url`). Works with
SQLite, PostgreSQL and MySQL.

<!-- The Migrate page is not shipped for now. It is still in the source, commented out at
src/studio/client/routes/migrate.tsx and in the sidebar; when it comes back, this list names
"a Prisma Client playground and a Migrate page" again. -->

## Seed

```bash
npx hekireki seed                    # Insert rows through the project's Prisma Client
npx hekireki seed --sql seed.sql     # Or write a SQL script
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

Every foreign key, unique constraint and enum in the schema is respected.

## Migrate

Before a migration, check what it does to the rows the database holds:

```bash
npx hekireki migrate check           # Rows the new schema breaks (NULLs, duplicates, orphans, ...)
npx hekireki migrate plan -m prisma/migrations/<name>/migration.sql -o prisma/migrations/<name>/migration.sql
```

What becomes of those rows (fill, keep one, delete, rename, convert) is written in
`.hekireki/migrate.json` beside the schema, or in the file `--decisions` names, and `migrate plan`
writes the decisions into the migration Prisma wrote.

<!-- The Migrate page of `hekireki studio` made those decisions, and could rehearse, run and
record the migration and back up the database first (SQLite, PostgreSQL). It is not shipped for
now; the page is still in the source. -->

## License

Distributed under the MIT License. See [LICENSE](https://github.com/nakita628/hekireki?tab=MIT-1-ov-file) for more information.
