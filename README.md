# Hekireki

**[Hekireki](https://www.npmjs.com/package/hekireki)** is a tool that generates validation schemas for Zod and Valibot, as well as ER diagrams, from [Prisma](https://www.prisma.io/) schemas annotated with comments.

## Features

- 💎 Automatically generates [Zod](https://zod.dev/) schemas from your Prisma schema
- 🤖 Automatically generates [Valibot](https://valibot.dev/) schemas from your Prisma schema
- 📊 Creates [Mermaid](https://mermaid.js.org/) ER diagrams

## Installation

```bash
npm install -D hekireki
```

## Usage

Prepare `schema.prisma`:

```prisma
generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
}

generator Hekireki-ER {
    provider = "hekireki-mermaid-er"
}

generator Hekireki-Zod {
    provider = "hekireki-zod"
    type     = true
    comment  = false
}

generator Hekireki-Valibot {
    provider = "hekireki-valibot"
    type     = true
    comment  = false
}

model User {
    /// Primary key
    /// @z.uuid()
    /// @v.pipe(v.string(), v.uuid())
    id    String @id @default(uuid())
    /// Display name
    /// @z.string().min(1).max(50)
    /// @v.pipe(v.string(), v.minLength(1), v.maxLength(50))
    name  String
    /// One-to-many relation to Post
    posts Post[]
}

/// @relation User.id Post.userId one-to-many
model Post {
    /// Primary key
    /// @z.uuid()
    /// @v.pipe(v.string(), v.uuid())
    id String @id @default(uuid())

    /// Article title
    /// @z.string().min(1).max(100)
    /// @v.pipe(v.string(), v.minLength(1), v.maxLength(100))
    title String

    /// Body content (no length limit)
    /// @z.string()
    /// @v.string()
    content String
    /// Foreign key referencing User.id
    /// @z.uuid()
    /// @v.pipe(v.string(), v.uuid())
    userId  String
    /// Prisma relation definition
    user    User   @relation(fields: [userId], references: [id])
}
```

## Generate

## Zod

```ts
import { z } from 'zod/v4'

export const UserSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50),
})

export type User = z.infer<typeof UserSchema>

export const PostSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Article title
   */
  title: z.string().min(1).max(100),
  /**
   * Body content (no length limit)
   */
  content: z.string(),
  /**
   * Foreign key referencing User.id
   */
  userId: z.uuid(),
})

export type Post = z.infer<typeof PostSchema>
```

## Valibot
```ts
import * as v from 'valibot'

export const UserSchema = v.object({
  /**
   * Primary key
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
})

export type User = v.InferInput<typeof UserSchema>

export const PostSchema = v.object({
  /**
   * Primary key
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Article title
   */
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  /**
   * Body content (no length limit)
   */
  content: v.string(),
  /**
   * Foreign key referencing User.id
   */
  userId: v.pipe(v.string(), v.uuid()),
})

export type Post = v.InferInput<typeof PostSchema>
```

## Mermaid

```mermaid
erDiagram
    User ||--}| Post : "(id) - (userId)"
    User {
        String id "Primary key"
        String name "Display name"
    }
    Post {
        String id "Primary key"
        String title "Article title"
        String content "Body content (no length limit)"
        String userId "Foreign key referencing User.id"
    }
```

## Configuration

### Zod Generator Options

| Option       | Type      | Default                             | Description                                      |
|--------------|-----------|-------------------------------------|--------------------------------------------------|
| `output`     | `string`  | `./zod`                             | Output directory                                 |
| `file`       | `string`  | `index.ts`                          | File Name                                        |
| `type`       | `boolean` | `false`                             | Generate TypeScript types                        |
| `comment`    | `boolean` | `false`                             | Include schema documentation                     |
| `zod`        | `string`  | `'v4'`                              | Zod import version (`'v4-mini'`, `'@hono/zod-openapi'`, or default `'v4'`) |

### Valibot Generator Options

| Option       | Type      | Default                             | Description                                      |
|--------------|-----------|-------------------------------------|--------------------------------------------------|
| `output`     | `string`  | `./valibot`                         | Output directory                                 |
| `file`       | `string`  | `index.ts`                          | File Name                                        |
| `type`       | `boolean` | `false`                             | Generate TypeScript types                        |
| `comment`    | `boolean` | `false`                             | Include schema documentation                     |

### Mermaid ER Generator Options

| Option       | Type      | Default                             | Description                                      |
|--------------|-----------|-------------------------------------|--------------------------------------------------|
| `output`     | `string`  | `./mermaid-er`                      | Output directory                                 |
| `file`       | `string`  | `ER.md`                             | File Name                                        |

⚠️ WARNING: Potential Breaking Changes Without Notice

This project is in **early development** and being maintained by a developer with about 2 years of experience. While I'm doing my best to create a useful tool:


## License

Distributed under the MIT License. See [LICENSE](https://github.com/nakita628/hekireki?tab=MIT-1-ov-file) for more information.