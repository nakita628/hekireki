import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vite-plus/test'

// Test run
// pnpm vitest run ./src/generator/typebox/index.test.ts

const command = async () => {
  await promisify(exec)('npx prisma generate --schema=./prisma-typebox/schema.prisma')
}

describe('prisma generate typebox', () => {
  afterEach(() => {
    fs.rmSync('./prisma-typebox', { recursive: true, force: true })
  })

  // default
  it('hekireki-typebox', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-TypeBox {
    provider = "hekireki-typebox"
    output   = "typebox"
}

model User {
    /// Primary key
    /// @t.Type.String({ format: 'uuid' })
    id    String @id @default(uuid())
    /// Display name
    /// @t.Type.String({ minLength: 1, maxLength: 50 })
    name  String
    /// One-to-many relation to Post
    posts Post[]
}

model Post {
    /// Primary key
    /// @t.Type.String({ format: 'uuid' })
    id String @id @default(uuid())
    /// Article title
    /// @t.Type.String({ minLength: 1, maxLength: 100 })
    title String
    /// Body content
    /// @t.Type.String()
    content String
    /// Foreign key
    /// @t.Type.String({ format: 'uuid' })
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-typebox', { recursive: true })
    fs.writeFileSync('./prisma-typebox/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-typebox/typebox/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String({ minLength: 1, maxLength: 50 }),
})

export const PostSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  title: Type.String({ minLength: 1, maxLength: 100 }),
  content: Type.String(),
  userId: Type.String({ format: 'uuid' }),
})
`
    expect(result).toBe(expected)
  }, 30000)

  // comment true
  it('hekireki-typebox comment true', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-TypeBox {
    provider = "hekireki-typebox"
    output   = "typebox"
    comment  = true
}

model User {
    /// Primary key
    /// @t.Type.String({ format: 'uuid' })
    id    String @id @default(uuid())
    /// Display name
    /// @t.Type.String({ minLength: 1, maxLength: 50 })
    name  String
    posts Post[]
}

model Post {
    /// Primary key
    /// @t.Type.String({ format: 'uuid' })
    id String @id @default(uuid())
    /// Article title
    /// @t.Type.String({ minLength: 1, maxLength: 100 })
    title String
    /// Body content
    /// @t.Type.String()
    content String
    /// Foreign key
    /// @t.Type.String({ format: 'uuid' })
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-typebox', { recursive: true })
    fs.writeFileSync('./prisma-typebox/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-typebox/typebox/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  /**
   * Primary key
   */
  id: Type.String({ format: 'uuid' }),
  /**
   * Display name
   */
  name: Type.String({ minLength: 1, maxLength: 50 }),
})

export const PostSchema = Type.Object({
  /**
   * Primary key
   */
  id: Type.String({ format: 'uuid' }),
  /**
   * Article title
   */
  title: Type.String({ minLength: 1, maxLength: 100 }),
  /**
   * Body content
   */
  content: Type.String(),
  /**
   * Foreign key
   */
  userId: Type.String({ format: 'uuid' }),
})
`
    expect(result).toBe(expected)
  }, 30000)

  // type true
  it('hekireki-typebox type true', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-TypeBox {
    provider = "hekireki-typebox"
    output   = "typebox"
    type     = true
}

model User {
    /// @t.Type.String({ format: 'uuid' })
    id    String @id @default(uuid())
    /// @t.Type.String({ minLength: 1, maxLength: 50 })
    name  String
    posts Post[]
}

model Post {
    /// @t.Type.String({ format: 'uuid' })
    id String @id @default(uuid())
    /// @t.Type.String({ minLength: 1, maxLength: 100 })
    title String
    /// @t.Type.String()
    content String
    /// @t.Type.String({ format: 'uuid' })
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-typebox', { recursive: true })
    fs.writeFileSync('./prisma-typebox/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-typebox/typebox/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type Static, Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String({ minLength: 1, maxLength: 50 }),
})

export type User = Static<typeof UserSchema>

export const PostSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  title: Type.String({ minLength: 1, maxLength: 100 }),
  content: Type.String(),
  userId: Type.String({ format: 'uuid' }),
})

export type Post = Static<typeof PostSchema>
`
    expect(result).toBe(expected)
  }, 30000)

  // type true comment true relation true
  it('hekireki-typebox type true comment true relation true', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-TypeBox {
    provider = "hekireki-typebox"
    output   = "typebox"
    type     = true
    comment  = true
    relation = true
}

model User {
    /// Primary key
    /// @t.Type.String({ format: 'uuid' })
    id    String @id @default(uuid())
    /// Display name
    /// @t.Type.String({ minLength: 1, maxLength: 50 })
    name  String
    posts Post[]
}

model Post {
    /// Primary key
    /// @t.Type.String({ format: 'uuid' })
    id String @id @default(uuid())
    /// Article title
    /// @t.Type.String({ minLength: 1, maxLength: 100 })
    title String
    /// Body content
    /// @t.Type.String()
    content String
    /// Foreign key
    /// @t.Type.String({ format: 'uuid' })
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-typebox', { recursive: true })
    fs.writeFileSync('./prisma-typebox/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-typebox/typebox/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type Static, Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  /**
   * Primary key
   */
  id: Type.String({ format: 'uuid' }),
  /**
   * Display name
   */
  name: Type.String({ minLength: 1, maxLength: 50 }),
})

export type User = Static<typeof UserSchema>

export const PostSchema = Type.Object({
  /**
   * Primary key
   */
  id: Type.String({ format: 'uuid' }),
  /**
   * Article title
   */
  title: Type.String({ minLength: 1, maxLength: 100 }),
  /**
   * Body content
   */
  content: Type.String(),
  /**
   * Foreign key
   */
  userId: Type.String({ format: 'uuid' }),
})

export type Post = Static<typeof PostSchema>

export const UserRelationsSchema = Type.Object({
  ...UserSchema.properties,
  posts: Type.Array(PostSchema),
})

export type UserRelations = Static<typeof UserRelationsSchema>

export const PostRelationsSchema = Type.Object({
  ...PostSchema.properties,
  user: UserSchema,
})

export type PostRelations = Static<typeof PostRelationsSchema>
`
    expect(result).toBe(expected)
  }, 30000)

  // no annotation
  it('hekireki-typebox no annotation', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-TypeBox {
    provider = "hekireki-typebox"
    output   = "typebox"
}

model User {
    id    String @id @default(uuid())
    name  String
    posts Post[]
}

model Post {
    id String @id @default(uuid())
    title String
    content String
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-typebox', { recursive: true })
    fs.writeFileSync('./prisma-typebox/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-typebox/typebox/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
})

export const PostSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  content: Type.String(),
  userId: Type.String(),
})
`
    expect(result).toBe(expected)
  }, 30000)

  // custom output path
  it('hekireki-typebox output typebox-test/test.ts', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-TypeBox {
    provider = "hekireki-typebox"
    output   = "typebox-test/test.ts"
}

model User {
    /// @t.Type.String({ format: 'uuid' })
    id    String @id @default(uuid())
    /// @t.Type.String()
    name  String
}
`

    fs.mkdirSync('./prisma-typebox', { recursive: true })
    fs.writeFileSync('./prisma-typebox/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-typebox/typebox-test/test.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
})
`
    expect(result).toBe(expected)
  }, 30000)

  // no annotation relation true
  it('hekireki-typebox no annotation relation true', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-TypeBox {
    provider = "hekireki-typebox"
    output   = "typebox"
    relation = true
    type     = true
}

model User {
    id    String @id @default(uuid())
    name  String
    posts Post[]
}

model Post {
    id String @id @default(uuid())
    title String
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-typebox', { recursive: true })
    fs.writeFileSync('./prisma-typebox/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-typebox/typebox/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type Static, Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
})

export type User = Static<typeof UserSchema>

export const PostSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  userId: Type.String(),
})

export type Post = Static<typeof PostSchema>

export const UserRelationsSchema = Type.Object({
  ...UserSchema.properties,
  posts: Type.Array(PostSchema),
})

export type UserRelations = Static<typeof UserRelationsSchema>

export const PostRelationsSchema = Type.Object({
  ...PostSchema.properties,
  user: UserSchema,
})

export type PostRelations = Static<typeof PostRelationsSchema>
`
    expect(result).toBe(expected)
  }, 30000)
})
