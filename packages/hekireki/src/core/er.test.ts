import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../file/index.js'
import { er } from './er.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-er-'))
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

/** The slice of `GeneratorOptions` this generator reads. */
function options(output: string | null, config: Record<string, string> = {}) {
  return {
    generator: {
      isCustomOutput: output !== null,
      output: output === null ? null : { fromEnvVar: null, value: output },
      config,
    },
    dmmf: { datamodel: { models: [MODEL], enums: [], types: [], indexes: [] } },
  } as unknown as GeneratorOptions
}

function run(output: string | null, config: Record<string, string> = {}) {
  return Effect.runPromiseExit(Effect.provide(er(options(output, config)), fileSystemLayer))
}

/** The message of a failure, whichever way it failed. */
function failure(exit: Exit.Exit<unknown, { readonly message: string }>) {
  return Exit.isFailure(exit) ? String(exit.cause) : ''
}

describe('er', () => {
  it.each([
    ['er.md', '```mermaid'],
    ['schema.dbml', 'Table User {'],
  ])('writes %s from the extension it was given', async (name, marker) => {
    const dir = tmp()
    const file = path.join(dir, name)
    expect(Exit.isSuccess(await run(file))).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain(marker)
  })

  it.each([
    ['er.svg', '<svg'],
    ['er.png', 'PNG'],
  ])('draws %s from the extension it was given', async (name, marker) => {
    const dir = tmp()
    const file = path.join(dir, name)
    expect(Exit.isSuccess(await run(file))).toBe(true)
    expect(readFileSync(file, 'latin1').slice(0, 8)).toContain(marker)
  })

  it('takes the extension however it is cased', async () => {
    const dir = tmp()
    const file = path.join(dir, 'ER.DBML')
    expect(Exit.isSuccess(await run(file))).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('Table User {')
  })

  // The bug this shape was chosen to make impossible: an unknown extension used to fall through
  // to DBML, so `er.jpeg` was a text file with a picture's name.
  it('refuses an extension it has no format for, rather than guessing', async () => {
    const message = failure(await run(path.join(tmp(), 'er.jpeg')))
    expect(message).toContain('has to name a file ending in .md, .dbml, .png, .svg')
    expect(message).toContain('ends in ".jpeg"')
  })

  it('refuses a path with no extension, which used to mean a directory', async () => {
    expect(failure(await run(path.join(tmp(), 'diagram')))).toContain('ends in nothing')
  })

  it('says that output is required when there is none', async () => {
    expect(failure(await run(null))).toContain('output is required for Hekireki-ER')
  })

  it('reads the theme of a drawing, and the schema mapping of a dbml file', async () => {
    const dir = tmp()
    const dark = path.join(dir, 'dark.svg')
    const light = path.join(dir, 'light.svg')
    expect(Exit.isSuccess(await run(dark, { theme: 'dark' }))).toBe(true)
    expect(Exit.isSuccess(await run(light, { theme: 'light' }))).toBe(true)
    expect(readFileSync(dark, 'utf8')).not.toBe(readFileSync(light, 'utf8'))
    const mapped = path.join(dir, 'plain.dbml')
    expect(Exit.isSuccess(await run(mapped, { mapToDbSchema: 'false' }))).toBe(true)
  })

  // An option the chosen format cannot read is a mistake in the schema, not something to skip
  // over: `theme` on a `.md` output would otherwise look like it did something.
  it.each([
    ['er.md', { theme: 'dark' }, '"theme"', '.md takes no options'],
    ['er.dbml', { theme: 'dark' }, '"theme"', '.dbml takes mapToDbSchema'],
    ['er.svg', { mapToDbSchema: 'false' }, '"mapToDbSchema"', '.svg takes theme'],
    ['er.png', { nope: '1' }, '"nope"', '.png takes theme'],
  ])('refuses %s carrying an option it cannot read', async (name, config, named, tail) => {
    const message = failure(await run(path.join(tmp(), name), config))
    expect(message).toContain('Hekireki-ER does not read')
    expect(message).toContain(named)
    expect(message).toContain(tail)
  })

  it('names every option it cannot read, not just the first', async () => {
    const message = failure(await run(path.join(tmp(), 'er.md'), { theme: 'dark', nope: '1' }))
    expect(message).toContain('"theme", "nope"')
  })
})
