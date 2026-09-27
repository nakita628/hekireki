import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect } from 'effect'
import type { FileSystem } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { connectDatabase } from '../../studio/server/services/database.js'
import type { Driver } from '../../studio/server/services/database.js'
import { backupsDirectory, createBackup, listBackups, restoreBackup } from './backup.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-backup-'))
  dirs.push(dir)
  const file = path.join(dir, 'dev.db')
  const db = new DatabaseSync(file)
  db.exec(
    `CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "email" TEXT NOT NULL, "nickname" TEXT);
     CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
     CREATE TABLE "_prisma_migrations" ("id" TEXT PRIMARY KEY NOT NULL, "migration_name" TEXT NOT NULL);
     INSERT INTO "User" ("email", "nickname") VALUES ('a@example.com', 'annie'), ('b@example.com', 'bob');
     INSERT INTO "_prisma_migrations" VALUES ('1', '20260101000000_init');`,
  )
  db.close()
  return { dir, file }
}

function withDriver<A, E>(
  dir: string,
  file: string,
  use: (driver: Driver) => Effect.Effect<A, E, FileSystem.FileSystem>,
) {
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
        return yield* use(yield* db.driver)
      }),
    ).pipe(Effect.provide(NodeFileSystem.layer)),
  )
}

function read(file: string, sql: string) {
  const db = new DatabaseSync(file, { readOnly: true })
  const rows = db
    .prepare(sql)
    .all()
    .map((row) => structuredClone(row))
  db.close()
  return rows
}

describe('backups of a SQLite database', () => {
  it('takes one before a migration, and restores the database as it was, history and all', async () => {
    const { dir, file } = project()
    const taken = await withDriver(dir, file, (driver) => createBackup({ driver, schemaDir: dir }))
    expect(taken.location).toBe(path.join(backupsDirectory(dir), `${taken.name}.db`))
    // Never committed: the directory keeps its own .gitignore.
    expect(readFileSync(path.join(dir, '.hekireki', '.gitignore'), 'utf8')).toBe('backups/\n')

    // The migration loses the nickname column and a row, and records itself.
    const migrated = new DatabaseSync(file)
    migrated.exec(
      `ALTER TABLE "User" DROP COLUMN "nickname";
       DELETE FROM "User" WHERE "email" = 'b@example.com';
       INSERT INTO "_prisma_migrations" VALUES ('2', '20260201000000_drop');`,
    )
    migrated.close()

    const listed = await withDriver(dir, file, (driver) => listBackups({ driver, schemaDir: dir }))
    expect(listed).toMatchObject([{ name: taken.name, restorable: true }])

    await withDriver(dir, file, (driver) =>
      restoreBackup({ driver, schemaDir: dir, name: taken.name }),
    )
    expect(read(file, 'SELECT * FROM "User" ORDER BY "id"')).toStrictEqual([
      { id: 1, email: 'a@example.com', nickname: 'annie' },
      { id: 2, email: 'b@example.com', nickname: 'bob' },
    ])
    expect(read(file, 'SELECT "migration_name" FROM "_prisma_migrations"')).toStrictEqual([
      { migration_name: '20260101000000_init' },
    ])
    // The index came back with the table, and the next id follows on from the rows.
    expect(
      read(file, `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'User_email_key'`),
    ).toHaveLength(1)
    expect(read(file, "SELECT seq FROM sqlite_sequence WHERE name = 'User'")).toStrictEqual([
      { seq: 2 },
    ])
  })

  it('refuses a backup that is not there', async () => {
    const { dir, file } = project()
    await expect(
      withDriver(dir, file, (driver) =>
        restoreBackup({ driver, schemaDir: dir, name: 'backup_20260101000000000' }),
      ),
    ).rejects.toThrow('There is no backup')
  })
})
