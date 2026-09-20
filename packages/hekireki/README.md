![img](https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/hekireki.png)

# Hekireki

**[Hekireki](https://www.npmjs.com/package/hekireki)** generates validation schemas, ORM models and
ER diagrams from a [Prisma](https://www.prisma.io/) schema, and seeds a database.

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
