import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeServices } from '@effect/platform-node'
import { Effect } from 'effect'
import { afterAll, describe, expect, it } from 'vite-plus/test'

import { findSchemaEngineBinary } from './native-engine.js'
import { schemaSql } from './schema-sql.js'

const MODELS = `
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
`

const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-schema-sql-'))

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

// The native engine reads the files from where they are, so each schema is written out.
function filesOf(provider: string) {
  const file = path.join(dir, `${provider}.prisma`)
  const content = `datasource db {\n  provider = "${provider}"\n}\n${MODELS}`
  writeFileSync(file, content)
  return [{ path: file, content }]
}

function run(provider: string, dialect: 'postgresql' | 'mysql' | 'sqlite') {
  return Effect.runPromise(
    schemaSql({ files: filesOf(provider), dialect, cwd: dir }).pipe(
      Effect.provide(NodeServices.layer),
    ),
  )
}

describe('schemaSql', () => {
  it('writes PostgreSQL with no database behind it, a statement each', async () => {
    const statements = await run('postgresql', 'postgresql')
    expect(statements[0]).toBe('CREATE SCHEMA IF NOT EXISTS "public";')
    expect(statements).toContain('CREATE UNIQUE INDEX "User_email_key" ON "User"("email");')
    expect(statements.at(-1)).toBe(
      'ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
    )
    // The engine's `-- CreateTable` heading is not part of the statement.
    expect(statements.some((statement) => statement.includes('--'))).toBe(false)
  })

  it('writes SQLite, the foreign key inside the table', async () => {
    const statements = await run('sqlite', 'sqlite')
    expect(statements[0]).toMatch(/^CREATE TABLE "User" \(/u)
    expect(statements[1]).toContain('CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId")')
  })

  // oxlint-disable-next-line jest/no-done-callback -- vitest's test context, for skip(): the engine is looked up asynchronously
  it('writes MySQL through the native engine, where it is installed', async (context) => {
    const binary = await Effect.runPromise(
      findSchemaEngineBinary(process.cwd()).pipe(Effect.provide(NodeServices.layer)),
    )
    if (binary === null) context.skip()
    const statements = await run('mysql', 'mysql')
    expect(statements[0]).toMatch(/^CREATE TABLE `User` \(/u)
    expect(statements.at(-1)).toMatch(/^ALTER TABLE `Post` ADD CONSTRAINT `Post_authorId_fkey`/u)
  })
})
