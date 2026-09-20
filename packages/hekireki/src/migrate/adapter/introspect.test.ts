import { DatabaseSync } from 'node:sqlite'

import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { introspectDatabase } from './introspect.js'

describe('introspectDatabase on SQLite', () => {
  it('reads columns, the primary key and unique indexes, and leaves partial indexes out', async () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`
CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "email" TEXT NOT NULL, "name" TEXT, "tenant" INTEGER);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_tenant_name_key" ON "User"("tenant", "name");
CREATE UNIQUE INDEX "User_partial" ON "User"("name") WHERE "name" IS NOT NULL;
CREATE INDEX "User_name_idx" ON "User"("name");
CREATE TABLE "Follow" ("a" TEXT NOT NULL, "b" TEXT NOT NULL, PRIMARY KEY ("a", "b"));
`)
    const driver = {
      query: (statement: { readonly sql: string; readonly params: readonly unknown[] }) =>
        Effect.sync(() => ({
          rows: db.prepare(statement.sql).all() as Readonly<Record<string, unknown>>[],
        })),
    }
    const result = await Effect.runPromise(
      introspectDatabase({ driver, dialect: 'sqlite', schemas: [] }),
    )
    db.close()
    expect(result.defaultSchema).toBeNull()
    expect(result.tables.map((table) => [table.table, table.uniques])).toStrictEqual([
      [
        'Follow',
        [
          ['a', 'b'],
          ['a', 'b'],
        ],
      ],
      ['User', [['id'], ['tenant', 'name'], ['email']]],
    ])
    expect(result.tables[1]?.columns.map((c) => [c.name, c.nullable, c.dataType])).toStrictEqual([
      ['id', false, 'INTEGER'],
      ['email', false, 'TEXT'],
      ['name', true, 'TEXT'],
      ['tenant', true, 'INTEGER'],
    ])
  })
})
