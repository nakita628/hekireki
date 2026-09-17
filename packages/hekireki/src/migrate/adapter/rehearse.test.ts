import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../file/index.js'
import { connectDatabase, openSqliteCopy } from '../../studio/server/services/database.js'
import { rehearseMigration } from './rehearse.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The schema the database is migrating to: `nickname` goes, `name` becomes required. */
const SCHEMA = `datasource db {
  provider = "sqlite"
}

model User {
  id   Int    @id
  name String
}
`

/** A database as the old schema left it, with rows in it. */
function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-rehearse-'))
  dirs.push(dir)
  const file = path.join(dir, 'dev.db')
  const db = new DatabaseSync(file)
  db.exec(
    `CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY, "name" TEXT, "nickname" TEXT);
     INSERT INTO "User" VALUES (1, 'Ann', 'annie'), (2, NULL, 'bob'), (3, 'Cy', NULL);`,
  )
  db.close()
  return { dir, file }
}

/** The migration Prisma writes for SCHEMA on SQLite: the table rebuilt without `nickname`. */
const REBUILD = [
  'PRAGMA defer_foreign_keys=ON',
  'PRAGMA foreign_keys=OFF',
  'CREATE TABLE "new_User" ("id" INTEGER NOT NULL PRIMARY KEY, "name" TEXT NOT NULL)',
  'INSERT INTO "new_User" ("id", "name") SELECT "id", "name" FROM "User"',
  'DROP TABLE "User"',
  'ALTER TABLE "new_User" RENAME TO "User"',
  'PRAGMA foreign_keys=ON',
  'PRAGMA defer_foreign_keys=OFF',
]

function rehearse(dir: string, file: string, steps: readonly (readonly string[])[]) {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* connectDatabase({
          explicitUrl: `file:${file}`,
          configUrl: null,
          configError: null,
          schemaProvider: 'sqlite',
          schemaText: null,
          cwd: dir,
          schemaDir: dir,
          env: {},
        })
        yield* Effect.addFinalizer(() => db.close)
        const driver = yield* db.driver
        return yield* rehearseMigration({
          driver,
          steps,
          files: [{ path: path.join(dir, 'schema.prisma'), content: SCHEMA }],
          configDir: dir,
          openCopy: () => openSqliteCopy({ driver, cwd: dir }),
        })
      }),
    ).pipe(Effect.provide(fileSystemLayer)),
  )
}

function rowsOf(file: string) {
  const db = new DatabaseSync(file, { readOnly: true })
  const rows = db
    .prepare('SELECT * FROM "User" ORDER BY "id"')
    .all()
    .map((row) => structuredClone(row))
  db.close()
  return rows
}

describe('rehearseMigration', () => {
  it('runs the steps on a copy and says the migration would go through, the database untouched', async () => {
    const { dir, file } = project()
    const before = rowsOf(file)
    const result = await rehearse(dir, file, [
      [`UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL`],
      REBUILD,
    ])
    expect(result).toMatchObject({
      ok: true,
      schemaMatches: true,
      difference: '',
      steps: [
        { ran: true, ok: true, affected: 1, error: null },
        { ran: true, ok: true, error: null },
      ],
      tables: [{ table: 'User', before: 3, after: 3 }],
      limitations: [],
    })
    // Nothing of the rehearsal reached the database itself.
    expect(rowsOf(file)).toStrictEqual(before)
  })

  it('says where the migration would fail, and does not run the steps after it', async () => {
    const { dir, file } = project()
    const result = await rehearse(dir, file, [REBUILD, ['SELECT 1']])
    expect(result.ok).toBe(false)
    expect(result.steps[0]).toMatchObject({ ran: true, ok: false })
    expect(result.steps[0]?.error).toContain('NOT NULL')
    expect(result.steps[0]?.statement).toContain('INSERT INTO "new_User"')
    expect(result.steps[1]).toMatchObject({ ran: false, ok: false })
    expect(result.schemaMatches).toBe(false)
    expect(rowsOf(file)).toHaveLength(3)
  })
})
