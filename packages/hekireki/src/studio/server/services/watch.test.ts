import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { createStudioState } from './state.js'
import { watchMigrations, watchSchema } from './watch.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, 'model User {\n  id Int @id\n}\n')
  return { dir, schemaPath, state: createStudioState({ schemaPath }) }
}

function until(predicate: () => boolean, attempts = 100): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    if (predicate()) return true
    if (attempts === 0) return false
    yield* Effect.sleep('30 millis')
    return yield* until(predicate, attempts - 1)
  })
}

describe('watchSchema', () => {
  it('reloads after a burst of .prisma writes and stops with the scope', async () => {
    const { dir, schemaPath, state } = setup()
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* state.reload()
          const before = state.snapshot().updatedAt
          yield* watchSchema({ state, dir, debounceMs: 50 })
          yield* Effect.sleep('100 millis')
          writeFileSync(schemaPath, 'model User {\n  id Int @id\n  name String\n}\n')
          writeFileSync(path.join(dir, 'README.md'), 'ignored')
          const reloaded = yield* until(() => state.snapshot().updatedAt !== before)
          return { reloaded, fields: state.snapshot().schema?.models[0]?.fields.length }
        }),
      ).pipe(Effect.provide(fileSystemLayer)),
    )
    expect(result).toStrictEqual({ reloaded: true, fields: 2 })
    const after = state.snapshot().updatedAt
    writeFileSync(schemaPath, 'model User {\n  id Int @id\n}\n')
    await Effect.runPromise(Effect.sleep('200 millis'))
    expect(state.snapshot().updatedAt).toBe(after)
  })
})

describe('watchMigrations', () => {
  it('notes a migration added, one edited and the directory made, and nothing while nothing changes', async () => {
    const { dir, state } = setup()
    // Not there yet: the first migration makes it.
    const migrations = path.join(dir, 'migrations')
    const seen = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const start = state.migrationsUpdatedAt()
          yield* watchMigrations({ state, dir: migrations, intervalMs: 30 })
          yield* Effect.sleep('120 millis')
          const quiet = state.migrationsUpdatedAt() === start

          mkdirSync(path.join(migrations, '20260101000000_init'), { recursive: true })
          writeFileSync(
            path.join(migrations, '20260101000000_init', 'migration.sql'),
            'CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY);\n',
          )
          const added = yield* until(() => state.migrationsUpdatedAt() !== start)
          const afterAdd = state.migrationsUpdatedAt()

          // Written again with more in it: an edit.
          yield* Effect.sleep('20 millis')
          writeFileSync(
            path.join(migrations, '20260101000000_init', 'migration.sql'),
            'CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY, "name" TEXT);\n',
          )
          const edited = yield* until(() => state.migrationsUpdatedAt() !== afterAdd)
          return { quiet, added, edited }
        }),
      ).pipe(Effect.provide(fileSystemLayer)),
    )
    expect(seen).toStrictEqual({ quiet: true, added: true, edited: true })
  })
})
