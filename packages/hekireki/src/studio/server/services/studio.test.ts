import { describe, expect, it } from 'vite-plus/test'

import { createProjectClient } from './client.js'
import { disconnectedDatabase } from './database.js'
import { createStudioState } from './state.js'
import { configureStudio, studio } from './studio.js'
import { createTypeChecker } from './typescript.js'

function instances() {
  return {
    state: createStudioState({ schemaPath: 'schema.prisma' }),
    db: disconnectedDatabase({ reason: 'none' }),
    client: createProjectClient({ target: null, reason: 'none', schemaDir: '.', cwd: '.' }),
    typescript: createTypeChecker({ schemaDir: '.', cwd: '.' }),
  }
}

describe('studio', () => {
  it('explains that no app has been created when nothing is configured yet', () => {
    expect(() => studio()).toThrow(/createStudioApp\(\)/u)
  })
})

describe('configureStudio', () => {
  it('hands the use cases the state, database, client and type checker it was given', () => {
    const given = instances()
    configureStudio(given)
    expect(studio().state).toBe(given.state)
    expect(studio().db).toBe(given.db)
    expect(studio().client).toBe(given.client)
    expect(studio().typescript).toBe(given.typescript)
  })

  it('replaces the previous instances, so the use cases see the latest app', () => {
    const first = instances()
    configureStudio(first)
    const second = instances()
    configureStudio(second)
    expect(studio().state).toBe(second.state)
    expect(studio().state).not.toBe(first.state)
  })
})
