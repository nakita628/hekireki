import { afterEach, afterAll, describe, it, expect } from 'vitest'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'

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
    const expected = `import { z } from 'zod/v4'

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
    const expected = `import { z } from 'zod/v4'

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
    const expected = `import { z } from 'zod/v4'

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
    zod      = "v4-mini"
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
    const expected = `import { z } from 'zod/v4-mini'

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
})
