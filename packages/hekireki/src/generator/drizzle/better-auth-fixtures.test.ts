import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

// pnpm vitest run ./src/generator/drizzle/better-auth-fixtures.test.ts
//
// Generates Drizzle schemas from each fixture using the workspace-linked
// hekireki package, then verifies the output matches the saved snapshot.

const FIXTURES_DIR = path.resolve(__dirname, '../../../../../fixtures')

const PRISMA_DRIZZLE_FIXTURES = [
  // SQLite
  { name: 'better-auth-prisma-drizzle-sqlite-base', label: 'sqlite / base' },
  { name: 'better-auth-prisma-drizzle-sqlite-2fa', label: 'sqlite / 2fa' },
  { name: 'better-auth-prisma-drizzle-sqlite-admin', label: 'sqlite / admin' },
  { name: 'better-auth-prisma-drizzle-sqlite-org', label: 'sqlite / org' },
  { name: 'better-auth-prisma-drizzle-sqlite-jwt', label: 'sqlite / jwt' },
  { name: 'better-auth-prisma-drizzle-sqlite-full', label: 'sqlite / full' },
  // PostgreSQL
  { name: 'better-auth-prisma-drizzle-postgresql-base', label: 'postgresql / base' },
  { name: 'better-auth-prisma-drizzle-postgresql-2fa', label: 'postgresql / 2fa' },
  { name: 'better-auth-prisma-drizzle-postgresql-admin', label: 'postgresql / admin' },
  { name: 'better-auth-prisma-drizzle-postgresql-org', label: 'postgresql / org' },
  { name: 'better-auth-prisma-drizzle-postgresql-jwt', label: 'postgresql / jwt' },
  { name: 'better-auth-prisma-drizzle-postgresql-full', label: 'postgresql / full' },
  // MySQL
  { name: 'better-auth-prisma-drizzle-mysql-base', label: 'mysql / base' },
  { name: 'better-auth-prisma-drizzle-mysql-2fa', label: 'mysql / 2fa' },
  { name: 'better-auth-prisma-drizzle-mysql-admin', label: 'mysql / admin' },
  { name: 'better-auth-prisma-drizzle-mysql-org', label: 'mysql / org' },
  { name: 'better-auth-prisma-drizzle-mysql-jwt', label: 'mysql / jwt' },
  { name: 'better-auth-prisma-drizzle-mysql-full', label: 'mysql / full' },
]

describe('fixture: prisma generate drizzle - strict output match', () => {
  for (const fixture of PRISMA_DRIZZLE_FIXTURES) {
    it(`${fixture.name}: ${fixture.label}`, async () => {
      const fixtureDir = path.join(FIXTURES_DIR, fixture.name)
      const schemaPath = path.join(fixtureDir, 'schema.prisma')
      const outputPath = path.join(fixtureDir, 'drizzle', 'schema.ts')

      const saved = fs.readFileSync(outputPath, { encoding: 'utf-8' })

      await promisify(exec)(`npx prisma generate --schema=${schemaPath}`)

      const result = fs.readFileSync(outputPath, { encoding: 'utf-8' })

      expect(result).toStrictEqual(saved)
    }, 30000)
  }
})
