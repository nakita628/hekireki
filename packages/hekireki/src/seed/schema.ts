import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { get_config } from '@prisma/prisma-schema-wasm'
import { Effect } from 'effect'

import type { Dialect } from '../database/url.js'
import { isDirectory, readDirectory, readFile } from '../file/index.js'
import { SeedConfigError } from './errors.js'

/** One Prisma schema file, as read. */
export type SchemaFile = { readonly path: string; readonly content: string }

/** The `provider` and `output` of one generator block, as `get_config` writes them. */
export type GeneratorBlock = {
  readonly provider: { readonly value: string }
  readonly output: { readonly value: string } | null
}

/** The schema file, or every `.prisma` file of the directory, in name order. */
export function readSchemaFiles(schemaPath: string) {
  return Effect.gen(function* () {
    const directory = yield* isDirectory(schemaPath).pipe(
      Effect.mapError(
        () =>
          new SeedConfigError({
            message: `Schema not found: ${schemaPath}\n   Pass --schema <path> pointing at your schema.prisma or a directory of .prisma files.`,
          }),
      ),
    )
    const names = directory
      ? yield* readDirectory(schemaPath).pipe(
          Effect.mapError((error) => new SeedConfigError({ message: error.message })),
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
      return yield* new SeedConfigError({
        message: `No .prisma files found in ${schemaPath}\n   Add a schema.prisma file or pass --schema <path>.`,
      })
    }
    return yield* Effect.forEach(paths, (file) =>
      readFile(file).pipe(
        Effect.map((content): SchemaFile => ({ path: file, content })),
        Effect.mapError((error) => new SeedConfigError({ message: error.message })),
      ),
    )
  })
}

/** The schema as one text, for the `url` a datasource block may still carry. */
export function schemaText(files: readonly SchemaFile[]) {
  return files.map((file) => file.content).join('\n')
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function isGeneratorBlock(value: unknown): value is GeneratorBlock {
  return (
    isRecord(value) &&
    isRecord(value.provider) &&
    typeof value.provider.value === 'string' &&
    (value.output === null ||
      value.output === undefined ||
      (isRecord(value.output) && typeof value.output.value === 'string'))
  )
}

/** The generator blocks and the first datasource's provider of a parsed `get_config` result. */
function readConfig(files: readonly SchemaFile[]) {
  try {
    const parsed: unknown = JSON.parse(
      get_config(
        JSON.stringify({
          prismaSchema: files.map((f) => [f.path, f.content]),
          ignoreEnvVarErrors: true,
          env: {},
        }),
      ),
    )
    const config = isRecord(parsed) ? parsed.config : null
    const generators = isRecord(config) ? config.generators : null
    const datasources = isRecord(config) ? config.datasources : null
    const first: unknown = Array.isArray(datasources) ? datasources[0] : null
    return {
      generators: Array.isArray(generators) ? generators.filter(isGeneratorBlock) : [],
      provider: isRecord(first) && typeof first.provider === 'string' ? first.provider : null,
    }
  } catch {
    return { generators: [], provider: null }
  }
}

/** Prisma reports its validation errors as JSON with colour codes inside; this is the plain text. */
function prismaMessage(raw: string) {
  try {
    const parsed: unknown = JSON.parse(raw)
    const message = isRecord(parsed) && typeof parsed.message === 'string' ? parsed.message : raw
    return stripVTControlCharacters(message)
  } catch {
    return stripVTControlCharacters(raw)
  }
}

/** The schema parsed by Prisma: its datamodel, the datasource provider and the generator blocks. */
export function parseSchema(files: readonly SchemaFile[]) {
  return Effect.gen(function* () {
    const result: DMMF.Document | GetDMMFError = getDMMF({
      datamodel: files.map((f): [string, string] => [f.path, f.content]),
    })
    if ('type' in result) {
      return yield* new SeedConfigError({ message: prismaMessage(result.error.message) })
    }
    return { datamodel: result.datamodel, ...readConfig(files) }
  })
}

const DIALECTS: Readonly<Record<string, Dialect>> = {
  postgresql: 'postgresql',
  postgres: 'postgresql',
  cockroachdb: 'postgresql',
  mysql: 'mysql',
  sqlite: 'sqlite',
}

/** The SQL dialect of a datasource provider; null for the databases the seeder cannot write. */
export function dialectOf(provider: string | null) {
  return provider === null ? null : (DIALECTS[provider] ?? null)
}
