import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

import { afterAll, afterEach, describe, expect, it } from 'vitest'

// Test run
// pnpm vitest run ./src/generator/arktype/index.test.ts

const command = async () => {
  await promisify(exec)('npx prisma generate --schema=./prisma-arktype/schema.prisma')
}

// arktype
describe('prisma generate arktype', () => {
  afterEach(() => {
    fs.rmSync('./prisma-arktype/schema.prisma', { force: true })
    fs.rmSync('./prisma-arktype/arktype', { recursive: true, force: true })
    fs.rmSync('./prisma-arktype/arktype-test', { recursive: true, force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-arktype', { recursive: true, force: true })
  })
  // default
  it('hekireki-arktype', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiArkType {
    provider = "hekireki-arktype"
    output   = "arktype"
}

model User {
    /// Primary key
    /// @z.uuid()
    /// @v.pipe(v.string(), v.uuid())
    /// @a."string.uuid"
    /// @e.Schema.UUID
    id    String @id @default(uuid())
    /// Display name
    /// @z.string().min(1).max(50)
    /// @v.pipe(v.string(), v.minLength(1), v.maxLength(50))
    /// @a."string"
    /// @e.Schema.String
    name  String
    /// One-to-many relation to Post
    posts Post[]
}

/// @relation User.id Post.userId one-to-many
model Post {
    /// Primary key
    /// @z.uuid()
    /// @v.pipe(v.string(), v.uuid())
    /// @a."string.uuid"
    /// @e.Schema.UUID
    id String @id @default(uuid())
    /// Article title
    /// @z.string().min(1).max(100)
    /// @v.pipe(v.string(), v.minLength(1), v.maxLength(100))
    /// @a."string"
    /// @e.Schema.String
    title String
    /// Body content (no length limit)
    /// @z.string()
    /// @v.string()
    /// @a."string"
    /// @e.Schema.String
    content String
    /// Foreign key referencing User.id
    /// @z.uuid()
    /// @v.pipe(v.string(), v.uuid())
    /// @a."string.uuid"
    /// @e.Schema.UUID
    userId  String
    /// Prisma relation definition
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-arktype', { recursive: true })
    fs.writeFileSync('./prisma-arktype/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-arktype/arktype/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type } from 'arktype'

export const UserSchema = type({
  id: 'string.uuid',
  name: 'string',
})

export const PostSchema = type({
  id: 'string.uuid',
  title: 'string',
  content: 'string',
  userId: 'string.uuid',
})
`
    expect(result).toBe(expected)
  }, 30000)

  // comment true
  it('hekireki-arktype comment true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiArkType {
    provider = "hekireki-arktype"
    output   = "arktype"
    comment  = true
}

model User {
    /// Primary key
    /// @a."string.uuid"
    id    String @id @default(uuid())
    /// Display name
    /// @a."string"
    name  String
    posts Post[]
}

model Post {
    /// Primary key
    /// @a."string.uuid"
    id String @id @default(uuid())
    /// Article title
    /// @a."string"
    title String
    /// Body content
    /// @a."string"
    content String
    /// Foreign key
    /// @a."string.uuid"
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-arktype', { recursive: true })
    fs.writeFileSync('./prisma-arktype/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-arktype/arktype/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type } from 'arktype'

export const UserSchema = type({
  /**
   * Primary key
   */
  id: 'string.uuid',
  /**
   * Display name
   */
  name: 'string',
})

export const PostSchema = type({
  /**
   * Primary key
   */
  id: 'string.uuid',
  /**
   * Article title
   */
  title: 'string',
  /**
   * Body content
   */
  content: 'string',
  /**
   * Foreign key
   */
  userId: 'string.uuid',
})
`
    expect(result).toBe(expected)
  }, 30000)

  // type true
  it('hekireki-arktype type true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiArkType {
    provider = "hekireki-arktype"
    output   = "arktype"
    type     = true
}

model User {
    /// @a."string.uuid"
    id    String @id @default(uuid())
    /// @a."string"
    name  String
    posts Post[]
}

model Post {
    /// @a."string.uuid"
    id String @id @default(uuid())
    /// @a."string"
    title String
    /// @a."string"
    content String
    /// @a."string.uuid"
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-arktype', { recursive: true })
    fs.writeFileSync('./prisma-arktype/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-arktype/arktype/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type } from 'arktype'

export const UserSchema = type({
  id: 'string.uuid',
  name: 'string',
})

export type User = typeof UserSchema.infer

export const PostSchema = type({
  id: 'string.uuid',
  title: 'string',
  content: 'string',
  userId: 'string.uuid',
})

export type Post = typeof PostSchema.infer
`
    expect(result).toBe(expected)
  }, 30000)

  // type + comment + relation
  it('hekireki-arktype type true comment true relation true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiArkType {
    provider = "hekireki-arktype"
    output   = "arktype"
    type     = true
    comment  = true
    relation = true
}

model User {
    /// Primary key
    /// @a."string.uuid"
    id    String @id @default(uuid())
    /// Display name
    /// @a."string"
    name  String
    posts Post[]
}

model Post {
    /// Primary key
    /// @a."string.uuid"
    id String @id @default(uuid())
    /// Article title
    /// @a."string"
    title String
    /// Body content
    /// @a."string"
    content String
    /// Foreign key
    /// @a."string.uuid"
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-arktype', { recursive: true })
    fs.writeFileSync('./prisma-arktype/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-arktype/arktype/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type } from 'arktype'

export const UserSchema = type({
  /**
   * Primary key
   */
  id: 'string.uuid',
  /**
   * Display name
   */
  name: 'string',
})

export type User = typeof UserSchema.infer

export const PostSchema = type({
  /**
   * Primary key
   */
  id: 'string.uuid',
  /**
   * Article title
   */
  title: 'string',
  /**
   * Body content
   */
  content: 'string',
  /**
   * Foreign key
   */
  userId: 'string.uuid',
})

export type Post = typeof PostSchema.infer

export const UserRelationsSchema = type({ ...UserSchema.t, posts: PostSchema.array() })

export type UserRelations = typeof UserRelationsSchema.infer

export const PostRelationsSchema = type({ ...PostSchema.t, user: UserSchema })

export type PostRelations = typeof PostRelationsSchema.infer
`
    expect(result).toBe(expected)
  }, 30000)

  // custom output path
  it('hekireki-arktype output arktype-test/test.ts', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiArkType {
    provider = "hekireki-arktype"
    output   = "arktype-test/test.ts"
}

model User {
    /// @a."string.uuid"
    id    String @id @default(uuid())
    /// @a."string"
    name  String
}
`

    fs.mkdirSync('./prisma-arktype', { recursive: true })
    fs.writeFileSync('./prisma-arktype/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-arktype/arktype-test/test.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type } from 'arktype'

export const UserSchema = type({
  id: 'string.uuid',
  name: 'string',
})
`
    expect(result).toBe(expected)
  }, 30000)
})

// no annotation
describe('prisma generate arktype (no annotation)', () => {
  afterEach(() => {
    fs.rmSync('./prisma-arktype/schema.prisma', { force: true })
    fs.rmSync('./prisma-arktype/arktype', { recursive: true, force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-arktype', { recursive: true, force: true })
  })

  it('hekireki-arktype no annotation', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiArkType {
    provider = "hekireki-arktype"
    output   = "arktype"
}

model User {
    id    String @id @default(uuid())
    name  String
    posts Post[]
}

model Post {
    id      String @id @default(uuid())
    title   String
    content String
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-arktype', { recursive: true })
    fs.writeFileSync('./prisma-arktype/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-arktype/arktype/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type } from 'arktype'

export const UserSchema = type({
  id: 'string',
  name: 'string',
})

export const PostSchema = type({
  id: 'string',
  title: 'string',
  content: 'string',
  userId: 'string',
})
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-arktype no annotation relation true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiArkType {
    provider = "hekireki-arktype"
    output   = "arktype"
    relation = true
}

model User {
    id    String @id @default(uuid())
    name  String
    posts Post[]
}

model Post {
    id      String @id @default(uuid())
    title   String
    content String
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-arktype', { recursive: true })
    fs.writeFileSync('./prisma-arktype/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-arktype/arktype/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type } from 'arktype'

export const UserSchema = type({
  id: 'string',
  name: 'string',
})

export const PostSchema = type({
  id: 'string',
  title: 'string',
  content: 'string',
  userId: 'string',
})

export const UserRelationsSchema = type({ ...UserSchema.t, posts: PostSchema.array() })

export const PostRelationsSchema = type({ ...PostSchema.t, user: UserSchema })
`
    expect(result).toBe(expected)
  }, 30000)
})

// edge cases
describe('prisma generate arktype (edge cases)', () => {
  afterEach(() => {
    fs.rmSync('./prisma-arktype/schema.prisma', { force: true })
    fs.rmSync('./prisma-arktype/arktype', { recursive: true, force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-arktype', { recursive: true, force: true })
  })

  it('hekireki-arktype enum fields', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiArkType {
    provider = "hekireki-arktype"
    output   = "arktype"
}

enum Role {
    ADMIN
    USER
    MODERATOR
}

model UserWithEnum {
    id    String @id @default(uuid())
    role  Role
}
`

    fs.mkdirSync('./prisma-arktype', { recursive: true })
    fs.writeFileSync('./prisma-arktype/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-arktype/arktype/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type } from 'arktype'

export const UserWithEnumSchema = type({
  id: 'string',
  role: "'ADMIN' | 'USER' | 'MODERATOR'",
})
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-arktype all scalar types', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiArkType {
    provider = "hekireki-arktype"
    output   = "arktype"
}

model AllTypes {
    id    String   @id @default(uuid())
    str   String
    num   Int
    flt   Float
    bool  Boolean
    date  DateTime
    big   BigInt
    dec   Decimal
    json  Json
    bytes Bytes
}
`

    fs.mkdirSync('./prisma-arktype', { recursive: true })
    fs.writeFileSync('./prisma-arktype/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-arktype/arktype/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type } from 'arktype'

export const AllTypesSchema = type({
  id: 'string',
  str: 'string',
  num: 'number',
  flt: 'number',
  bool: 'boolean',
  date: 'Date',
  big: 'bigint',
  dec: 'number',
  json: 'unknown',
  bytes: 'unknown',
})
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-arktype nullable fields', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiArkType {
    provider = "hekireki-arktype"
    output   = "arktype"
}

model NullableModel {
    id     String   @id @default(uuid())
    name   String?
    age    Int?
    active Boolean?
}
`

    fs.mkdirSync('./prisma-arktype', { recursive: true })
    fs.writeFileSync('./prisma-arktype/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-arktype/arktype/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type } from 'arktype'

export const NullableModelSchema = type({
  id: 'string',
  name: 'string',
  age: 'number',
  active: 'boolean',
})
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-arktype multiple annotations extracts only @a', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiArkType {
    provider = "hekireki-arktype"
    output   = "arktype"
}

model Multi {
    /// @z.uuid()
    /// @v.pipe(v.string(), v.uuid())
    /// @a."string.uuid"
    /// @e.Schema.UUID
    id String @id @default(uuid())
}
`

    fs.mkdirSync('./prisma-arktype', { recursive: true })
    fs.writeFileSync('./prisma-arktype/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-arktype/arktype/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { type } from 'arktype'

export const MultiSchema = type({
  id: 'string.uuid',
})
`
    expect(result).toBe(expected)
  }, 30000)
})
