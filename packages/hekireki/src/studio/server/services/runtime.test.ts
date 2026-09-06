import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { disconnectedDatabase } from './database.js'
import { configureRuntime, DatabaseTag, studioRuntime, StudioStateTag } from './runtime.js'
import { createStudioState } from './state.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function state() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-runtime-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, 'model User {\n  id Int @id\n}\n')
  const studioState = createStudioState({ schemaPath })
  await Effect.runPromise(Effect.provide(studioState.reload(), fileSystemLayer))
  return studioState
}

describe('studioRuntime', () => {
  it('explains that no app has been created when nothing is configured yet', () => {
    expect(() => studioRuntime()).toThrow(/createStudioApp\(\)/u)
  })
})

describe('configureRuntime', () => {
  it('provides the state and database it was given to the effects it runs', async () => {
    const studioState = await state()
    const db = disconnectedDatabase('none')
    const runtime = configureRuntime({ state: studioState, db })
    expect(studioRuntime()).toBe(runtime)
    expect(runtime.runSync(StudioStateTag)).toBe(studioState)
    expect(runtime.runSync(DatabaseTag)).toBe(db)
    expect(
      runtime
        .runSync(StudioStateTag)
        .snapshot()
        .schema?.models.map((m) => m.name),
    ).toStrictEqual(['User'])
  })

  it('replaces the previous runtime, so handlers see the latest state', async () => {
    const first = configureRuntime({ state: await state(), db: disconnectedDatabase() })
    const second = configureRuntime({ state: await state(), db: disconnectedDatabase() })
    expect(second).not.toBe(first)
    expect(studioRuntime()).toBe(second)
  })
})
