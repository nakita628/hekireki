import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { DMMF, GeneratorOptions } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { get_config } from '@prisma/prisma-schema-wasm'
import type { FileSystem } from 'effect'
import { Effect } from 'effect'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import * as z from 'zod'

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
import { er } from './er.js'
import { gorm } from './gorm.js'
import { kysely } from './kysely.js'
import { pydantic } from './pydantic.js'
import { seaOrm } from './sea-orm.js'
import { sqlalchemy } from './sqlalchemy.js'
import { typebox } from './typebox.js'
import { valibot } from './valibot.js'
import { zod } from './zod.js'

/**
 * The example schema is generated with every generator at once and its output is committed under
 * `example/generated/`. This runs the same generators in-process and compares byte for byte, so a
 * change to any generator that alters what a user gets is a visible diff, not a surprise.
 *
 * After an intentional change, refresh the golden files with `pnpm example` from the repository
 * root and commit the result.
 */
const EXAMPLE_DIR = path.resolve(import.meta.dirname, '../../../../example')
const SCHEMA_PATH = path.join(EXAMPLE_DIR, 'schema.prisma')

const HANDLERS: Record<
  string,
  (options: GeneratorOptions) => Effect.Effect<unknown, unknown, FileSystem.FileSystem>
> = {
  'hekireki-activerecord': activerecord,
  'hekireki-ajv': ajv,
  'hekireki-arktype': arktype,
  'hekireki-atlas': atlas,
  'hekireki-django': django,
  'hekireki-drizzle': drizzle,
  'hekireki-ecto': ecto,
  'hekireki-effect': effect,
  'hekireki-eloquent': eloquent,
  'hekireki-er': er,
  'hekireki-gorm': gorm,
  'hekireki-kysely': kysely,
  'hekireki-pydantic': pydantic,
  'hekireki-sea-orm': seaOrm,
  'hekireki-sqlalchemy': sqlalchemy,
  'hekireki-typebox': typebox,
  'hekireki-valibot': valibot,
  'hekireki-zod': zod,
}

const ConfigValue = z
  .union([z.string(), z.array(z.string())])
  .meta({ description: 'One generator option as written: a string or a list.', example: 'true' })

const GeneratorBlock = z
  .object({
    name: z.string().meta({ description: 'The block name.', example: 'Hekireki-Zod' }),
    provider: z
      .object({
        value: z.string().meta({ description: 'The provider.', example: 'hekireki-zod' }),
      })
      .meta({ description: 'The provider setting.', example: { value: 'hekireki-zod' } }),
    output: z
      .object({
        value: z.string().meta({ description: 'The output as written.', example: 'generated' }),
      })
      .nullable()
      .meta({ description: 'The output setting, if any.', example: { value: 'generated' } }),
    config: z
      .record(z.string(), ConfigValue)
      .meta({ description: 'The remaining options.', example: { type: 'true' } }),
  })
  .meta({
    description: 'A generator block as get_config reads it',
    example: {
      name: 'Hekireki-Zod',
      provider: { value: 'hekireki-zod' },
      output: { value: 'generated' },
      config: {},
    },
  })

const Datasource = z
  .object({
    activeProvider: z
      .string()
      .meta({ description: 'The datasource provider.', example: 'postgresql' }),
  })
  .meta({ description: 'A datasource block', example: { activeProvider: 'postgresql' } })

// What prisma-schema-wasm's get_config hands back for the blocks the test reads.
const PrismaConfig = z
  .object({
    config: z
      .object({
        generators: z
          .array(GeneratorBlock)
          .meta({ description: 'The generator blocks in declaration order.', example: [] }),
        datasources: z
          .array(Datasource)
          .meta({ description: 'The datasource blocks in declaration order.', example: [] }),
      })
      .meta({
        description: 'The parsed configuration blocks.',
        example: { generators: [], datasources: [] },
      }),
  })
  .meta({
    description: 'The get_config result of prisma-schema-wasm',
    example: { config: { generators: [], datasources: [] } },
  })

const schemaText = readFileSync(SCHEMA_PATH, 'utf8')

const parsed = PrismaConfig.parse(
  JSON.parse(
    get_config(
      JSON.stringify({
        prismaSchema: [[SCHEMA_PATH, schemaText]],
        ignoreEnvVarErrors: true,
        env: {},
      }),
    ),
  ),
)

const dmmfResult: DMMF.Document | GetDMMFError = getDMMF({ datamodel: [[SCHEMA_PATH, schemaText]] })
if ('type' in dmmfResult) throw new Error(dmmfResult.error.message)
const dmmf = dmmfResult

const outDir = mkdtempSync(path.join(tmpdir(), 'hekireki-example-'))

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true })
})

/** Every file under a directory, as paths relative to it, sorted. */
function listFiles(dir: string, prefix = ''): readonly string[] {
  return (
    readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? listFiles(path.join(dir, entry.name), path.join(prefix, entry.name))
          : [path.join(prefix, entry.name)],
      )
      // oxlint-disable-next-line unicorn/no-array-sort -- the flatMap result is a fresh array; readdir order is not stable
      .sort()
  )
}

/**
 * The options Prisma would hand the generator for one block, as if the schema lived in `outDir`:
 * `output` and the paths `outputs` lists both resolve against the schema's directory.
 */
function optionsFor(generator: (typeof parsed.config.generators)[number]): GeneratorOptions {
  const output = generator.output?.value
  return {
    generator: {
      name: generator.name,
      provider: { fromEnvVar: null, value: generator.provider.value },
      output: { fromEnvVar: null, value: path.join(outDir, output ?? '') },
      isCustomOutput: output !== undefined,
      config: generator.config,
      binaryTargets: [],
      previewFeatures: [],
      sourceFilePath: path.join(outDir, path.basename(SCHEMA_PATH)),
    },
    datasources: parsed.config.datasources.map((datasource) => ({
      name: 'db',
      provider: datasource.activeProvider,
      activeProvider: datasource.activeProvider,
      url: { fromEnvVar: null, value: null },
      schemas: [],
      sourceFilePath: SCHEMA_PATH,
    })),
    dmmf,
    schemaPath: SCHEMA_PATH,
    datamodel: schemaText,
    version: 'test',
    otherGenerators: [],
  } as unknown as GeneratorOptions
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('example/schema.prisma', () => {
  it('declares every generator the package ships, once each', () => {
    const providers = parsed.config.generators.map((generator) => generator.provider.value)
    expect(new Set(providers)).toStrictEqual(new Set(Object.keys(HANDLERS)))
    expect(providers).toHaveLength(Object.keys(HANDLERS).length)
  })

  describe.each(parsed.config.generators.map((generator) => [generator.name, generator] as const))(
    '%s',
    (_name, generator) => {
      const handler = HANDLERS[generator.provider.value]
      // A block without `output` names its files in `outputs`, all in one directory.
      const output = generator.output?.value ?? [generator.config.outputs ?? ''].flat()[0] ?? ''
      // `generated/drizzle/schema.ts` names a file; the golden directory is the one that holds it.
      const goldenDir = path.join(
        EXAMPLE_DIR,
        path.extname(output) === '' ? output : path.dirname(output),
      )
      const actualDir = path.join(outDir, path.relative(EXAMPLE_DIR, goldenDir))

      it('reproduces the committed output under example/generated', async () => {
        if (handler === undefined) throw new Error(`no handler for ${generator.provider.value}`)
        await Effect.runPromise(Effect.provide(handler(optionsFor(generator)), fileSystemLayer))

        const expected = listFiles(goldenDir)
        expect(expected.length).toBeGreaterThan(0)
        expect(listFiles(actualDir)).toStrictEqual(expected)

        for (const file of expected) {
          const actual = path.join(actualDir, file)
          // A raster depends on the fonts of the machine that drew it, so the PNG is checked for shape only.
          if (file.endsWith('.png')) {
            const bytes = readFileSync(actual)
            expect(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true)
            expect(statSync(actual).size).toBeGreaterThan(1024)
            continue
          }
          // The whole text is compared so a mismatch prints a unified diff, named by its file.
          expect({ file, content: readFileSync(actual, 'utf8') }).toStrictEqual({
            file,
            content: readFileSync(path.join(goldenDir, file), 'utf8'),
          })
        }
      })
    },
  )
})
