import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'

// Test run
// pnpm vitest run ./src/generator/valibot/index.test.ts

describe('prisma generate', async () => {
  beforeEach(() => {
    // Ensure the prisma directory exists
    fs.mkdirSync('./prisma', { recursive: true })
  })
  afterEach(() => {
    // Clean up generated files
    fs.rmSync('./prisma/schema.prisma', { force: true })
    fs.rmSync('./prisma/valibot', { recursive: true, force: true })
    fs.rmSync('./prisma/valibot2', { recursive: true, force: true })
  })
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
  type     = true
  comment  = false
}

model User {
  /// Primary key
  /// @v.pipe(v.string(), v.uuid())
  id   String @id @default(uuid())
  /// Display name
  /// @v.pipe(v.string(), v.minLength(1), v.maxLength(50))
  name String
}
`

    fs.mkdirSync('./prisma', { recursive: true })
    fs.writeFileSync('./prisma/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate')
    const result = fs.readFileSync('./prisma/valibot/index.ts', {
      encoding: 'utf-8',
    })
    const expected = `import * as v from 'valibot'

export const UserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
})

export type User = v.InferInput<typeof UserSchema>
`

    expect(result).toBe(expected)
  })
})
