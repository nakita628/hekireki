import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { get_config } from '@prisma/prisma-schema-wasm'
import { Effect } from 'effect'
import * as z from 'zod'

import type { Dialect } from '../database/url.js'
import { isDirectory, readDirectory, readFile } from '../file/index.js'
import { SchemaFileError, SchemaInvalidError } from './errors.js'

// A Prisma schema as hekireki seed, hekireki migrate and Studio read it: the files, what Prisma
// parses them into, and the datasource and generator blocks.

/** One Prisma schema file, as read. */
export type SchemaFile = { readonly path: string; readonly content: string }

/**
 * The schema file, or every `.prisma` file of the directory and the directories below it, in
 * name order: what Prisma reads for a schema directory.
 */
export function readSchemaFiles(schemaPath: string) {
  return Effect.gen(function* () {
    const directory = yield* isDirectory(schemaPath).pipe(
      Effect.mapError(
        () =>
          new SchemaFileError({
            message: `Schema not found: ${schemaPath}\n   Pass --schema <path> pointing at your schema.prisma or a directory of .prisma files.`,
          }),
      ),
    )
    const names = directory
      ? yield* readDirectory(schemaPath, { recursive: true }).pipe(
          Effect.mapError((error) => new SchemaFileError({ message: error.message })),
        )
      : null
    const paths =
      names === null
        ? [schemaPath]
        : names
            .filter((name) => name.endsWith('.prisma'))
            .toSorted()
            .map((name) => path.join(schemaPath, name))
    if (paths.length === 0) {
      return yield* new SchemaFileError({
        message: `No .prisma files found in ${schemaPath}\n   Add a schema.prisma file or pass --schema <path>.`,
      })
    }
    return yield* Effect.forEach(paths, (file) =>
      readFile(file).pipe(
        Effect.map((content): SchemaFile => ({ path: file, content })),
        Effect.mapError((error) => new SchemaFileError({ message: error.message })),
      ),
    )
  })
}

/** The schema as one text, for the `url` a datasource block may still carry. */
export function schemaText(files: readonly SchemaFile[]) {
  return files.map((file) => file.content).join('\n')
}

export const GeneratorBlock = z
  .object({
    provider: z
      .object({
        value: z.string().meta({ description: 'The provider.', example: 'prisma-client' }),
      })
      .meta({ description: 'The `provider` of the block.', example: { value: 'prisma-client' } }),
    output: z
      .object({
        value: z.string().meta({ description: 'The output path.', example: '../generated' }),
      })
      .nullable()
      .default(null)
      .meta({ description: 'The `output` of the block, or null without one.', example: null }),
  })
  .meta({
    description: 'The `provider` and `output` of one generator block, as `get_config` writes them',
    example: { provider: { value: 'prisma-client' }, output: null },
  })

// What prisma-schema-wasm's get_config hands back: the blocks are kept as they come, each read on
// its own, so one this does not know does not take the others with it.
const PrismaConfig = z
  .object({
    config: z
      .object({
        generators: z.array(z.unknown()).meta({
          description: 'The generator blocks in declaration order.',
          example: [{ provider: { value: 'prisma-client' }, output: null }],
        }),
        datasources: z.array(z.unknown()).meta({
          description: 'The datasource blocks in declaration order.',
          example: [{ provider: 'postgresql' }],
        }),
      })
      .meta({
        description: 'The parsed configuration blocks.',
        example: { generators: [], datasources: [{ provider: 'postgresql' }] },
      }),
  })
  .meta({
    description: 'The get_config result of prisma-schema-wasm',
    example: { config: { generators: [], datasources: [{ provider: 'postgresql' }] } },
  })

const Datasource = z
  .object({
    provider: z.string().meta({ description: 'The declared provider.', example: 'postgresql' }),
  })
  .meta({ description: 'One datasource block', example: { provider: 'postgresql' } })

/** The generator blocks and the first datasource's provider; none of either when Prisma cannot say. */
function readConfig(files: readonly SchemaFile[]) {
  return Effect.try((): unknown =>
    JSON.parse(
      get_config(
        JSON.stringify({
          prismaSchema: files.map((f) => [f.path, f.content]),
          ignoreEnvVarErrors: true,
          env: {},
        }),
      ),
    ),
  ).pipe(
    Effect.orElseSucceed(() => null),
    Effect.map((json) => {
      const result = PrismaConfig.safeParse(json)
      if (!result.success) return { generators: [], provider: null }
      const { generators, datasources } = result.data.config
      const datasource = Datasource.safeParse(datasources[0])
      return {
        generators: generators.flatMap((block) => {
          const read = GeneratorBlock.safeParse(block)
          return read.success ? [read.data] : []
        }),
        provider: datasource.success ? datasource.data.provider : null,
      }
    }),
  )
}

// get-dmmf puts the engine's error in Error.message as JSON `{ message }`, coloured for a
// terminal; an older engine sends the text as it is.
const PrismaErrorBody = z
  .object({
    message: z.string().meta({ description: 'The engine message.', example: 'error: ...' }),
  })
  .meta({
    description: 'The JSON body get-dmmf puts in Error.message',
    example: { message: 'error: ...' },
  })

/** Prisma's message for a schema it rejects, as plain text. */
export function prismaErrorMessage(raw: string) {
  return Effect.try((): unknown => JSON.parse(raw)).pipe(
    Effect.orElseSucceed(() => null),
    Effect.map((json) => {
      const result = PrismaErrorBody.safeParse(json)
      return stripVTControlCharacters(result.success ? result.data.message : raw).trim()
    }),
  )
}

/** The schema parsed by Prisma: its DMMF, the datasource provider and the generator blocks. */
export function parseSchema(files: readonly SchemaFile[]) {
  return Effect.gen(function* () {
    const result: DMMF.Document | GetDMMFError = getDMMF({
      datamodel: files.map((f): [string, string] => [f.path, f.content]),
    })
    if ('type' in result) {
      return yield* new SchemaInvalidError({
        message: yield* prismaErrorMessage(result.error.message),
      })
    }
    return { dmmf: result, ...(yield* readConfig(files)) }
  })
}

const DIALECTS: Readonly<Record<string, Dialect>> = {
  postgresql: 'postgresql',
  postgres: 'postgresql',
  cockroachdb: 'postgresql',
  mysql: 'mysql',
  sqlite: 'sqlite',
}

/** The SQL dialect of a datasource provider; null for a database hekireki does not write SQL for. */
export function dialectOf(provider: string | null) {
  return provider === null ? null : (DIALECTS[provider] ?? null)
}
