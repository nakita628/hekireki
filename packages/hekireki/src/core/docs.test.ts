import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeFileSystem } from '@effect/platform-node'
import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { docs } from './docs.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-docs-'))
  dirs.push(dir)
  return dir
}

const MODEL = {
  name: 'User',
  dbName: null,
  schema: null,
  fields: [
    {
      name: 'id',
      kind: 'scalar',
      isList: false,
      isRequired: true,
      isUnique: false,
      isId: true,
      isReadOnly: false,
      hasDefaultValue: false,
      type: 'Int',
      isGenerated: false,
      isUpdatedAt: false,
    },
  ],
  primaryKey: null,
  uniqueFields: [],
  uniqueIndexes: [],
}

/**
 * The slice of `GeneratorOptions` this generator reads. No datasource: the docs are written
 * without SQL, and nothing reads the schema file.
 */
function run(output: string | null, config: Record<string, string> = {}) {
  const options = {
    generator: {
      isCustomOutput: output !== null,
      output: output === null ? null : { fromEnvVar: null, value: output },
      config,
    },
    datasources: [],
    dmmf: { datamodel: { models: [MODEL], enums: [], types: [], indexes: [] } },
  } as unknown as GeneratorOptions
  return Effect.runPromiseExit(Effect.provide(docs(options), NodeFileSystem.layer))
}

/** The message of a failure, whichever way it failed. */
function failure(exit: Exit.Exit<unknown, { readonly message: string }>) {
  return Exit.isFailure(exit) ? String(exit.cause) : ''
}

describe('docs', () => {
  it('writes the README and the ER diagram into the directory output names', async () => {
    const dir = path.join(tmp(), 'docs')
    expect(Exit.isSuccess(await run(dir))).toBe(true)
    const readme = readFileSync(path.join(dir, 'README.md'), 'utf8')
    expect(readme).toContain('![ER diagram](er.svg)')
    expect(readme).toContain('| `id`  | `Int` | PK NOT NULL |')
    // No datasource, so no SQL: the queries are the calls alone.
    expect(readme).toContain('<summary>Queries</summary>')
    expect(readme).toContain('await prisma.user.findMany();')
    expect(readFileSync(path.join(dir, 'er.svg'), 'utf8')).toContain('<svg')
  })

  // A model with no relation has no diagram of its own, so one left from a run before is stale.
  it('removes the diagram of a model the docs no longer draw', async () => {
    const dir = path.join(tmp(), 'docs')
    mkdirSync(path.join(dir, 'tables'), { recursive: true })
    writeFileSync(path.join(dir, 'tables/Gone.svg'), '<svg/>')
    writeFileSync(path.join(dir, 'tables/notes.txt'), 'kept')
    expect(Exit.isSuccess(await run(dir))).toBe(true)
    expect(existsSync(path.join(dir, 'tables/Gone.svg'))).toBe(false)
    expect(existsSync(path.join(dir, 'tables/notes.txt'))).toBe(true)
  })

  it('draws the diagram in the theme it is given', async () => {
    const light = path.join(tmp(), 'docs')
    const dark = path.join(tmp(), 'docs')
    expect(Exit.isSuccess(await run(light))).toBe(true)
    expect(Exit.isSuccess(await run(dark, { theme: 'dark' }))).toBe(true)
    expect(readFileSync(path.join(dark, 'er.svg'), 'utf8')).not.toBe(
      readFileSync(path.join(light, 'er.svg'), 'utf8'),
    )
  })

  it('says that output is required when there is none', async () => {
    expect(failure(await run(null))).toContain('output is required for Hekireki-Docs')
  })

  it('refuses an output that names a file, rather than writing a directory of that name', async () => {
    const message = failure(await run(path.join(tmp(), 'README.md')))
    expect(message).toContain('output for Hekireki-Docs names the directory')
    expect(message).toContain('ends in ".md"')
  })

  it('refuses an option it does not read', async () => {
    expect(failure(await run(path.join(tmp(), 'docs'), { outputs: 'x', nope: '1' }))).toContain(
      'Hekireki-Docs does not read "outputs", "nope"; it takes theme.',
    )
  })
})
