import { beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest'
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
    fs.rmSync('./prisma-zod/zod2', { recursive: true, force: true })
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
})
