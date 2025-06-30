import { afterEach, describe, it, expect } from 'vitest'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'

// Test run
// pnpm vitest run ./src/generator/zod/index.test.ts

describe('prisma generate', async () => {
  afterEach(() => {
    // Clean up generated files
    // fs.rmSync('./prisma/schema.prisma', { force: true })
    fs.rmSync('./prisma/zod', { recursive: true, force: true })
  })
  it('prisma generate zod comment true', async () => {
    const prisma = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator Hekireki-Zod {
  provider = "hekireki-zod"
  type     = true
  comment  = true
}

model User {
  /// Primary key
  /// @z.uuid()
  /// @v.pipe(v.string(), v.uuid())
  id    String  @id @default(uuid())
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
  id      String  @id @default(uuid())
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
  user    User     @relation(fields: [userId], references: [id])
}`

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate')
    const result = fs.readFileSync('./prisma/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import { z } from 'zod/v4'

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
`
    expect(result).toBe(expected)
  })

  it('prisma generate zod comment false', async () => {
    const prisma = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator Hekireki-Zod {
  provider = "hekireki-zod"
  type     = true
  comment  = false
}

model User {
  /// Primary key
  /// @z.uuid()
  /// @v.pipe(v.string(), v.uuid())
  id    String  @id @default(uuid())
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
  id      String  @id @default(uuid())
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
  user    User     @relation(fields: [userId], references: [id])
}`
    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate')
    const result = fs.readFileSync('./prisma/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import { z } from 'zod/v4'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
})

export type User = z.infer<typeof UserSchema>

export const PostSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(100),
  content: z.string(),
  userId: z.uuid(),
})

export type Post = z.infer<typeof PostSchema>
`
    expect(result).toBe(expected)
  })
  it('prisma generate zod comment delete', async () => {
    const prisma = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator Hekireki-Zod {
  provider = "hekireki-zod"
  type     = true
}

model User {
  /// Primary key
  /// @z.uuid()
  /// @v.pipe(v.string(), v.uuid())
  id    String  @id @default(uuid())
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
  id      String  @id @default(uuid())
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
  user    User     @relation(fields: [userId], references: [id])
}`
    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate')
    const result = fs.readFileSync('./prisma/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import { z } from 'zod/v4'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
})

export type User = z.infer<typeof UserSchema>

export const PostSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(100),
  content: z.string(),
  userId: z.uuid(),
})

export type Post = z.infer<typeof PostSchema>
`
    expect(result).toBe(expected)
  })
})
