import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { registerGenerator } from './index.js'

type Handler = {
  readonly onManifest: () => { readonly defaultOutput: string; readonly prettyName: string }
  readonly onGenerate: (options: GeneratorOptions) => Promise<unknown>
}

// `registerGenerator` hands its handler straight to prisma's own runner, which would then read
// stdin. The spy is what lets the handler be inspected instead of started.
const { generatorHandler } = vi.hoisted(() => ({
  generatorHandler: vi.fn<(handler: Handler) => void>(),
}))

vi.mock('@prisma/generator-helper', () => ({ default: { generatorHandler } }))

const here = import.meta.dirname
const packageRoot = path.resolve(here, '..', '..')

// One shim per provider, each a four-line file. The copy-paste that creates them is what makes a
// wrong name plausible, and a wrong name stays invisible until someone runs that generator.
const SHIMS = [
  'activerecord',
  'ajv',
  'arktype',
  'atlas',
  'django',
  'drizzle',
  'ecto',
  'effect',
  'eloquent',
  'er',
  'gorm',
  'kysely',
  'pydantic',
  'sea-orm',
  'sqlalchemy',
  'typebox',
  'valibot',
  'zod',
] as const

/** The handler object the last `registerGenerator` call handed to prisma. */
function registered() {
  const handler = generatorHandler.mock.calls.at(-1)?.[0]
  if (handler === undefined) throw new Error('generatorHandler was never called')
  return handler
}

beforeEach(() => {
  generatorHandler.mockClear()
})

describe('registerGenerator', () => {
  it.each([
    ['activerecord', 'Hekireki-ActiveRecord'],
    ['ajv', 'Hekireki-AJV'],
    ['arktype', 'Hekireki-ArkType'],
    ['atlas', 'Hekireki-Atlas'],
    ['django', 'Hekireki-Django'],
    ['drizzle', 'Hekireki-Drizzle'],
    ['ecto', 'Hekireki-Ecto'],
    ['effect', 'Hekireki-Effect'],
    ['eloquent', 'Hekireki-Eloquent'],
    ['er', 'Hekireki-ER'],
    ['gorm', 'Hekireki-GORM'],
    ['kysely', 'Hekireki-Kysely'],
    ['pydantic', 'Hekireki-Pydantic'],
    ['sea-orm', 'Hekireki-SeaORM'],
    ['sqlalchemy', 'Hekireki-SQLAlchemy'],
    ['typebox', 'Hekireki-TypeBox'],
    ['valibot', 'Hekireki-Valibot'],
    ['zod', 'Hekireki-Zod'],
  ] as const)('announces %s to prisma as its pretty name', (name, prettyName) => {
    registerGenerator(name)
    expect(generatorHandler).toHaveBeenCalledTimes(1)
    expect(registered().onManifest()).toStrictEqual({ defaultOutput: '.', prettyName })
  })

  // Effect failures carry a tagged error object; prisma prints whatever `onGenerate` rejects
  // with, so it has to be an Error carrying the generator's own message.
  it('rejects with a real Error carrying the generator message', async () => {
    registerGenerator('zod')
    const options = {
      generator: { isCustomOutput: false, output: null, config: {} },
      datasources: [],
      dmmf: { datamodel: { models: [], enums: [], types: [], indexes: [] } },
    } as unknown as GeneratorOptions
    await expect(registered().onGenerate(options)).rejects.toThrow(
      'output is required for Hekireki-Zod',
    )
  })
})

describe('bin entries', () => {
  it('has one shim file per registered generator', () => {
    const files = readdirSync(here)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .map((file) => path.basename(file, '.ts'))
      .filter((name) => name !== 'index' && name !== 'hekireki')
    expect(new Set(files)).toStrictEqual(new Set(SHIMS))
  })

  it.each(SHIMS)('%s registers the generator its file name promises', (name) => {
    const source = readFileSync(path.join(here, `${name}.ts`), 'utf8')
    expect(source.startsWith('#!/usr/bin/env node\n')).toBe(true)
    expect(source).toContain(`registerGenerator('${name}')`)
  })

  it('publishes every shim as a hekireki-* binary', () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      readonly bin: Record<string, string>
    }
    expect(new Set(Object.keys(manifest.bin))).toStrictEqual(
      new Set(['hekireki', ...SHIMS.map((name) => `hekireki-${name}`)]),
    )
    for (const name of SHIMS) {
      expect(manifest.bin[`hekireki-${name}`]).toBe(`dist/bin/${name}.js`)
    }
  })

  it('builds every shim into dist', () => {
    const config = readFileSync(path.join(packageRoot, 'vite.config.ts'), 'utf8')
    for (const name of SHIMS) {
      expect(config).toContain(`'bin/${name}': './src/bin/${name}.ts'`)
    }
  })
})
