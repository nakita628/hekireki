import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { createStudioState } from './state.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const SCHEMA = `model User {
  id   Int    @id @default(autoincrement())
  name String
}
`

function schemaFile() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, SCHEMA)
  return schemaPath
}

const reload = (state: ReturnType<typeof createStudioState>) =>
  Effect.runPromise(Effect.provide(state.reload(), fileSystemLayer))

describe('createStudioState', () => {
  it('starts empty with the epoch timestamp', () => {
    const state = createStudioState({ schemaPath: '/nowhere/schema.prisma' })
    expect(state.snapshot()).toStrictEqual({
      schema: null,
      error: null,
      updatedAt: '1970-01-01T00:00:00.000Z',
      files: [],
    })
  })

  it('reports a read error while keeping the schema empty', async () => {
    const state = createStudioState({ schemaPath: '/nowhere/schema.prisma' })
    const before = Date.now()
    const snapshot = await reload(state)
    expect(snapshot).toStrictEqual({
      schema: null,
      error:
        'Schema not found: /nowhere/schema.prisma\n   Pass --schema <path> pointing at your schema.prisma or a directory of .prisma files.',
      updatedAt: snapshot.updatedAt,
      files: [],
    })
    expect(Date.parse(snapshot.updatedAt)).toBeGreaterThanOrEqual(before)
  })

  it('keeps the last good schema when a reload fails, but advances updatedAt', async () => {
    const schemaPath = schemaFile()
    const state = createStudioState({ schemaPath })
    const good = await reload(state)
    expect(good.error).toBeNull()
    writeFileSync(schemaPath, 'model User {\n  id Nope @id\n}\n')
    const broken = await reload(state)
    expect(broken).toStrictEqual({
      schema: good.schema,
      error: `error: Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.\n  -->  ${schemaPath}:2\n   | \n 1 | model User {\n 2 |   id Nope @id\n   | \n\nValidation Error Count: 1`,
      updatedAt: broken.updatedAt,
      files: [{ path: schemaPath, content: 'model User {\n  id Nope @id\n}\n' }],
    })
    expect(broken.updatedAt >= good.updatedAt).toBe(true)
    expect(state.snapshot()).toBe(broken)
  })

  it('clears the error once the schema parses again', async () => {
    const schemaPath = schemaFile()
    const state = createStudioState({ schemaPath })
    await reload(state)
    writeFileSync(schemaPath, 'model User {\n  id Nope @id\n}\n')
    const broken = await reload(state)
    expect(broken.error).not.toBeNull()
    writeFileSync(schemaPath, SCHEMA)
    const fixed = await reload(state)
    expect(fixed.error).toBeNull()
    expect(fixed.schema?.models.map((m) => m.name)).toStrictEqual(['User'])
  })
})
