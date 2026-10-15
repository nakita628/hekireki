import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { createProjectClient } from './client.js'
import { disconnectedDatabase } from './database.js'
import { createStudioState } from './state.js'
import { configureStudio, studio } from './studio.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function state() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, 'model User {\n  id Int @id\n}\n')
  const studioState = createStudioState({ schemaPath })
  await Effect.runPromise(Effect.provide(studioState.reload(), NodeFileSystem.layer))
  return studioState
}

describe('studio', () => {
  it('explains that no app has been created when nothing is configured yet', () => {
    expect(() => studio()).toThrow(/createStudioApp\(\)/u)
  })
})

describe('configureStudio', () => {
  it('hands the use cases the state, database and client it was given', async () => {
    const studioState = await state()
    const db = disconnectedDatabase('none')
    const client = createProjectClient({ target: null, reason: 'none', schemaDir: '.', cwd: '.' })
    configureStudio({ state: studioState, db, client })
    expect(studio().state).toBe(studioState)
    expect(studio().db).toBe(db)
    expect(studio().client).toBe(client)
    expect(
      studio()
        .state.snapshot()
        .schema?.models.map((m) => m.name),
    ).toStrictEqual(['User'])
  })

  it('replaces the previous instances, so the use cases see the latest app', async () => {
    const first = await state()
    configureStudio({
      state: first,
      db: disconnectedDatabase(),
      client: createProjectClient({ target: null, reason: 'none', schemaDir: '.', cwd: '.' }),
    })
    const second = await state()
    configureStudio({
      state: second,
      db: disconnectedDatabase(),
      client: createProjectClient({ target: null, reason: 'none', schemaDir: '.', cwd: '.' }),
    })
    expect(studio().state).toBe(second)
    expect(studio().state).not.toBe(first)
  })
})
