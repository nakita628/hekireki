import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterAll, describe, expect, it } from 'vitest'

// pnpm vitest run ./src/generator/drizzle/better-auth-fixtures.test.ts
//
// Generates Drizzle schemas from each fixture into a temp directory,
// then verifies the output matches the snapshot.

const FIXTURES_DIR = path.resolve(__dirname, '../../../../../fixtures')
const TMP_DIR = path.resolve(__dirname, '../../../../../.tmp-drizzle-test')

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true })
})

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

describe('fixture: prisma generate drizzle - snapshot', () => {
  for (const fixture of PRISMA_DRIZZLE_FIXTURES) {
    it(`${fixture.name}: ${fixture.label}`, async () => {
      const fixtureDir = path.join(FIXTURES_DIR, fixture.name)
      const originalSchema = fs.readFileSync(path.join(fixtureDir, 'schema.prisma'), 'utf-8')

      // Rewrite output path to a temp directory inside the project
      const tmpOutputDir = path.join(TMP_DIR, fixture.name, 'drizzle')
      fs.mkdirSync(path.join(TMP_DIR, fixture.name), { recursive: true })

      const modifiedSchema = originalSchema.replace(
        /output\s*=\s*"drizzle"/,
        `output   = "${tmpOutputDir}"`,
      )
      const tmpSchemaPath = path.join(TMP_DIR, fixture.name, 'schema.prisma')
      fs.writeFileSync(tmpSchemaPath, modifiedSchema)

      await promisify(exec)(`npx prisma generate --schema=${tmpSchemaPath}`)

      const result = fs.readFileSync(path.join(tmpOutputDir, 'schema.ts'), 'utf-8')

      expect(result).toMatchSnapshot()
    }, 30000)
  }
})
