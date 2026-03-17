import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

// pnpm vitest run ./src/generator/drizzle/better-auth.test.ts

const FIXTURES_DIR = path.resolve(__dirname, '../../../../../fixtures')
const WORK_DIR = './prisma-ba'

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name, 'schema.prisma'), { encoding: 'utf-8' })
}

async function generateAndRead(schema: string): Promise<string> {
  fs.mkdirSync(WORK_DIR, { recursive: true })
  fs.writeFileSync(`${WORK_DIR}/schema.prisma`, schema, { encoding: 'utf-8' })
  await promisify(exec)(`npx prisma generate --schema=${WORK_DIR}/schema.prisma`)
  return fs.readFileSync(`${WORK_DIR}/drizzle/schema.ts`, { encoding: 'utf-8' })
}

async function verifyWithDrizzleKit(
  _schemaContent: string,
  dialect: 'postgresql' | 'mysql' | 'sqlite',
): Promise<void> {
  const configPath = `${WORK_DIR}/drizzle.config.json`
  const config = {
    schema: `${WORK_DIR}/drizzle/schema.ts`,
    out: `${WORK_DIR}/drizzle-migrations`,
    dialect,
  }
  fs.writeFileSync(configPath, JSON.stringify(config), { encoding: 'utf-8' })

  const { stdout, stderr } = await promisify(exec)(
    `npx drizzle-kit generate --config=${configPath}`,
  )

  const output = stdout + stderr
  expect(output).not.toContain('Error')
}

describe('prisma generate drizzle - better-auth assertion tests', () => {
  afterEach(() => {
    fs.rmSync(`${WORK_DIR}/drizzle`, { recursive: true, force: true })
    fs.rmSync(`${WORK_DIR}/drizzle-migrations`, { recursive: true, force: true })
    fs.rmSync(`${WORK_DIR}/schema.prisma`, { force: true })
    fs.rmSync(`${WORK_DIR}/drizzle.config.json`, { force: true })
  })
  afterAll(() => {
    fs.rmSync(WORK_DIR, { recursive: true, force: true })
  })

  // =========================================================================
  // SQLite
  // =========================================================================
  it('sqlite-base: @@unique dedup, @@index prefix, FK references', async () => {
    const result = await generateAndRead(readFixture('better-auth-prisma-drizzle-sqlite-base'))

    expect(result).toContain('sqliteTable')
    expect(result).not.toContain('unique().on(table.email)')
    expect(result).not.toContain('unique().on(table.token)')
    expect(result).toContain('.unique()')
    expect(result).toContain("index('idx_session_userId')")
    expect(result).toContain("index('idx_account_userId')")
    expect(result).toContain(".references(() => user.id, { onDelete: 'cascade' })")
    expect(result).toContain('.default(false)')
    expect(result).toContain('$onUpdate')

    await verifyWithDrizzleKit(result, 'sqlite')
  }, 30000)

  it('sqlite-full: all plugins combined', async () => {
    const result = await generateAndRead(readFixture('better-auth-prisma-drizzle-sqlite-full'))

    expect(result).toContain('export const twoFactor')
    expect(result).toContain('export const organization')
    expect(result).toContain('export const jwks')
    expect(result).not.toContain('unique().on(table.email)')
    expect(result).toContain("index('idx_session_userId')")
    expect(result).toContain("index('idx_account_userId')")
    expect(result).toContain("index('idx_member_userId')")
    expect(result).toContain(".references(() => user.id, { onDelete: 'cascade' })")

    await verifyWithDrizzleKit(result, 'sqlite')
  }, 30000)

  // =========================================================================
  // PostgreSQL
  // =========================================================================
  it('postgresql-base: PG types, @@unique dedup, FK references', async () => {
    const result = await generateAndRead(readFixture('better-auth-prisma-drizzle-postgresql-base'))

    expect(result).toContain('pgTable')
    expect(result).toContain('.defaultNow()')
    expect(result).not.toContain('unique().on(table.email)')
    expect(result).not.toContain('unique().on(table.token)')
    expect(result).toContain("index('idx_session_userId')")
    expect(result).toContain(".references(() => user.id, { onDelete: 'cascade' })")
    expect(result).toContain('userRelations')
    expect(result).toContain('sessionRelations')
    expect(result).toContain('accountRelations')

    await verifyWithDrizzleKit(result, 'postgresql')
  }, 30000)

  it('postgresql-full: all plugins combined', async () => {
    const result = await generateAndRead(readFixture('better-auth-prisma-drizzle-postgresql-full'))

    for (const model of [
      'user',
      'session',
      'account',
      'verification',
      'twoFactor',
      'organization',
      'member',
      'invitation',
      'jwks',
    ]) {
      expect(result).toContain(`export const ${model}`)
    }
    expect(result).not.toContain('unique().on(table.email)')
    expect(result).not.toContain('unique().on(table.token)')
    expect(result).toContain("index('idx_session_userId')")
    expect(result).toContain("index('idx_account_userId')")
    expect(result).toContain("index('idx_member_userId')")
    expect(result).toContain("index('idx_invitation_organizationId')")
    expect(result).toContain(".references(() => user.id, { onDelete: 'cascade' })")
    expect(result).toContain(".references(() => organization.id, { onDelete: 'cascade' })")

    await verifyWithDrizzleKit(result, 'postgresql')
  }, 30000)

  // =========================================================================
  // MySQL
  // =========================================================================
  it('mysql-base: MySQL types, @@unique dedup, FK references', async () => {
    const result = await generateAndRead(readFixture('better-auth-prisma-drizzle-mysql-base'))

    expect(result).toContain('mysqlTable')
    expect(result).toContain("from 'drizzle-orm/mysql-core'")
    expect(result).not.toContain('unique().on(table.email)')
    expect(result).not.toContain('unique().on(table.token)')
    expect(result).toContain('.unique()')
    expect(result).toContain("index('idx_session_userId')")
    expect(result).toContain("index('idx_account_userId')")
    expect(result).toContain(".references(() => user.id, { onDelete: 'cascade' })")
    expect(result).toContain('$onUpdate')

    await verifyWithDrizzleKit(result, 'mysql')
  }, 30000)

  it('mysql-full: all plugins combined', async () => {
    const result = await generateAndRead(readFixture('better-auth-prisma-drizzle-mysql-full'))

    for (const model of [
      'user',
      'session',
      'account',
      'verification',
      'twoFactor',
      'organization',
      'member',
      'invitation',
      'jwks',
    ]) {
      expect(result).toContain(`export const ${model}`)
    }
    expect(result).toContain('mysqlTable')
    expect(result).not.toContain('unique().on(table.email)')
    expect(result).toContain("index('idx_session_userId')")
    expect(result).toContain("index('idx_member_userId')")
    expect(result).toContain(".references(() => user.id, { onDelete: 'cascade' })")

    await verifyWithDrizzleKit(result, 'mysql')
  }, 30000)
})
