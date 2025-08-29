import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

// Test run
// pnpm vitest run ./src/generator/zod/index.test.ts

describe('prisma generate', () => {
  afterEach(() => {
    // Clean up generated files
    fs.rmSync('./prisma-zod/schema.prisma', { force: true })
    fs.rmSync('./prisma-zod/zod', { recursive: true, force: true })
    fs.rmSync('./prisma-zod/zod-test', { recursive: true, force: true })
  })
  afterAll(() => {
    // Clean up the directory itself
    fs.rmSync('./prisma-zod', { recursive: true, force: true })
  })
  it('hekireki-zod', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
}

generator Hekireki-Zod {
    provider = "hekireki-zod"
}

model User {
    /// Primary key
    /// @z.uuid()
    id   String @id @default(uuid())
    /// Display name
    /// @z.string().min(1).max(50)
    name String
}`

    fs.mkdirSync('./prisma-zod', { recursive: true })
    fs.writeFileSync('./prisma-zod/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-zod/schema.prisma')
    const result = fs.readFileSync('./prisma-zod/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import * as z from 'zod'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
})
`
    expect(result).toBe(expected)
  })
  it('hekireki-zod comment true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
}

generator Hekireki-Zod {
    provider = "hekireki-zod"
    comment = true
}

model User {
    /// Primary key
    /// @z.uuid()
    id   String @id @default(uuid())
    /// Display name
    /// @z.string().min(1).max(50)
    name String
}`

    fs.mkdirSync('./prisma-zod', { recursive: true })
    fs.writeFileSync('./prisma-zod/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-zod/schema.prisma')
    const result = fs.readFileSync('./prisma-zod/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import * as z from 'zod'

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
`
    expect(result).toBe(expected)
  })

  it('hekireki-zod type true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
}

generator Hekireki-Zod {
    provider = "hekireki-zod"
    type    = true
}

model User {
    /// Primary key
    /// @z.uuid()
    id   String @id @default(uuid())
    /// Display name
    /// @z.string().min(1).max(50)
    name String
}`

    fs.mkdirSync('./prisma-zod', { recursive: true })
    fs.writeFileSync('./prisma-zod/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-zod/schema.prisma')
    const result = fs.readFileSync('./prisma-zod/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import * as z from 'zod'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
})

export type User = z.infer<typeof UserSchema>
`
    expect(result).toBe(expected)
  })
  it('hekireki-zod output zod-test file test.ts', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
}

generator Hekireki-Zod {
    provider = "hekireki-zod"
    output   = "zod-test"
    file     = "test.ts"
}

model User {
    /// Primary key
    /// @z.uuid()
    id   String @id @default(uuid())
    /// Display name
    /// @z.string().min(1).max(50)
    name String
}
`
    fs.mkdirSync('./prisma-zod', { recursive: true })
    fs.writeFileSync('./prisma-zod/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-zod/schema.prisma')
    const result = fs.readFileSync('./prisma-zod/zod-test/test.ts', {
      encoding: 'utf-8',
    })
    const expected = `import * as z from 'zod'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
})
`
    expect(result).toBe(expected)
  })

  it('hekireki-zod zod v4-mini', async () => {
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
    zod      = "mini"
}

model User {
    /// Primary key
    /// @z.string()
    id   String @id @default(uuid())
    /// Display name
    /// @z.string().check(z.minLength(5), z.maxLength(10))
    name String
}
`

    fs.mkdirSync('./prisma-zod', { recursive: true })
    fs.writeFileSync('./prisma-zod/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-zod/schema.prisma')
    const result = fs.readFileSync('./prisma-zod/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import * as z from 'zod/mini'

export const UserSchema = z.object({
  id: z.string(),
  name: z.string().check(z.minLength(5), z.maxLength(10)),
})

export type User = z.infer<typeof UserSchema>
`
    expect(result).toBe(expected)
  })
  it('hekireki-zod zod @hono/zod-openapi', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
}

generator Hekireki-Zod {
    provider = "hekireki-zod"
    type    = true
    zod     = "@hono/zod-openapi"
}

model User {
    /// Primary key
    /// @z.uuid()
    id   String @id @default(uuid())
    /// Display name
    /// @z.string().min(1).max(50)
    name String
}`

    fs.mkdirSync('./prisma-zod', { recursive: true })
    fs.writeFileSync('./prisma-zod/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-zod/schema.prisma')
    const result = fs.readFileSync('./prisma-zod/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import { z } from '@hono/zod-openapi'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
})

export type User = z.infer<typeof UserSchema>
`
    expect(result).toBe(expected)
  })

  it('hekireki-zod relation true', async () => {
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

generator Hekireki-Zod {
    provider = "hekireki-zod"
    type     = true
    comment  = true
    relation = true
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
`

    fs.mkdirSync('./prisma-zod', { recursive: true })
    fs.writeFileSync('./prisma-zod/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-zod/schema.prisma')
    const result = fs.readFileSync('./prisma-zod/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import * as z from 'zod'

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

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  posts: z.array(PostSchema),
})

export type UserRelations = z.infer<typeof UserRelationsSchema>

export const PostRelationsSchema = z.object({
  ...PostSchema.shape,
  user: UserSchema,
})

export type PostRelations = z.infer<typeof PostRelationsSchema>
`
    expect(result).toBe(expected)
  })
})
