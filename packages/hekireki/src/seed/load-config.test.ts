import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect, Exit } from 'effect'
import type { FileSystem } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { SeedConfigError } from './errors.js'
import { CONFIG_FILE, loadSeedConfig, readConfigUrl, resolveConfigPath } from './load-config.js'

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
  return Effect.runPromiseExit(effect.pipe(Effect.provide(NodeFileSystem.layer)))
}

function failure(exit: Exit.Exit<unknown, unknown>) {
  if (Exit.isSuccess(exit)) throw new Error('expected a failure')
  const error = Exit.isFailure(exit) ? exit.cause : null
  return error === null ? '' : String(error)
}

describe('resolveConfigPath', () => {
  it('looks for hekireki.config.ts and nothing else', async () => {
    expect(CONFIG_FILE).toBe('hekireki.config.ts')
    const dir = tmp()
    expect(await run(resolveConfigPath(null, dir))).toStrictEqual(Exit.succeed(null))
    writeFileSync(path.join(dir, 'hekireki.config.mjs'), 'export default {}\n')
    writeFileSync(path.join(dir, 'hekireki.config.js'), 'export default {}\n')
    expect(await run(resolveConfigPath(null, dir))).toStrictEqual(Exit.succeed(null))
    writeFileSync(path.join(dir, 'hekireki.config.ts'), 'export default {}\n')
    expect(await run(resolveConfigPath(null, dir))).toStrictEqual(
      Exit.succeed(path.join(dir, 'hekireki.config.ts')),
    )
  })

  it('uses an explicit TypeScript path relative to the working directory, names it when missing, and refuses JavaScript', async () => {
    const dir = tmp()
    writeFileSync(path.join(dir, 'custom.config.ts'), 'export default {}\n')
    expect(await run(resolveConfigPath('custom.config.ts', dir))).toStrictEqual(
      Exit.succeed(path.join(dir, 'custom.config.ts')),
    )
    writeFileSync(path.join(dir, 'custom.mjs'), 'export default {}\n')
    expect(failure(await run(resolveConfigPath('custom.mjs', dir)))).toContain(
      'Config must be a TypeScript file: custom.mjs',
    )
    expect(failure(await run(resolveConfigPath('nope.ts', dir)))).toContain(
      'Config not found: nope.ts\n   Check the path passed to --config.',
    )
  })
})

describe('loadSeedConfig', () => {
  it('imports a JavaScript module and validates its default export', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.ts')
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
    const file = path.join(dir, 'hekireki.config.ts')
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
    const other = path.join(dir, 'bad.config.ts')
    writeFileSync(other, `export default { models: { User: { data: [{ id: () => 1 }] } } }\n`)
    const bad = await Effect.runPromiseExit(
      loadSeedConfig(other).pipe(Effect.provide(NodeFileSystem.layer), Effect.flip),
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
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(file, 'export const config = {}\n')
    const exit = await run(loadSeedConfig(file))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(failure(exit)).toContain(
      `${file} has no default export.\n   Write \`export default defineConfig({ ... })\`.`,
    )
  })

  it('lists every invalid option with its path', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(
      file,
      `export default { seed: 'x', nullRate: 2, models: { User: { count: -1, fields: { age: { nullRate: 'no' } } } } }\n`,
    )
    const exit = await Effect.runPromiseExit(
      loadSeedConfig(file).pipe(Effect.provide(NodeFileSystem.layer), Effect.flip),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value).toBeInstanceOf(SeedConfigError)
    expect(exit.value.message.split('\n')).toStrictEqual([
      `Invalid config in ${file}:`,
      '   seed: Expected number',
      '   nullRate: Expected a value between 0 and 1',
      '   models.User.count: Expected a value greater than or equal to 0',
      '   models.User.fields.age: Expected a rule function (faker, { index, row }) => value',
      '   models.User.fields.age.nullRate: Expected number',
    ])
  })

  it('rejects a key the config does not have, so a typo is not ignored', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(
      file,
      `export default { seeds: 1, models: { User: { fields: { age: { maximum: 3 } } } } }\n`,
    )
    const exit = await Effect.runPromiseExit(
      loadSeedConfig(file).pipe(Effect.provide(NodeFileSystem.layer), Effect.flip),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.message.split('\n')).toStrictEqual([
      `Invalid config in ${file}:`,
      '   seeds: Expected no excess property',
      '   models.User.fields.age: Expected a rule function (faker, { index, row }) => value',
      '   models.User.fields.age.maximum: Expected no excess property',
    ])
  })

  it('says where the decisions of a data migration went, for a config that still holds them', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(file, `export default { migrate: { models: {} } }\n`)
    expect(failure(await run(loadSeedConfig(file)))).toContain(
      'migrate: the config no longer holds the decisions of a data migration.\n   Make them on the Migrate page of hekireki studio',
    )
  })

  it('reports a module that cannot be imported', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(file, 'export default {\n')
    expect(failure(await run(loadSeedConfig(file)))).toContain(`Cannot load ${file}:`)
  })
})

describe('readConfigUrl', () => {
  it('is the url of the config in the directory, null without a config or a url, and the loader error otherwise', async () => {
    const empty = tmp()
    expect(await run(readConfigUrl(empty))).toStrictEqual(Exit.succeed(null))
    const withUrl = tmp()
    writeFileSync(
      path.join(withUrl, 'hekireki.config.ts'),
      "export default { url: 'file:./dev.db' }\n",
    )
    expect(await run(readConfigUrl(withUrl))).toStrictEqual(Exit.succeed('file:./dev.db'))
    const withoutUrl = tmp()
    writeFileSync(path.join(withoutUrl, 'hekireki.config.ts'), 'export default { count: 3 }\n')
    expect(await run(readConfigUrl(withoutUrl))).toStrictEqual(Exit.succeed(null))
    const broken = tmp()
    writeFileSync(path.join(broken, 'hekireki.config.ts'), 'export default { url: 3 }\n')
    expect(failure(await run(readConfigUrl(broken)))).toContain('Invalid config')
  })
})

describe('loadSeedConfig, every option checked', () => {
  it.each([
    ['seed: 1.5', ['seed: Expected an integer']],
    ["seed: '7'", ['seed: Expected number']],
    ['count: -1', ['count: Expected a value greater than or equal to 0']],
    ['count: 2.5', ['count: Expected an integer']],
    ['nullRate: 1.5', ['nullRate: Expected a value between 0 and 1']],
    ['nullRate: -0.1', ['nullRate: Expected a value between 0 and 1']],
    ['locale: 7', ['locale: Expected string | array']],
    ["locale: ['ja', 3]", ['locale.1: Expected string']],
    ["dates: 'x'", ['dates: Expected object']],
    ['dates: { from: 3 }', ['dates.from: Expected a date']],
    ['dates: { nope: 1 }', ['dates.nope: Expected no excess property']],
    ['output: 3', ['output: Expected string']],
    ['url: 3', ['url: Expected string']],
    ['schema: null', ['schema: Expected string']],
    ["reset: 'yes'", ['reset: Expected boolean']],
    [
      "client: 'x'",
      [
        'client: Expected a function returning the Prisma Client: () => new PrismaClient({ adapter })',
      ],
    ],
    [
      'client: {}',
      [
        'client: Expected a function returning the Prisma Client: () => new PrismaClient({ adapter })',
      ],
    ],
    ['models: []', ['models: Expected object']],
    ['models: { User: 3 }', ['models.User: Expected object']],
    ["models: { User: { count: 'x' } }", ['models.User.count: Expected number']],
    ['models: { User: { nope: 1 } }', ['models.User.nope: Expected no excess property']],
    [
      'models: { User: { fields: { age: 3 } } }',
      ['models.User.fields.age: Expected a rule function (faker, { index, row }) => value'],
    ],
    [
      'models: { User: { fields: { age: { nope: 1 } } } }',
      [
        'models.User.fields.age: Expected a rule function (faker, { index, row }) => value',
        'models.User.fields.age.nope: Expected no excess property',
      ],
    ],
    [
      "models: { User: { fields: { age: { min: 'x' } } } }",
      [
        'models.User.fields.age: Expected a rule function (faker, { index, row }) => value',
        'models.User.fields.age.min: Expected number',
      ],
    ],
    [
      'models: { User: { fields: { age: { length: -1 } } } }',
      [
        'models.User.fields.age: Expected a rule function (faker, { index, row }) => value',
        'models.User.fields.age.length: Expected a value greater than or equal to 0',
      ],
    ],
    [
      'models: { User: { fields: { age: { length: { min: 1 } } } } }',
      [
        'models.User.fields.age: Expected a rule function (faker, { index, row }) => value',
        'models.User.fields.age.length.max: Missing key',
      ],
    ],
    [
      'models: { User: { fields: { age: { nullRate: 2 } } } }',
      [
        'models.User.fields.age: Expected a rule function (faker, { index, row }) => value',
        'models.User.fields.age.nullRate: Expected a value between 0 and 1',
      ],
    ],
    [
      'models: { User: { fields: { age: { values: [Symbol()] } } } }',
      [
        'models.User.fields.age: Expected a rule function (faker, { index, row }) => value',
        'models.User.fields.age.values.0: Expected a string, number, bigint, boolean, Date, bytes, null, or JSON of those',
      ],
    ],
    [
      'models: { User: { relations: { posts: 3 } } }',
      ['models.User.relations.posts: Expected object'],
    ],
    [
      'models: { User: { relations: { posts: { min: -1 } } } }',
      ['models.User.relations.posts.min: Expected a value greater than or equal to 0'],
    ],
    [
      'models: { User: { relations: { posts: { max: 1.5 } } } }',
      ['models.User.relations.posts.max: Expected an integer'],
    ],
    [
      'models: { User: { relations: { posts: { nope: 1 } } } }',
      ['models.User.relations.posts.nope: Expected no excess property'],
    ],
    ["models: { User: { data: 'x' } }", ['models.User.data: Expected array']],
    ['models: { User: { data: [3] } }', ['models.User.data.0: Expected object']],
    [
      'models: { User: { data: [{ a: () => 1 }] }}',
      [
        'models.User.data.0.a: Expected a string, number, bigint, boolean, Date, bytes, null, or JSON of those',
      ],
    ],
    [
      'models: { User: { data: [{ a: { nested: Symbol() } }] } }',
      [
        'models.User.data.0.a: Expected a string, number, bigint, boolean, Date, bytes, null, or JSON of those',
      ],
    ],
    [
      'models: { User: { fields: { age: { min: 5, max: 3 } } } }',
      [
        'models.User.fields.age: Expected a rule function (faker, { index, row }) => value',
        'models.User.fields.age: Expected min at or below max',
      ],
    ],
    [
      'models: { User: { fields: { name: { length: { min: 4, max: 2 } } } } }',
      [
        'models.User.fields.name: Expected a rule function (faker, { index, row }) => value',
        'models.User.fields.name.length: Expected min at or below max',
      ],
    ],
    [
      "models: { User: { fields: { joined: { from: '2025-02-01', to: '2025-01-01' } } } }",
      [
        'models.User.fields.joined: Expected a rule function (faker, { index, row }) => value',
        'models.User.fields.joined: Expected from at or before to',
      ],
    ],
    [
      "models: { User: { fields: { joined: { from: 'yesterday' } } } }",
      [
        'models.User.fields.joined: Expected a rule function (faker, { index, row }) => value',
        'models.User.fields.joined.from: Expected a date',
      ],
    ],
    [
      'models: { User: { relations: { posts: { min: 3, max: 1 } } } }',
      ['models.User.relations.posts: Expected min at or below max'],
    ],
    ["dates: { from: '2025-12-31', to: '2025-01-01' }", ['dates: Expected from at or before to']],
    ["dates: { to: 'never' }", ['dates.to: Expected a date']],
    [
      'models: { User: { data: [{ a: [1, { b: undefined }] }] } }',
      [
        'models.User.data.0.a: Expected a string, number, bigint, boolean, Date, bytes, null, or JSON of those',
      ],
    ],
  ])('rejects %s', async (option, expected) => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(file, `export default { ${option} }\n`)
    const exit = await Effect.runPromiseExit(
      loadSeedConfig(file).pipe(Effect.provide(NodeFileSystem.layer), Effect.flip),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.message.split('\n')).toStrictEqual([
      `Invalid config in ${file}:`,
      ...expected.map((line) => `   ${line}`),
    ])
  })

  it('accepts a range or window with one edge, and one where both edges meet', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(
      file,
      `export default {
  dates: { from: '2025-01-01' },
  models: {
    User: {
      fields: { age: { min: 3 }, name: { length: { min: 2, max: 2 } }, joined: { from: '2025-01-01', to: '2025-01-01' } },
      relations: { posts: { max: 0 } },
    },
  },
}
`,
    )
    expect(Exit.isSuccess(await run(loadSeedConfig(file)))).toBe(true)
  })

  it('accepts every value a column can hold in real rows, as written', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(
      file,
      `export default {
  models: {
    Sample: {
      data: [
        {
          text: 'x',
          n: 1.5,
          big: 10n,
          flag: false,
          when: new Date('2025-01-01T00:00:00.000Z'),
          bytes: new Uint8Array([1, 2]),
          nothing: null,
          json: { list: [1, 'two', { three: null }], nested: { deep: true } },
          link: { email: 'a@example.com' },
          links: [1, { label: 'x' }],
          children: [{ title: 't' }],
        },
      ],
      relations: { children: { min: 1, max: 1 } },
    },
    Other: { count: 0, fields: { a: { value: null }, b: { values: [1, 2] }, c: { length: { min: 1, max: 2 } }, d: { from: new Date(0), to: '2025-01-01' } } },
  },
  dates: {},
  locale: 'ja',
  reset: false,
  client: () => null,
}
`,
    )
    const exit = await run(loadSeedConfig(file))
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    const row = exit.value.models?.Sample?.data?.[0]
    expect(row?.big).toBe(10n)
    expect(row?.bytes).toStrictEqual(new Uint8Array([1, 2]))
    expect(row?.when).toStrictEqual(new Date('2025-01-01T00:00:00.000Z'))
    expect(row?.json).toStrictEqual({ list: [1, 'two', { three: null }], nested: { deep: true } })
    expect(row?.links).toStrictEqual([1, { label: 'x' }])
    expect(exit.value.models?.Other?.fields?.d).toStrictEqual({
      from: new Date(0),
      to: '2025-01-01',
    })
    expect(typeof exit.value.client).toBe('function')
  })

  it.each([
    ['export default 3', '3'],
    ['export default []', '[]'],
    ['export default null', 'null'],
    ['export default "x"', '"x"'],
    ['export default () => ({})', 'a function'],
  ])('refuses %s as a config', async (source, _shape) => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(file, `${source}\n`)
    const exit = await Effect.runPromiseExit(
      loadSeedConfig(file).pipe(Effect.provide(NodeFileSystem.layer), Effect.flip),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.message).toBe(`Invalid config in ${file}:\n   (root): Expected object`)
  })

  it('reports a config that throws while it loads, with what it threw', async () => {
    const dir = tmp()
    const file = path.join(dir, 'hekireki.config.ts')
    writeFileSync(file, "throw new Error('no database today')\nexport default {}\n")
    const exit = await Effect.runPromiseExit(
      loadSeedConfig(file).pipe(Effect.provide(NodeFileSystem.layer), Effect.flip),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.message).toBe(`Cannot load ${file}: no database today`)
  })

  it('accepts .mts and .cts paths as TypeScript, and a nested relative path', async () => {
    const dir = tmp()
    mkdirSync(path.join(dir, 'config'))
    writeFileSync(path.join(dir, 'config', 'seed.mts'), 'export default {}\n')
    expect(await run(resolveConfigPath('config/seed.mts', dir))).toStrictEqual(
      Exit.succeed(path.join(dir, 'config', 'seed.mts')),
    )
    expect(failure(await run(resolveConfigPath('config/seed.cts', dir)))).toContain(
      'Config not found: config/seed.cts',
    )
    // An explicit path wins over the hekireki.config.ts that is also there.
    writeFileSync(path.join(dir, 'hekireki.config.ts'), 'export default {}\n')
    expect(await run(resolveConfigPath('config/seed.mts', dir))).toStrictEqual(
      Exit.succeed(path.join(dir, 'config', 'seed.mts')),
    )
  })
})
