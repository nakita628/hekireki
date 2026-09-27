import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { createProjectClient } from './client.js'
import { disconnectedDatabase } from './database.js'
import {
  ClientTag,
  configureRuntime,
  DatabaseTag,
  studioRuntime,
  StudioStateTag,
} from './runtime.js'
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
  await Effect.runPromise(Effect.provide(studioState.reload(), NodeFileSystem.layer))
  return studioState
}

describe('studioRuntime', () => {
  it('explains that no app has been created when nothing is configured yet', () => {
    expect(() => studioRuntime()).toThrow(/createStudioApp\(\)/u)
  })
})

describe('configureRuntime', () => {
  it('provides the state, database and client it was given to the effects it runs', async () => {
    const studioState = await state()
    const db = disconnectedDatabase('none')
    const client = createProjectClient({ target: null, reason: 'none', schemaDir: '.', cwd: '.' })
    const runtime = configureRuntime({ state: studioState, db, client })
    expect(studioRuntime()).toBe(runtime)
    expect(runtime.runSync(StudioStateTag)).toBe(studioState)
    expect(runtime.runSync(DatabaseTag)).toBe(db)
    expect(runtime.runSync(ClientTag)).toBe(client)
    expect(
      runtime
        .runSync(StudioStateTag)
        .snapshot()
        .schema?.models.map((m) => m.name),
    ).toStrictEqual(['User'])
  })

  it('replaces the previous runtime, so handlers see the latest state', async () => {
    const first = configureRuntime({
      state: await state(),
      db: disconnectedDatabase(),
      client: createProjectClient({
        target: null,
        reason: 'No database is connected.',
        schemaDir: '.',
        cwd: '.',
      }),
    })
    const second = configureRuntime({
      state: await state(),
      db: disconnectedDatabase(),
      client: createProjectClient({
        target: null,
        reason: 'No database is connected.',
        schemaDir: '.',
        cwd: '.',
      }),
    })
    expect(second).not.toBe(first)
    expect(studioRuntime()).toBe(second)
  })
})
