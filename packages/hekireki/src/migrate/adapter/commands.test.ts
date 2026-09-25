import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect } from 'effect'
import { afterAll, describe, expect, it } from 'vite-plus/test'

import { connectDatabase } from '../../studio/server/services/database.js'
import { migrationName } from '../domain/history.js'
import {
  applyPendingMigrations,
  applyStatements,
  markMigrationApplied,
  migrationStatus,
} from './commands.js'
import { makeSchemaEngineAdapter } from './engine-adapter.js'
import { openSchemaEngine } from './engine.js'
import { readMigrationsList, writeMigration } from './migrations-dir.js'

const root = mkdtempSync(path.join(tmpdir(), 'hekireki-commands-'))

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const SCHEMA = `datasource db {
  provider = "sqlite"
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
}
`

const INIT_SQL = `-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
`

/** A project as Prisma Migrate leaves one: a schema, a migrations directory and no database yet. */
function makeProject(name: string) {
  const directory = path.join(root, name)
  const migrations = path.join(directory, 'migrations')
  mkdirSync(path.join(migrations, '20260101000000_init'), { recursive: true })
  writeFileSync(path.join(migrations, '20260101000000_init', 'migration.sql'), INIT_SQL)
  writeFileSync(path.join(migrations, 'migration_lock.toml'), 'provider = "sqlite"\n')
  const schemaPath = path.join(directory, 'schema.prisma')
  writeFileSync(schemaPath, SCHEMA)
  return { directory, migrations, schemaPath, file: path.join(directory, 'dev.db') }
}

function openOn(project: ReturnType<typeof makeProject>) {
  return Effect.gen(function* () {
    const db = yield* connectDatabase({
      explicitUrl: `file:${project.file}`,
      configUrl: null,
      configError: null,
      schemaText: SCHEMA,
      schemaProvider: 'sqlite',
      cwd: project.directory,
      schemaDir: project.directory,
      env: {},
    })
    const driver = yield* db.driver
    const files = [{ path: project.schemaPath, content: SCHEMA }]
    const engine = yield* openSchemaEngine({
      files,
      adapter: makeSchemaEngineAdapter(driver),
    })
    const migrations = yield* readMigrationsList(project.migrations)
    return { db, driver, engine, files, migrations }
  }).pipe(Effect.provide(NodeFileSystem.layer))
}

describe('readMigrationsList', () => {
  it('reads every migration directory in order, with the lock beside them', async () => {
    const project = makeProject('history')
    const list = await Effect.runPromise(
      readMigrationsList(project.migrations).pipe(Effect.provide(NodeFileSystem.layer)),
    )
    expect(list.migrationDirectories.map((directory) => directory.path)).toStrictEqual([
      '20260101000000_init',
    ])
    expect(list.migrationDirectories[0]?.migrationFile.content).toStrictEqual({
      tag: 'ok',
      value: INIT_SQL,
    })
    expect(list.lockfile.content).toBe('provider = "sqlite"\n')
  })

  it('reads a directory that is not there as an empty history', async () => {
    const list = await Effect.runPromise(
      readMigrationsList(path.join(root, 'nowhere')).pipe(Effect.provide(NodeFileSystem.layer)),
    )
    expect(list.migrationDirectories).toStrictEqual([])
    expect(list.lockfile.content).toBeNull()
  })
})

describe('migrationName', () => {
  it('names a migration the way Prisma Migrate does', () => {
    expect(migrationName({ at: new Date('2026-02-01T00:00:00Z'), name: 'Add profile' })).toBe(
      '20260201000000_add_profile',
    )
  })

  it('falls back to a name when nothing usable is given', () => {
    expect(migrationName({ at: new Date('2026-02-01T00:00:00Z'), name: '  !! ' })).toBe(
      '20260201000000_migration',
    )
  })
})

describe('migrationStatus and applyPendingMigrations', () => {
  it('reports the migration as pending, applies it, and then finds the database in step', async () => {
    const project = makeProject('apply')
    const opened = await Effect.runPromise(openOn(project))
    const input = {
      engine: opened.engine,
      driver: opened.driver,
      migrations: opened.migrations,
      files: opened.files,
      configDir: project.directory,
    }

    const before = await Effect.runPromise(migrationStatus(input))
    expect(before.hasMigrationsTable).toBe(false)
    expect(before.applied).toStrictEqual([])
    expect(before.pending).toStrictEqual(['20260101000000_init'])
    expect(before.drift).toBe(true)

    const applied = await Effect.runPromise(
      applyPendingMigrations({ engine: opened.engine, migrations: opened.migrations }),
    )
    expect(applied.applied).toStrictEqual(['20260101000000_init'])

    const after = await Effect.runPromise(migrationStatus(input))
    expect(after.hasMigrationsTable).toBe(true)
    expect(after.applied.map((migration) => migration.name)).toStrictEqual(['20260101000000_init'])
    expect(after.pending).toStrictEqual([])
    expect(after.failed).toStrictEqual([])
    expect(after.edited).toStrictEqual([])
    expect(after.divergence).toBeNull()
    expect(after.drift).toBe(false)

    await Effect.runPromise(opened.db.close)
  })
})

describe('applyStatements', () => {
  it('runs a migration a step at a time, records it, and leaves the database in step', async () => {
    const project = makeProject('staged')
    const opened = await Effect.runPromise(openOn(project))
    // The project as Studio finds one: already migrated once, so `_prisma_migrations` is there.
    await Effect.runPromise(
      applyPendingMigrations({ engine: opened.engine, migrations: opened.migrations }),
    )
    await Effect.runPromise(
      opened.driver.executeRaw({
        sql: `INSERT INTO "User" ("email") VALUES ('a@example.com')`,
        params: [],
      }),
    )

    // What the next migration does: one column added, then the rows already there filled in.
    const statements = [
      'ALTER TABLE "User" ADD COLUMN "name" TEXT',
      `UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL`,
    ]
    const name = migrationName({ at: new Date('2026-02-01T00:00:00Z'), name: 'add name' })
    await Effect.runPromise(
      writeMigration({
        baseDir: project.migrations,
        name,
        sql: statements.map((statement) => `${statement};`).join('\n'),
        provider: 'sqlite',
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )

    // The database matches the schema before the step runs: the engine reads it through the very
    // connection the step will write on, so what the step does is visible to it at once.
    const inStep = await Effect.runPromise(
      migrationStatus({
        engine: opened.engine,
        driver: opened.driver,
        migrations: opened.migrations,
        files: opened.files,
        configDir: project.directory,
      }),
    )
    expect(inStep.drift).toBe(false)

    const applied = await Effect.runPromise(applyStatements({ driver: opened.driver, statements }))
    expect(applied.ok).toBe(true)
    expect(applied.failedAt).toBeNull()
    expect(applied.results.map((result) => result.error)).toStrictEqual([null, null])
    // The fill touched the row that was already there.
    expect(applied.results[1]?.affected).toBe(1)

    const migrations = await Effect.runPromise(
      readMigrationsList(project.migrations).pipe(Effect.provide(NodeFileSystem.layer)),
    )
    await Effect.runPromise(
      markMigrationApplied({ engine: opened.engine, driver: opened.driver, migrations, name }),
    )

    const status = await Effect.runPromise(
      migrationStatus({
        engine: opened.engine,
        driver: opened.driver,
        migrations,
        files: opened.files,
        configDir: project.directory,
      }),
    )
    expect(status.applied.map((migration) => migration.name)).toStrictEqual([
      '20260101000000_init',
      name,
    ])
    expect(status.pending).toStrictEqual([])
    expect(status.failed).toStrictEqual([])
    expect(status.edited).toStrictEqual([])
    expect(status.divergence).toBeNull()
    // The schema has no `name` field, so the column the step added is drift the engine sees
    // immediately: nothing is cached from before the step ran.
    expect(status.drift).toBe(true)

    await Effect.runPromise(opened.db.close)
  })

  it('stops at the statement the database refuses and says how far it got', async () => {
    const project = makeProject('halting')
    const opened = await Effect.runPromise(openOn(project))
    await Effect.runPromise(
      applyPendingMigrations({ engine: opened.engine, migrations: opened.migrations }),
    )
    const applied = await Effect.runPromise(
      applyStatements({
        driver: opened.driver,
        statements: [
          'ALTER TABLE "User" ADD COLUMN "name" TEXT',
          'ALTER TABLE "Nope" ADD COLUMN "x" TEXT',
          'ALTER TABLE "User" ADD COLUMN "never" TEXT',
        ],
      }),
    )
    expect(applied.ok).toBe(false)
    expect(applied.failedAt).toBe(1)
    // The third statement is never attempted.
    expect(applied.results).toHaveLength(2)
    expect(applied.results[1]?.error).toContain('Nope')
    await Effect.runPromise(opened.db.close)
  })
})
