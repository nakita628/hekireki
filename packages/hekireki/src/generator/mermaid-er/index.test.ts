import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/index.test.ts

describe('prisma generate', async () => {
  beforeEach(() => {
    // Ensure the prisma directory exists
    fs.mkdirSync('./prisma', { recursive: true })
  })

  afterEach(() => {
    // Clean up generated files
    fs.rmSync('./prisma/schema.prisma', { force: true })
    fs.rmSync('./prisma/mermaid-er', { recursive: true, force: true })
    fs.rmSync('./prisma/mermaid-er2', { recursive: true, force: true })
    fs.mkdirSync('./prisma', { recursive: true })
  })
  it('hekireki-mermaid-er', async () => {
    const prisma = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator Hekireki-ER {
  provider = "hekireki-mermaid-er"
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
  id      String @id @default(uuid())
  /// Article title
  /// @z.string().min(1).max(100)
  /// @v.pipe(v.string(), v.minLength(1), v.maxLength(100))
  title   String
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
`

    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate')
    const result = fs.readFileSync('./prisma/mermaid-er/ER.md', {
      encoding: 'utf-8',
    })
    const expected = `\`\`\`mermaid
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
\`\`\``

    expect(result).toBe(expected)
  })
})
