import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect, Exit } from 'effect'
import type { FileSystem } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../file/index.js'
import { SeedConfigError } from './errors.js'
import { CONFIG_CANDIDATES, loadSeedConfig, resolveConfigPath } from './load-config.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-seed-config-'))
  dirs.push(dir)
  return dir
}

function run<A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) {
  return Effect.runPromiseExit(effect.pipe(Effect.provide(fileSystemLayer)))
}

function failure(exit: Exit.Exit<unknown, unknown>) {
  if (Exit.isSuccess(exit)) throw new Error('expected a failure')
  const error = Exit.isFailure(exit) ? exit.cause : null
  return error === null ? '' : String(error)
}

describe('resolveConfigPath', () => {
  it('looks for the four candidates in order', () => {
    expect(CONFIG_CANDIDATES).toStrictEqual([
      'hekireki.config.ts',
      'hekireki.config.mts',
      'hekireki.config.js',
      'hekireki.config.mjs',
    ])
  })

  it('takes the first candidate that exists, or null when none does', async () => {
    const dir = tmp()
    expect(await run(resolveConfigPath(null, dir))).toStrictEqual(Exit.succeed(null))
    writeFileSync(path.join(dir, 'hekireki.config.mjs'), 'export default {}\n')
    expect(await run(resolveConfigPath(null, dir))).toStrictEqual(
      Exit.succeed(path.join(dir, 'hekireki.config.mjs')),
    )
    writeFileSync(path.join(dir, 'hekireki.config.ts'), 'export default {}\n')
    expect(await run(resolveConfigPath(null, dir))).toStrictEqual(
      Exit.succeed(path.join(dir, 'hekireki.config.ts')),
    )
  })

  it('uses an explicit path relative to the working directory and names it when missing', async () => {
    const dir = tmp()
    writeFileSync(path.join(dir, 'custom.mjs'), 'export default {}\n')
    expect(await run(resolveConfigPath('custom.mjs', dir))).toStrictEqual(
      Exit.succeed(path.join(dir, 'custom.mjs')),
    )
    expect(failure(await run(resolveConfigPath('nope.ts', dir)))).toContain(
      'Config not found: nope.ts\n   Check the path passed to --config.',
    )
  })
})

describe('loadSeedConfig', () => {
  it('imports a JavaScript module and validates its default export', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.mjs')
    writeFileSync(
      file,
      `export default {
  seed: 7,
  locale: ['ja', 'en'],
  models: { User: { count: 3, fields: { age: { min: 1, max: 2 }, name: (faker) => faker.person.fullName() } } },
}
`,
    )
    const exit = await run(loadSeedConfig(file))
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.seed).toBe(7)
    expect(exit.value.locale).toStrictEqual(['ja', 'en'])
    expect(exit.value.models?.User?.count).toBe(3)
    expect(exit.value.models?.User?.fields?.age).toStrictEqual({ min: 1, max: 2 })
    expect(typeof exit.value.models?.User?.fields?.name).toBe('function')
  })

  it('accepts real data rows and rejects a value no column can hold', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.mjs')
    writeFileSync(
      file,
      `export default {
  models: {
    User: {
      data: [{ id: 1, email: 'ann@example.com', tags: ['a'], joined: new Date('2025-01-01') }],
    },
  },
}
`,
    )
    const exit = await run(loadSeedConfig(file))
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.models?.User?.data?.[0]?.email).toBe('ann@example.com')
    // A second file: an ES module is imported once per path, so the first content would come back.
    const other = path.join(dir, 'bad.config.mjs')
    writeFileSync(other, `export default { models: { User: { data: [{ id: () => 1 }] } } }\n`)
    const bad = await Effect.runPromiseExit(
      loadSeedConfig(other).pipe(Effect.provide(fileSystemLayer), Effect.flip),
    )
    expect(Exit.isSuccess(bad)).toBe(true)
    if (!Exit.isSuccess(bad)) return
    expect(bad.value.message.split('\n')).toStrictEqual([
      `Invalid config in ${other}:`,
      '   models.User.data.0.id: Expected a string, number, bigint, boolean, Date, bytes, null, or JSON of those',
    ])
  })

  it('resolves imports without an extension of TypeScript files, as a bundler would', async () => {
    const dir = tmp()
    mkdirSync(path.join(dir, 'data'))
    writeFileSync(
      path.join(dir, 'data', 'users.ts'),
      `export const users: readonly { readonly email: string }[] = [{ email: 'ann@example.com' }]\n`,
    )
    writeFileSync(path.join(dir, 'data', 'index.ts'), `export const seed: number = 5\n`)
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(
      file,
      `import { seed } from './data'
import { users } from './data/users'
import { users as again } from './data/users.js'
export default { seed, models: { User: { data: [...users, ...again] } } }
`,
    )
    const exit = await run(loadSeedConfig(file))
    expect(exit).toStrictEqual(
      Exit.succeed({
        seed: 5,
        models: { User: { data: [{ email: 'ann@example.com' }, { email: 'ann@example.com' }] } },
      }),
    )
  })

  it('imports a TypeScript config, types and all', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(
      file,
      `type Config = { readonly seed: number; readonly count?: number }
const config: Config = { seed: 11, count: 2 }
export default config
`,
    )
    const exit = await run(loadSeedConfig(file))
    expect(exit).toStrictEqual(Exit.succeed({ seed: 11, count: 2 }))
  })

  it('rejects a module without a default export', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.mjs')
    writeFileSync(file, 'export const config = {}\n')
    const exit = await run(loadSeedConfig(file))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(failure(exit)).toContain(
      `${file} has no default export.\n   Write \`export default defineConfig({ ... })\`.`,
    )
  })

  it('lists every invalid option with its path', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.mjs')
    writeFileSync(
      file,
      `export default { seed: 'x', nullRate: 2, models: { User: { count: -1, fields: { age: { nullRate: 'no' } } } } }\n`,
    )
    const exit = await Effect.runPromiseExit(
      loadSeedConfig(file).pipe(Effect.provide(fileSystemLayer), Effect.flip),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value).toBeInstanceOf(SeedConfigError)
    expect(exit.value.message.split('\n')).toStrictEqual([
      `Invalid config in ${file}:`,
      '   seed: Invalid input: expected number, received string',
      '   nullRate: Too big: expected number to be <=1',
      '   models.User.count: Too small: expected number to be >=0',
      '   models.User.fields.age: Invalid input',
    ])
  })

  it('rejects a key the config does not have, so a typo is not ignored', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.mjs')
    writeFileSync(
      file,
      `export default { seeds: 1, models: { User: { fields: { age: { maximum: 3 } } } } }\n`,
    )
    const exit = await Effect.runPromiseExit(
      loadSeedConfig(file).pipe(Effect.provide(fileSystemLayer), Effect.flip),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.message.split('\n')).toStrictEqual([
      `Invalid config in ${file}:`,
      '   models.User.fields.age: Unrecognized key: "maximum"',
      '   (root): Unrecognized key: "seeds"',
    ])
  })

  it('reports a module that cannot be imported', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.mjs')
    writeFileSync(file, 'export default {\n')
    expect(failure(await run(loadSeedConfig(file)))).toContain(`Cannot load ${file}:`)
  })
})
