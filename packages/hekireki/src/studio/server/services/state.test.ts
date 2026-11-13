import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { createStudioState } from './state.js'

const SNAPSHOT = { schema: null, error: 'broken', diagnostics: [], files: [] }
const DOCS = { models: [], inputTypes: [], outputTypes: [], enumTypes: [] }

describe('createStudioState', () => {
  it('starts empty with the epoch timestamp', () => {
    const state = createStudioState({ schemaPath: '/nowhere/schema.prisma' })
    expect(state.snapshot()).toStrictEqual({
      schema: null,
      error: null,
      diagnostics: [],
      updatedAt: '1970-01-01T00:00:00.000Z',
      files: [],
    })
    expect(state.migrationsUpdatedAt()).toBe('1970-01-01T00:00:00.000Z')
  })

  it('keeps what it is given, stamped with the time it arrived', () => {
    const state = createStudioState({ schemaPath: 'schema.prisma' })
    const before = Date.now()
    const stored = state.replace({ snapshot: SNAPSHOT, docs: DOCS })
    expect(stored).toStrictEqual({ ...SNAPSHOT, updatedAt: stored.updatedAt })
    expect(Date.parse(stored.updatedAt)).toBeGreaterThanOrEqual(before)
    expect(state.snapshot()).toBe(stored)
    expect(state.docs()).toBe(DOCS)
  })

  it('moves the migrations stamp on when told', () => {
    const state = createStudioState({ schemaPath: 'schema.prisma' })
    state.touchMigrations()
    expect(state.migrationsUpdatedAt()).not.toBe('1970-01-01T00:00:00.000Z')
  })

  it('wakes a waiter on the next change, and at once when the change came first', async () => {
    const state = createStudioState({ schemaPath: 'schema.prisma' })
    const seen = state.version()
    const waiting = Effect.runPromise(state.nextChange(seen))
    state.touchMigrations()
    await waiting
    expect(state.version()).toBe(seen + 1)
    await Effect.runPromise(state.nextChange(seen))
    state.replace({ snapshot: SNAPSHOT, docs: DOCS })
    expect(state.version()).toBe(seen + 2)
  })
})
