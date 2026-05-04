import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vite-plus/test'

// Test run
// pnpm vitest run ./src/generator/ajv/index.test.ts

const command = async () => {
  await promisify(exec)('npx prisma generate --schema=./prisma-ajv/schema.prisma')
}

describe('prisma generate ajv', () => {
  afterEach(() => {
    fs.rmSync('./prisma-ajv', { recursive: true, force: true })
  })

  // default
  it('hekireki-ajv', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-AJV {
    provider = "hekireki-ajv"
    output   = "ajv"
}

model User {
    /// Primary key
    /// @j.{ type: 'string' as const, format: 'uuid' as const }
    id    String @id @default(uuid())
    /// Display name
    /// @j.{ type: 'string' as const, minLength: 1, maxLength: 50 }
    name  String
    /// One-to-many relation to Post
    posts Post[]
}

model Post {
    /// Primary key
    /// @j.{ type: 'string' as const, format: 'uuid' as const }
    id String @id @default(uuid())
    /// Article title
    /// @j.{ type: 'string' as const, minLength: 1, maxLength: 100 }
    title String
    /// Body content
    /// @j.{ type: 'string' as const }
    content String
    /// Foreign key
    /// @j.{ type: 'string' as const, format: 'uuid' as const }
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-ajv', { recursive: true })
    fs.writeFileSync('./prisma-ajv/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-ajv/ajv/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' as const },
    name: { type: 'string' as const, minLength: 1, maxLength: 50 },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const

export const PostSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' as const },
    title: { type: 'string' as const, minLength: 1, maxLength: 100 },
    content: { type: 'string' as const },
    userId: { type: 'string' as const, format: 'uuid' as const },
  },
  required: ['id', 'title', 'content', 'userId'] as const,
  additionalProperties: false,
} as const
`
    expect(result).toBe(expected)
  }, 30000)

  // comment true, type true
  it('hekireki-ajv comment true type true', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-AJV {
    provider = "hekireki-ajv"
    output   = "ajv"
    comment  = true
    type     = true
}

model User {
    /// Primary key
    /// @j.{ type: 'string' as const, format: 'uuid' as const }
    id    String @id @default(uuid())
    /// Display name
    /// @j.{ type: 'string' as const, minLength: 1, maxLength: 50 }
    name  String
    posts Post[]
}

model Post {
    /// Primary key
    /// @j.{ type: 'string' as const, format: 'uuid' as const }
    id String @id @default(uuid())
    /// Article title
    /// @j.{ type: 'string' as const, minLength: 1, maxLength: 100 }
    title String
    /// Body content
    /// @j.{ type: 'string' as const }
    content String
    /// Foreign key
    /// @j.{ type: 'string' as const, format: 'uuid' as const }
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-ajv', { recursive: true })
    fs.writeFileSync('./prisma-ajv/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-ajv/ajv/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Primary key
     */
    id: { type: 'string' as const, format: 'uuid' as const },
    /**
     * Display name
     */
    name: { type: 'string' as const, minLength: 1, maxLength: 50 },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const PostSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Primary key
     */
    id: { type: 'string' as const, format: 'uuid' as const },
    /**
     * Article title
     */
    title: { type: 'string' as const, minLength: 1, maxLength: 100 },
    /**
     * Body content
     */
    content: { type: 'string' as const },
    /**
     * Foreign key
     */
    userId: { type: 'string' as const, format: 'uuid' as const },
  },
  required: ['id', 'title', 'content', 'userId'] as const,
  additionalProperties: false,
} as const

export type Post = FromSchema<typeof PostSchema>
`
    expect(result).toBe(expected)
  }, 30000)

  // no annotation
  it('hekireki-ajv no annotation', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-AJV {
    provider = "hekireki-ajv"
    output   = "ajv"
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

    fs.mkdirSync('./prisma-ajv', { recursive: true })
    fs.writeFileSync('./prisma-ajv/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-ajv/ajv/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    name: { type: 'string' as const },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const

export const PostSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    title: { type: 'string' as const },
    content: { type: 'string' as const },
    userId: { type: 'string' as const },
  },
  required: ['id', 'title', 'content', 'userId'] as const,
  additionalProperties: false,
} as const
`
    expect(result).toBe(expected)
  }, 30000)

  // relation true, type true
  it('hekireki-ajv relation true type true', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-AJV {
    provider = "hekireki-ajv"
    output   = "ajv"
    relation = true
    type     = true
}

model User {
    /// @j.{ type: 'string' as const, format: 'uuid' as const }
    id    String @id @default(uuid())
    /// @j.{ type: 'string' as const, minLength: 1, maxLength: 50 }
    name  String
    posts Post[]
}

model Post {
    /// @j.{ type: 'string' as const, format: 'uuid' as const }
    id String @id @default(uuid())
    /// @j.{ type: 'string' as const, minLength: 1, maxLength: 100 }
    title String
    /// @j.{ type: 'string' as const }
    content String
    /// @j.{ type: 'string' as const, format: 'uuid' as const }
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-ajv', { recursive: true })
    fs.writeFileSync('./prisma-ajv/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-ajv/ajv/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' as const },
    name: { type: 'string' as const, minLength: 1, maxLength: 50 },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const PostSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' as const },
    title: { type: 'string' as const, minLength: 1, maxLength: 100 },
    content: { type: 'string' as const },
    userId: { type: 'string' as const, format: 'uuid' as const },
  },
  required: ['id', 'title', 'content', 'userId'] as const,
  additionalProperties: false,
} as const

export type Post = FromSchema<typeof PostSchema>

export const UserRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserSchema.properties,
    posts: { type: 'array' as const, items: PostSchema },
  },
  additionalProperties: false,
} as const

export type UserRelations = FromSchema<typeof UserRelationsSchema>

export const PostRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...PostSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type PostRelations = FromSchema<typeof PostRelationsSchema>
`
    expect(result).toBe(expected)
  }, 30000)

  // custom output path
  it('hekireki-ajv output ajv-test/test.ts', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-AJV {
    provider = "hekireki-ajv"
    output   = "ajv-test/test.ts"
}

model User {
    /// @j.{ type: 'string' as const, format: 'uuid' as const }
    id    String @id @default(uuid())
    /// @j.{ type: 'string' as const }
    name  String
}
`

    fs.mkdirSync('./prisma-ajv', { recursive: true })
    fs.writeFileSync('./prisma-ajv/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-ajv/ajv-test/test.ts', {
      encoding: 'utf-8',
    })

    const expected = `export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' as const },
    name: { type: 'string' as const },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const
`
    expect(result).toBe(expected)
  }, 30000)

  // no annotation relation true
  it('hekireki-ajv no annotation relation true', async () => {
    const prisma = `datasource db {
    provider = "sqlite"
}

generator Hekireki-AJV {
    provider = "hekireki-ajv"
    output   = "ajv"
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

    fs.mkdirSync('./prisma-ajv', { recursive: true })
    fs.writeFileSync('./prisma-ajv/schema.prisma', prisma, { encoding: 'utf-8' })
    await command()
    const result = fs.readFileSync('./prisma-ajv/ajv/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    name: { type: 'string' as const },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const PostSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    title: { type: 'string' as const },
    userId: { type: 'string' as const },
  },
  required: ['id', 'title', 'userId'] as const,
  additionalProperties: false,
} as const

export type Post = FromSchema<typeof PostSchema>

export const UserRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserSchema.properties,
    posts: { type: 'array' as const, items: PostSchema },
  },
  additionalProperties: false,
} as const

export type UserRelations = FromSchema<typeof UserRelationsSchema>

export const PostRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...PostSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type PostRelations = FromSchema<typeof PostRelationsSchema>
`
    expect(result).toBe(expected)
  }, 30000)
})
