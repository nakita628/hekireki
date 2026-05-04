import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

import { afterAll, afterEach, describe, expect, it } from 'vite-plus/test'

// Test run
// pnpm vitest run ./src/generator/effect/index.test.ts

const command = async () => {
  await promisify(exec)('npx prisma generate --schema=./prisma-effect/schema.prisma')
}

// effect
describe('prisma generate effect', () => {
  afterEach(() => {
    fs.rmSync('./prisma-effect/schema.prisma', { force: true })
    fs.rmSync('./prisma-effect/effect', { recursive: true, force: true })
    fs.rmSync('./prisma-effect/effect-test', { recursive: true, force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-effect', { recursive: true, force: true })
  })
  // default
  it('hekireki-effect', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiEffect {
    provider = "hekireki-effect"
    output   = "effect"
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

    fs.mkdirSync('./prisma-effect', { recursive: true })
    fs.writeFileSync('./prisma-effect/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-effect/effect/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String,
})

export const PostSchema = Schema.Struct({
  id: Schema.UUID,
  title: Schema.String,
  content: Schema.String,
  userId: Schema.UUID,
})
`
    expect(result).toBe(expected)
  }, 30000)

  // comment true
  it('hekireki-effect comment true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiEffect {
    provider = "hekireki-effect"
    output   = "effect"
    comment  = true
}

model User {
    /// Primary key
    /// @e.Schema.UUID
    id    String @id @default(uuid())
    /// Display name
    /// @e.Schema.String
    name  String
    posts Post[]
}

model Post {
    /// Primary key
    /// @e.Schema.UUID
    id String @id @default(uuid())
    /// Article title
    /// @e.Schema.String
    title String
    /// Body content
    /// @e.Schema.String
    content String
    /// Foreign key
    /// @e.Schema.UUID
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-effect', { recursive: true })
    fs.writeFileSync('./prisma-effect/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-effect/effect/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  /**
   * Primary key
   */
  id: Schema.UUID,
  /**
   * Display name
   */
  name: Schema.String,
})

export const PostSchema = Schema.Struct({
  /**
   * Primary key
   */
  id: Schema.UUID,
  /**
   * Article title
   */
  title: Schema.String,
  /**
   * Body content
   */
  content: Schema.String,
  /**
   * Foreign key
   */
  userId: Schema.UUID,
})
`
    expect(result).toBe(expected)
  }, 30000)

  // type true
  it('hekireki-effect type true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiEffect {
    provider = "hekireki-effect"
    output   = "effect"
    type     = true
}

model User {
    /// @e.Schema.UUID
    id    String @id @default(uuid())
    /// @e.Schema.String
    name  String
    posts Post[]
}

model Post {
    /// @e.Schema.UUID
    id String @id @default(uuid())
    /// @e.Schema.String
    title String
    /// @e.Schema.String
    content String
    /// @e.Schema.UUID
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-effect', { recursive: true })
    fs.writeFileSync('./prisma-effect/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-effect/effect/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String,
})

export type UserEncoded = typeof UserSchema.Encoded

export const PostSchema = Schema.Struct({
  id: Schema.UUID,
  title: Schema.String,
  content: Schema.String,
  userId: Schema.UUID,
})

export type PostEncoded = typeof PostSchema.Encoded
`
    expect(result).toBe(expected)
  }, 30000)

  // type + comment + relation
  it('hekireki-effect type true comment true relation true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiEffect {
    provider = "hekireki-effect"
    output   = "effect"
    type     = true
    comment  = true
    relation = true
}

model User {
    /// Primary key
    /// @e.Schema.UUID
    id    String @id @default(uuid())
    /// Display name
    /// @e.Schema.String
    name  String
    posts Post[]
}

model Post {
    /// Primary key
    /// @e.Schema.UUID
    id String @id @default(uuid())
    /// Article title
    /// @e.Schema.String
    title String
    /// Body content
    /// @e.Schema.String
    content String
    /// Foreign key
    /// @e.Schema.UUID
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-effect', { recursive: true })
    fs.writeFileSync('./prisma-effect/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-effect/effect/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  /**
   * Primary key
   */
  id: Schema.UUID,
  /**
   * Display name
   */
  name: Schema.String,
})

export type UserEncoded = typeof UserSchema.Encoded

export const PostSchema = Schema.Struct({
  /**
   * Primary key
   */
  id: Schema.UUID,
  /**
   * Article title
   */
  title: Schema.String,
  /**
   * Body content
   */
  content: Schema.String,
  /**
   * Foreign key
   */
  userId: Schema.UUID,
})

export type PostEncoded = typeof PostSchema.Encoded

export const UserRelationsSchema = Schema.Struct({
  ...UserSchema.fields,
  posts: Schema.Array(PostSchema),
})

export type UserRelationsEncoded = typeof UserRelationsSchema.Encoded

export const PostRelationsSchema = Schema.Struct({ ...PostSchema.fields, user: UserSchema })

export type PostRelationsEncoded = typeof PostRelationsSchema.Encoded
`
    expect(result).toBe(expected)
  }, 30000)

  // custom output path
  it('hekireki-effect output effect-test/test.ts', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiEffect {
    provider = "hekireki-effect"
    output   = "effect-test/test.ts"
}

model User {
    /// @e.Schema.UUID
    id    String @id @default(uuid())
    /// @e.Schema.String
    name  String
}
`

    fs.mkdirSync('./prisma-effect', { recursive: true })
    fs.writeFileSync('./prisma-effect/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-effect/effect-test/test.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String,
})
`
    expect(result).toBe(expected)
  }, 30000)
})

// no annotation
describe('prisma generate effect (no annotation)', () => {
  afterEach(() => {
    fs.rmSync('./prisma-effect/schema.prisma', { force: true })
    fs.rmSync('./prisma-effect/effect', { recursive: true, force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-effect', { recursive: true, force: true })
  })

  it('hekireki-effect no annotation', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiEffect {
    provider = "hekireki-effect"
    output   = "effect"
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

    fs.mkdirSync('./prisma-effect', { recursive: true })
    fs.writeFileSync('./prisma-effect/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-effect/effect/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})

export const PostSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Schema.String,
  userId: Schema.String,
})
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-effect no annotation relation true', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiEffect {
    provider = "hekireki-effect"
    output   = "effect"
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

    fs.mkdirSync('./prisma-effect', { recursive: true })
    fs.writeFileSync('./prisma-effect/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-effect/effect/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})

export const PostSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Schema.String,
  userId: Schema.String,
})

export const UserRelationsSchema = Schema.Struct({
  ...UserSchema.fields,
  posts: Schema.Array(PostSchema),
})

export const PostRelationsSchema = Schema.Struct({ ...PostSchema.fields, user: UserSchema })
`
    expect(result).toBe(expected)
  }, 30000)
})

// edge cases
describe('prisma generate effect (edge cases)', () => {
  afterEach(() => {
    fs.rmSync('./prisma-effect/schema.prisma', { force: true })
    fs.rmSync('./prisma-effect/effect', { recursive: true, force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-effect', { recursive: true, force: true })
  })

  it('hekireki-effect enum fields', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiEffect {
    provider = "hekireki-effect"
    output   = "effect"
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

    fs.mkdirSync('./prisma-effect', { recursive: true })
    fs.writeFileSync('./prisma-effect/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-effect/effect/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Schema } from 'effect'

export const UserWithEnumSchema = Schema.Struct({
  id: Schema.String,
  role: Schema.Literal('ADMIN', 'USER', 'MODERATOR'),
})
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-effect all scalar types', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiEffect {
    provider = "hekireki-effect"
    output   = "effect"
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

    fs.mkdirSync('./prisma-effect', { recursive: true })
    fs.writeFileSync('./prisma-effect/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-effect/effect/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Schema } from 'effect'

export const AllTypesSchema = Schema.Struct({
  id: Schema.String,
  str: Schema.String,
  num: Schema.Number,
  flt: Schema.Number,
  bool: Schema.Boolean,
  date: Schema.Date,
  big: Schema.BigIntFromSelf,
  dec: Schema.Number,
  json: Schema.Unknown,
  bytes: Schema.Unknown,
})
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-effect nullable fields', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiEffect {
    provider = "hekireki-effect"
    output   = "effect"
}

model NullableModel {
    id     String   @id @default(uuid())
    name   String?
    age    Int?
    active Boolean?
}
`

    fs.mkdirSync('./prisma-effect', { recursive: true })
    fs.writeFileSync('./prisma-effect/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-effect/effect/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Schema } from 'effect'

export const NullableModelSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  age: Schema.Number,
  active: Schema.Boolean,
})
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-effect multiple annotations extracts only @e', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiEffect {
    provider = "hekireki-effect"
    output   = "effect"
}

model Multi {
    /// @z.uuid()
    /// @v.pipe(v.string(), v.uuid())
    /// @a."string.uuid"
    /// @e.Schema.UUID
    id String @id @default(uuid())
}
`

    fs.mkdirSync('./prisma-effect', { recursive: true })
    fs.writeFileSync('./prisma-effect/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-effect/effect/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { Schema } from 'effect'

export const MultiSchema = Schema.Struct({
  id: Schema.UUID,
})
`
    expect(result).toBe(expected)
  }, 30000)
})
