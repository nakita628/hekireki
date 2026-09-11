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

/**
 * The slice of `GeneratorOptions` this generator reads. Like Prisma, a block without `output`
 * still gets one — the directory of the schema file that declares it — just not a custom one.
 */
function options(
  output: string | null,
  config: Record<string, string | string[]>,
  schemaDir: string,
) {
  return {
    generator: {
      isCustomOutput: output !== null,
      output: { fromEnvVar: null, value: output ?? schemaDir },
      config,
      sourceFilePath: path.join(schemaDir, 'schema.prisma'),
    },
    dmmf: { datamodel: { models: [MODEL], enums: [], types: [], indexes: [] } },
  } as unknown as GeneratorOptions
}

function run(
  output: string | null,
  config: Record<string, string | string[]> = {},
  schemaDir = tmpdir(),
) {
  return Effect.runPromiseExit(
    Effect.provide(er(options(output, config, schemaDir)), fileSystemLayer),
  )
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
    const message = failure(await run(path.join(tmp(), 'diagram')))
    expect(message).toContain('not a directory')
    expect(message).toContain('ends in nothing')
  })

  it('says that output or outputs is required when there is neither', async () => {
    expect(failure(await run(null))).toContain('output or outputs is required for Hekireki-ER')
  })

  it('reads the theme of a drawing', async () => {
    const dir = tmp()
    const dark = path.join(dir, 'dark.svg')
    const light = path.join(dir, 'light.svg')
    expect(Exit.isSuccess(await run(dark, { theme: 'dark' }))).toBe(true)
    expect(Exit.isSuccess(await run(light, { theme: 'light' }))).toBe(true)
    expect(readFileSync(dark, 'utf8')).not.toBe(readFileSync(light, 'utf8'))
  })

  // An option the chosen format cannot read is a mistake in the schema, not something to skip
  // over: `theme` on a `.md` output would otherwise look like it did something.
  it.each([
    ['er.md', { theme: 'dark' }, '"theme"', '.md takes no options'],
    ['er.dbml', { theme: 'dark' }, '"theme"', '.dbml takes no options'],
    // DBML always writes the @map / @@map names; the switch that turned that off is gone.
    ['er.dbml', { mapToDbSchema: 'false' }, '"mapToDbSchema"', '.dbml takes no options'],
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

  // One ER model in several formats is one generator block: `outputs` lists every file, each a
  // whole path resolved the way Prisma resolves `output` — against the schema file's directory.
  it('writes every file outputs names, relative to the schema', async () => {
    const dir = tmp()
    expect(
      Exit.isSuccess(
        await run(
          null,
          { outputs: ['docs/er.md', 'docs/schema.dbml', 'images/er.svg', 'er.png'] },
          dir,
        ),
      ),
    ).toBe(true)
    expect(readFileSync(path.join(dir, 'docs/er.md'), 'utf8')).toContain('```mermaid')
    expect(readFileSync(path.join(dir, 'docs/schema.dbml'), 'utf8')).toContain('Table User {')
    expect(readFileSync(path.join(dir, 'images/er.svg'), 'utf8')).toContain('<svg')
    expect(readFileSync(path.join(dir, 'er.png'), 'latin1').slice(0, 8)).toContain('PNG')
  })

  it('takes outputs written as one name, and an absolute path as it is', async () => {
    const dir = tmp()
    expect(Exit.isSuccess(await run(null, { outputs: 'docs/er.svg' }, dir))).toBe(true)
    expect(readFileSync(path.join(dir, 'docs/er.svg'), 'utf8')).toContain('<svg')
    const absolute = path.join(tmp(), 'er.md')
    expect(Exit.isSuccess(await run(null, { outputs: [absolute] }, dir))).toBe(true)
    expect(readFileSync(absolute, 'utf8')).toContain('```mermaid')
  })

  it('reads an option for any format outputs names', async () => {
    const dir = tmp()
    expect(
      Exit.isSuccess(
        await run(null, { outputs: ['er.md', 'er.svg'], theme: 'dark', nope: '1' }, dir),
      ),
    ).toBe(false)
    expect(
      Exit.isSuccess(await run(null, { outputs: ['er.md', 'er.svg'], theme: 'dark' }, dir)),
    ).toBe(true)
    const light = tmp()
    expect(Exit.isSuccess(await run(null, { outputs: ['er.svg'], theme: 'light' }, light))).toBe(
      true,
    )
    expect(readFileSync(path.join(dir, 'er.svg'), 'utf8')).not.toBe(
      readFileSync(path.join(light, 'er.svg'), 'utf8'),
    )
  })

  it('names every format when it refuses an option none of them reads', async () => {
    const message = failure(await run(null, { outputs: ['er.md', 'er.svg'], nope: '1' }, tmp()))
    expect(message).toContain('does not read "nope" for the .md, .svg outputs')
    expect(message).toContain('.md takes no options, .svg takes theme')
  })

  it.each([
    ['er.jpeg', '".jpeg"'],
    ['docs', 'nothing'],
  ])('refuses %s in outputs, which names no format', async (name, ending) => {
    const message = failure(await run(null, { outputs: ['er.md', name] }, tmp()))
    expect(message).toContain('outputs for Hekireki-ER has to name files ending in')
    expect(message).toContain(`"${name}" ends in ${ending}`)
  })

  it('refuses an empty outputs, which would write nothing', async () => {
    expect(failure(await run(null, { outputs: [] }, tmp()))).toContain(
      'outputs for Hekireki-ER has to name at least one file',
    )
  })

  // Two places to name files would leave it unclear which one wins, so a block uses one.
  it('refuses output and outputs together', async () => {
    const dir = tmp()
    const message = failure(await run(path.join(dir, 'er.md'), { outputs: ['er.svg'] }, dir))
    expect(message).toContain('Hekireki-ER takes output or outputs, not both')
  })
})
