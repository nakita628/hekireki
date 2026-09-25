import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect } from 'effect'
import { afterAll, describe, expect, it } from 'vite-plus/test'

import { connectDatabase } from '../../studio/server/services/database.js'
import { makeSchemaEngineAdapter } from './engine-adapter.js'
import { engineCommand, openSchemaEngine } from './engine.js'

const directory = mkdtempSync(path.join(tmpdir(), 'hekireki-adapter-'))

afterAll(() => {
  rmSync(directory, { recursive: true, force: true })
})

/** A SQLite database with one table, as a migration that has already run would have left it. */
function makeDatabase(name: string) {
  const file = path.join(directory, `${name}.db`)
  const db = new DatabaseSync(file)
  db.exec(
    'CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "email" TEXT NOT NULL)',
  )
  db.exec(`INSERT INTO "User" ("email") VALUES ('a@example.com')`)
  db.close()
  return file
}

const SCHEMA = `datasource db {
  provider = "sqlite"
}

model User {
  id    Int     @id @default(autoincrement())
  email String
  name  String?
}
`

/** The engine, opened on the database Studio connects to, as the use cases will open it. */
function openOn(file: string) {
  return Effect.gen(function* () {
    const schemaPath = path.join(directory, 'schema.prisma')
    const db = yield* connectDatabase({
      explicitUrl: `file:${file}`,
      configUrl: null,
      configError: null,
      schemaText: SCHEMA,
      schemaProvider: 'sqlite',
      cwd: directory,
      schemaDir: directory,
      env: {},
    })
    const driver = yield* db.driver
    const engine = yield* openSchemaEngine({
      files: [{ path: schemaPath, content: SCHEMA }],
      adapter: makeSchemaEngineAdapter(driver),
    })
    return { engine, db, files: [{ path: schemaPath, content: SCHEMA }] }
  }).pipe(Effect.provide(NodeFileSystem.layer))
}

describe('makeSchemaEngineAdapter', () => {
  it('lets the engine read the database Studio opened, and write the migration for it', async () => {
    const file = makeDatabase('diff')
    const { engine, db, files } = await Effect.runPromise(openOn(file))
    const diff = await Effect.runPromise(
      engineCommand(() =>
        engine.diff({
          from: { tag: 'schemaDatasource', files, configDir: directory },
          to: { tag: 'schemaDatamodel', files },
          script: true,
          exitCode: true,
          filters: { externalTables: [], externalEnums: [] },
        }),
      ),
    )
    // exitCode 2 is what `--exit-code` means by "the diff is not empty".
    expect(diff.exitCode).toBe(2)
    expect(diff.stdout).toContain('"name" TEXT')
    await Effect.runPromise(db.close)
  })

  it('reports an empty diff once the database matches the schema', async () => {
    const file = makeDatabase('matching')
    const db = new DatabaseSync(file)
    db.exec('ALTER TABLE "User" ADD COLUMN "name" TEXT')
    db.close()
    const opened = await Effect.runPromise(openOn(file))
    const diff = await Effect.runPromise(
      engineCommand(() =>
        opened.engine.diff({
          from: { tag: 'schemaDatasource', files: opened.files, configDir: directory },
          to: { tag: 'schemaDatamodel', files: opened.files },
          script: true,
          exitCode: true,
          filters: { externalTables: [], externalEnums: [] },
        }),
      ),
    )
    expect(diff.exitCode).toBe(0)
    await Effect.runPromise(opened.db.close)
  })
})
