import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { createStudioState } from './state.js'
import { watchSchema } from './watch.js'

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
