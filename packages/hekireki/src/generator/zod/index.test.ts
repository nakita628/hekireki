import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

// Test run
// pnpm vitest run ./src/generator/zod/index.test.ts

const command = async () => {
  await promisify(exec)('npx prisma generate --schema=./prisma/schema.prisma')
}

// zod
describe('prisma generate zod', () => {
  afterEach(() => {
    // Clean up generated files
    fs.rmSync('./prisma/schema.prisma', { force: true })
    fs.rmSync('./prisma/zod', { recursive: true, force: true })
    fs.rmSync('./prisma/zod-test', { recursive: true, force: true })
  })
  afterAll(() => {
    // Clean up the directory itself
    fs.rmSync('./prisma-zod', { recursive: true, force: true })
  })
  // default
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

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    // await promisify(exec)('npx prisma generate --schema=./prisma-zod/schema.prisma')
    const result = fs.readFileSync('./prisma/zod/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import * as z from 'zod'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
})

export const PostSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(100),
  content: z.string(),
  userId: z.uuid(),
})
`
    expect(result).toBe(expected)
  }, 30000)
  // comment true
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
      comment  = true
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

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/zod/index.ts', {
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
`
    expect(result).toBe(expected)
  }, 30000)

  // type true
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
      type     = true
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

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import * as z from 'zod'

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
  // output zod-test file test.ts
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
    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/zod-test/test.ts', {
      encoding: 'utf-8',
    })
    const expected = `import * as z from 'zod'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
})

export const PostSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(100),
  content: z.string(),
  userId: z.uuid(),
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
      zod     = "mini"
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
      /// @z.string()
      id String @id @default(uuid())
      /// Article title
      /// @z.string()
      title String
      /// Body content (no length limit)
      /// @z.string()
      content String
      /// Foreign key referencing User.id
      /// @z.string()
      /// @z.string()
      userId  String
      /// Prisma relation definition
      user    User   @relation(fields: [userId], references: [id])
  }
`

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import * as z from 'zod/mini'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
})

export const PostSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  userId: z.string(),
})
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
      zod      = "@hono/zod-openapi"
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

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/zod/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import { z } from '@hono/zod-openapi'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
})

export const PostSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(100),
  content: z.string(),
  userId: z.uuid(),
})
`
    expect(result).toBe(expected)
  })

  it('hekireki-zod comment true relation true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
}

generator Hekireki-Zod {
    provider = "hekireki-zod"
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

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/zod/index.ts', {
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

export const UserRelationsSchema = z.object({ ...UserSchema.shape, posts: z.array(PostSchema) })

export const PostRelationsSchema = z.object({ ...PostSchema.shape, user: UserSchema })
`
    expect(result).toBe(expected)
  })

  it('hekireki-zod type true comment true relation true', async () => {
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

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/zod/index.ts', {
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

export const UserRelationsSchema = z.object({ ...UserSchema.shape, posts: z.array(PostSchema) })

export type UserRelations = z.infer<typeof UserRelationsSchema>

export const PostRelationsSchema = z.object({ ...PostSchema.shape, user: UserSchema })

export type PostRelations = z.infer<typeof PostRelationsSchema>
`
    expect(result).toBe(expected)
  })
})

// valibot
describe('prisma generate valibot', () => {
  afterEach(() => {
    // Clean up generated files
    fs.rmSync('./prisma/schema.prisma', { force: true })
    fs.rmSync('./prisma/valibot', { recursive: true, force: true })
    fs.rmSync('./prisma/valibot-test', { recursive: true, force: true })
  })
  afterAll(() => {
    // Clean up the directory itself
    fs.rmSync('./prisma-valibot', { recursive: true, force: true })
  })
  // zod
  // default
  it('hekireki-valibot', async () => {
    const prisma = `generator client {
      provider = "prisma-client-js"
  }
  
  datasource db {
      provider = "sqlite"
      url      = env("DATABASE_URL")
  }
  
  generator Hekireki-Valibot {
      provider = "hekireki-valibot"
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

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    // await promisify(exec)('npx prisma generate --schema=./prisma-zod/schema.prisma')
    const result = fs.readFileSync('./prisma/valibot/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import * as v from 'valibot'

export const UserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
})

export const PostSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  content: v.string(),
  userId: v.pipe(v.string(), v.uuid()),
})
`
    expect(result).toBe(expected)
  })
  // comment true
  it('hekireki-valibot comment true', async () => {
    const prisma = `generator client {
      provider = "prisma-client-js"
  }
  
  datasource db {
      provider = "sqlite"
      url      = env("DATABASE_URL")
  }
  
  generator Hekireki-Valibot {
      provider = "hekireki-valibot"
      comment  = true
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

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/valibot/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import * as v from 'valibot'

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
`
    expect(result).toBe(expected)
  })

  // type true
  it('hekireki-valibot type true', async () => {
    const prisma = `generator client {
      provider = "prisma-client-js"
  }
  
  datasource db {
      provider = "sqlite"
      url      = env("DATABASE_URL")
  }
  
  generator Hekireki-Valibot {
      provider = "hekireki-valibot"
      type     = true
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

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/valibot/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import * as v from 'valibot'

export const UserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
})

export type User = v.InferInput<typeof UserSchema>

export const PostSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  content: v.string(),
  userId: v.pipe(v.string(), v.uuid()),
})

export type Post = v.InferInput<typeof PostSchema>
`
    expect(result).toBe(expected)
  })
  // output zod-test file test.ts
  it('hekireki-zod output zod-test file test.ts', async () => {
    const prisma = `generator client {
      provider = "prisma-client-js"
  }
  
  datasource db {
      provider = "sqlite"
      url      = env("DATABASE_URL")
  }
  
  generator Hekireki-Valibot {
      provider = "hekireki-valibot"
      output   = "valibot-test"
      file     = "test.ts"
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
    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/valibot-test/test.ts', {
      encoding: 'utf-8',
    })

    const expected = `import * as v from 'valibot'

export const UserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
})

export const PostSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  content: v.string(),
  userId: v.pipe(v.string(), v.uuid()),
})
`
    expect(result).toBe(expected)
  })

  it('hekireki-valibot comment true relation true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
}

generator Hekireki-Valibot {
    provider = "hekireki-valibot"
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

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/valibot/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import * as v from 'valibot'

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

export const UserRelationsSchema = v.object({ ...UserSchema.entries, posts: v.array(PostSchema) })

export const PostRelationsSchema = v.object({ ...PostSchema.entries, user: UserSchema })
`
    expect(result).toBe(expected)
  })

  it('hekireki-zod type true comment true relation true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
}

generator Hekireki-Valibot {
    provider = "hekireki-valibot"
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

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma/valibot/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import * as v from 'valibot'

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

export const UserRelationsSchema = v.object({ ...UserSchema.entries, posts: v.array(PostSchema) })

export type UserRelations = v.InferInput<typeof UserRelationsSchema>

export const PostRelationsSchema = v.object({ ...PostSchema.entries, user: UserSchema })

export type PostRelations = v.InferInput<typeof PostRelationsSchema>
`
    expect(result).toBe(expected)
  })
})
