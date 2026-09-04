import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import type { FileSystem } from 'effect'
import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../file/index.js'
import { activerecord } from './activerecord.js'
import { ajv } from './ajv.js'
import { arktype } from './arktype.js'
import { atlas } from './atlas.js'
import { django } from './django.js'
import { drizzle } from './drizzle.js'
import { ecto } from './ecto.js'
import { effect } from './effect.js'
import { eloquent } from './eloquent.js'
import { gorm } from './gorm.js'
import { kysely } from './kysely.js'
import { pydantic } from './pydantic.js'
import { seaOrm } from './sea-orm.js'
import { sqlalchemy } from './sqlalchemy.js'
import { typebox } from './typebox.js'
import { valibot } from './valibot.js'
import { zod } from './zod.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-core-'))
  dirs.push(dir)
  return dir
}

const MODELS = [
  {
    name: 'User',
    dbName: null,
    schema: null,
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    isGenerated: false,
    fields: [
      {
        name: 'id',
        kind: 'scalar',
        type: 'Int',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: true,
        isReadOnly: false,
        isGenerated: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
      },
      {
        name: 'name',
        kind: 'scalar',
        type: 'String',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        isGenerated: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
      },
      {
        name: 'role',
        kind: 'enum',
        type: 'Role',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        isGenerated: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
      },
      {
        name: 'posts',
        kind: 'object',
        type: 'Post',
        relationName: 'PostToUser',
        isList: true,
        isRequired: false,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        isGenerated: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
      },
    ],
  },
  {
    name: 'Post',
    dbName: null,
    schema: null,
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    isGenerated: false,
    fields: [
      {
        name: 'id',
        kind: 'scalar',
        type: 'Int',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: true,
        isReadOnly: false,
        isGenerated: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
      },
      {
        name: 'title',
        kind: 'scalar',
        type: 'String',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        isGenerated: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
      },
      {
        name: 'authorId',
        kind: 'scalar',
        type: 'Int',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: true,
        isGenerated: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
      },
      {
        name: 'author',
        kind: 'object',
        type: 'User',
        relationName: 'PostToUser',
        relationFromFields: ['authorId'],
        relationToFields: ['id'],
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        isGenerated: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
      },
    ],
  },
]

const ENUMS = [
  {
    name: 'Role',
    dbName: null,
    values: [
      { name: 'USER', dbName: null },
      { name: 'ADMIN', dbName: null },
    ],
  },
]

/** The slice of `GeneratorOptions` the core entrypoints read. */
function options(
  output: string | null,
  config: Record<string, string> = {},
  provider = 'postgresql',
) {
  return {
    generator: {
      isCustomOutput: output !== null,
      output: output === null ? null : { fromEnvVar: null, value: output },
      config,
    },
    datasources: [{ activeProvider: provider }],
    dmmf: { datamodel: { models: MODELS, enums: ENUMS, types: [], indexes: [] } },
  } as unknown as GeneratorOptions
}

function run(
  generator: (options: GeneratorOptions) => Effect.Effect<void, unknown, FileSystem.FileSystem>,
  output: string | null,
  config: Record<string, string> = {},
  provider = 'postgresql',
) {
  return Effect.runPromiseExit(
    Effect.provide(generator(options(output, config, provider)), fileSystemLayer),
  )
}

/** The message of a failure, whichever way it failed. */
function failure(exit: Exit.Exit<unknown, unknown>) {
  return Exit.isFailure(exit) ? String(exit.cause) : ''
}

// Every generator refuses to guess a destination. The pretty name in the message is what a user
// sees in `prisma generate` output, so it is part of the contract, not a detail.
describe.each([
  ['activerecord', activerecord, 'Hekireki-ActiveRecord'],
  ['ajv', ajv, 'Hekireki-AJV'],
  ['arktype', arktype, 'Hekireki-ArkType'],
  ['atlas', atlas, 'Hekireki-Atlas'],
  ['django', django, 'Hekireki-Django'],
  ['drizzle', drizzle, 'Hekireki-Drizzle'],
  ['ecto', ecto, 'Hekireki-Ecto'],
  ['effect', effect, 'Hekireki-Effect'],
  ['eloquent', eloquent, 'Hekireki-Eloquent'],
  ['gorm', gorm, 'Hekireki-GORM'],
  ['kysely', kysely, 'Hekireki-Kysely'],
  ['pydantic', pydantic, 'Hekireki-Pydantic'],
  ['sea-orm', seaOrm, 'Hekireki-SeaORM'],
  ['sqlalchemy', sqlalchemy, 'Hekireki-SQLAlchemy'],
  ['typebox', typebox, 'Hekireki-TypeBox'],
  ['valibot', valibot, 'Hekireki-Valibot'],
  ['zod', zod, 'Hekireki-Zod'],
])('%s', (_name, generator, prettyName) => {
  it('says which generator is missing its output', async () => {
    expect(failure(await run(generator, null))).toContain(
      `output is required for ${prettyName}. Please specify output in your generator config.`,
    )
  })

  it('treats an output that is set but empty as no output at all', async () => {
    expect(failure(await run(generator, ''))).toContain(`output is required for ${prettyName}`)
  })
})

// A directory output means "put the file where this target conventionally puts it". Getting the
// name wrong publishes a file nobody imports, which no type check would catch.
describe.each([
  ['ajv', ajv, 'index.ts'],
  ['arktype', arktype, 'index.ts'],
  ['atlas', atlas, 'schema.hcl'],
  ['django', django, 'models.py'],
  ['drizzle', drizzle, 'schema.ts'],
  ['effect', effect, 'index.ts'],
  ['gorm', gorm, 'models.go'],
  ['kysely', kysely, 'types.ts'],
  ['pydantic', pydantic, 'models.py'],
  ['sqlalchemy', sqlalchemy, 'models.py'],
  ['typebox', typebox, 'index.ts'],
  ['valibot', valibot, 'index.ts'],
  ['zod', zod, 'index.ts'],
])('%s', (_name, generator, defaultFile) => {
  it(`writes ${defaultFile} when the output names a directory`, async () => {
    const dir = tmp()
    expect(Exit.isSuccess(await run(generator, dir))).toBe(true)
    expect(readdirSync(dir)).toStrictEqual([defaultFile])
    expect(readFileSync(path.join(dir, defaultFile), 'utf8').length).toBeGreaterThan(0)
  })

  it('writes the file itself when the output already names one', async () => {
    const dir = tmp()
    const file = path.join(dir, `chosen${path.extname(defaultFile)}`)
    expect(Exit.isSuccess(await run(generator, file))).toBe(true)
    expect(readdirSync(dir)).toStrictEqual([path.basename(file)])
  })
})

// The other four write one file per model, so their output is always a directory.
describe.each([
  ['activerecord', activerecord, ['post.rb', 'user.rb']],
  ['ecto', ecto, ['post.ex', 'user.ex']],
  ['eloquent', eloquent, ['Post.php', 'Role.php', 'User.php']],
  ['sea-orm', seaOrm, ['mod.rs', 'post.rs', 'prelude.rs', 'role.rs', 'user.rs']],
])('%s', (_name, generator, files) => {
  it('writes one file per model into the output directory', async () => {
    const dir = tmp()
    expect(Exit.isSuccess(await run(generator, dir))).toBe(true)
    expect(new Set(readdirSync(dir))).toStrictEqual(new Set(files))
  })
})

describe('generator config', () => {
  it('defaults the Ecto app module to MyApp and reads the one that is configured', async () => {
    const fallback = tmp()
    const configured = tmp()
    expect(Exit.isSuccess(await run(ecto, fallback))).toBe(true)
    expect(Exit.isSuccess(await run(ecto, configured, { app: 'Shop' }))).toBe(true)
    expect(readFileSync(path.join(fallback, 'user.ex'), 'utf8')).toContain('defmodule MyApp.User')
    expect(readFileSync(path.join(configured, 'user.ex'), 'utf8')).toContain('defmodule Shop.User')
  })

  it('defaults the Eloquent namespace to App\\Models and reads the one that is configured', async () => {
    const fallback = tmp()
    const configured = tmp()
    expect(Exit.isSuccess(await run(eloquent, fallback))).toBe(true)
    expect(Exit.isSuccess(await run(eloquent, configured, { namespace: 'Shop\\Models' }))).toBe(
      true,
    )
    expect(readFileSync(path.join(fallback, 'User.php'), 'utf8')).toContain(
      'namespace App\\Models;',
    )
    expect(readFileSync(path.join(configured, 'User.php'), 'utf8')).toContain(
      'namespace Shop\\Models;',
    )
  })

  it('defaults the GORM package to model and reads the one that is configured', async () => {
    const fallback = tmp()
    const configured = tmp()
    expect(Exit.isSuccess(await run(gorm, fallback))).toBe(true)
    expect(Exit.isSuccess(await run(gorm, configured, { package: 'entity' }))).toBe(true)
    expect(readFileSync(path.join(fallback, 'models.go'), 'utf8')).toContain('package model')
    expect(readFileSync(path.join(configured, 'models.go'), 'utf8')).toContain('package entity')
  })

  it('passes the SeaORM renameAll through to the serde attribute', async () => {
    const plain = tmp()
    const renamed = tmp()
    expect(Exit.isSuccess(await run(seaOrm, plain))).toBe(true)
    expect(Exit.isSuccess(await run(seaOrm, renamed, { renameAll: 'camelCase' }))).toBe(true)
    expect(readFileSync(path.join(plain, 'user.rs'), 'utf8')).not.toContain('serde(rename_all')
    expect(readFileSync(path.join(renamed, 'user.rs'), 'utf8')).toContain(
      '#[serde(rename_all = "camelCase")]',
    )
  })

  it('adds the relation schemas to the zod output only when relation is on', async () => {
    const plain = tmp()
    const related = tmp()
    expect(Exit.isSuccess(await run(zod, plain, { type: 'true' }))).toBe(true)
    expect(Exit.isSuccess(await run(zod, related, { type: 'true', relation: 'true' }))).toBe(true)
    expect(readFileSync(path.join(plain, 'index.ts'), 'utf8')).toContain('export const UserSchema')
    expect(readFileSync(path.join(related, 'index.ts'), 'utf8')).toContain(
      'export const UserRelationsSchema',
    )
  })

  it('names the schema in the Atlas output when schemaName is configured', async () => {
    const dir = tmp()
    expect(Exit.isSuccess(await run(atlas, dir, { schemaName: 'shop' }))).toBe(true)
    expect(readFileSync(path.join(dir, 'schema.hcl'), 'utf8')).toContain('schema "shop"')
  })
})

describe('datasource provider', () => {
  it.each(['postgresql', 'cockroachdb', 'mysql', 'sqlite'])(
    'accepts %s for Atlas',
    async (provider) => {
      expect(Exit.isSuccess(await run(atlas, tmp(), {}, provider))).toBe(true)
    },
  )

  it('names the unsupported provider it was given, and the ones it takes', async () => {
    const message = failure(await run(atlas, tmp(), {}, 'mongodb'))
    expect(message).toContain('Unsupported provider for Hekireki-Atlas: mongodb')
    expect(message).toContain('postgresql, cockroachdb, mysql, and sqlite')
  })

  // The bug this test was written for: an unsupported provider used to be *returned* out of the
  // Effect.gen block as a success value, so `prisma generate` reported the target as done and
  // wrote no schema at all.
  it('fails on a provider Drizzle has no dialect for, rather than reporting success', async () => {
    const exit = await run(drizzle, tmp(), {}, 'mongodb')
    expect(Exit.isSuccess(exit)).toBe(false)
    expect(failure(exit)).toContain('Unsupported provider for Hekireki-Drizzle: mongodb')
  })

  it('writes nothing when the provider is refused', async () => {
    const dir = tmp()
    await run(drizzle, dir, {}, 'mongodb')
    expect(readdirSync(dir)).toStrictEqual([])
  })
})
