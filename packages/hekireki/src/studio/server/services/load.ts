import path from 'node:path'

import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { get_config } from '@prisma/prisma-schema-wasm'
import { Effect } from 'effect'
import * as z from 'zod'

import { isDirectory, readDirectory, readFile } from '../../../file/index.js'
import * as DocsDomain from '../domain/docs.js'
import * as SchemaDomain from '../domain/schema.js'
import { SchemaLoadError, SchemaParseError } from '../errors/index.js'
import * as LanguageService from './language.js'

const SchemaFileInput = z
  .object({
    path: z
      .string()
      .meta({ description: 'The file path as Studio loaded it.', example: 'prisma/schema.prisma' }),
    content: z
      .string()
      .meta({ description: 'The whole file content.', example: 'model User {\n  id Int @id\n}\n' }),
  })
  .readonly()
  .meta({ description: 'One schema file on disk' })

function relativePath(file: string) {
  const relative = path.relative(process.cwd(), file)
  return relative === '' || relative.startsWith('..') ? file : relative
}

const ReadSchemaFilesInput = z
  .object({
    schemaPath: z
      .string()
      .meta({ description: 'The file or directory path.', example: 'prisma/schema.prisma' }),
  })
  .readonly()
  .meta({
    description: 'A schema.prisma file or a directory of .prisma files',
    example: { schemaPath: 'prisma/schema.prisma' },
  })

/** Reads the schema file, or every `.prisma` file of the directory in name order. */
export function readSchemaFiles(input: z.infer<typeof ReadSchemaFilesInput>) {
  return Effect.gen(function* () {
    const { schemaPath } = input
    const directory = yield* isDirectory(schemaPath).pipe(
      Effect.mapError(
        () =>
          new SchemaLoadError({
            message: `Schema not found: ${schemaPath}\n   Pass --schema <path> pointing at your schema.prisma or a directory of .prisma files.`,
          }),
      ),
    )
    const names = directory
      ? yield* readDirectory(schemaPath).pipe(
          Effect.mapError((error) => new SchemaLoadError({ message: error.message })),
        )
      : null
    const paths = names
      ? names
          .filter((name) => name.endsWith('.prisma'))
          .toSorted()
          .map((name) => path.join(schemaPath, name))
      : [schemaPath]
    if (paths.length === 0) {
      return yield* new SchemaLoadError({
        message: `No .prisma files found in ${schemaPath}\n   Add a schema.prisma file or pass --schema <path>.`,
      })
    }
    return yield* Effect.forEach(paths, (file) =>
      readFile(file).pipe(
        Effect.map((content) => ({ path: relativePath(file), content })),
        Effect.mapError((error) => new SchemaLoadError({ message: error.message })),
      ),
    )
  })
}

const ESCAPE = String.fromCodePoint(27)

function stripAnsi(text: string) {
  return text
    .split(ESCAPE)
    .map((segment, index) => (index === 0 ? segment : segment.replace(/^\[[0-9;]*m/u, '')))
    .join('')
}

// get-dmmf wraps the engine error as JSON `{ message }` in Error.message; older engines send plain text.
const PrismaErrorBody = z
  .object({
    message: z.string().meta({ description: 'The engine message.', example: 'error: ...' }),
  })
  .meta({ description: 'The JSON body get-dmmf puts in Error.message' })

function prismaErrorMessage(error: Error) {
  try {
    const result = PrismaErrorBody.safeParse(JSON.parse(error.message))
    return stripAnsi(result.success ? result.data.message : error.message).trim()
  } catch {
    return stripAnsi(error.message).trim()
  }
}

const ParseSchemaFilesInput = z
  .object({
    files: z.array(SchemaFileInput).readonly().meta({ description: 'The loaded schema files.' }),
  })
  .readonly()
  .meta({ description: 'The schema files to parse together' })

// What prisma-schema-wasm's get_config hands back; the datasources are all Studio reads.
const PrismaConfig = z
  .object({
    config: z
      .object({
        datasources: z
          .array(
            z.object({
              provider: z
                .string()
                .meta({ description: 'The declared provider.', example: 'postgresql' }),
            }),
          )
          .meta({ description: 'The datasource blocks in declaration order.' }),
      })
      .meta({ description: 'The parsed configuration blocks.' }),
  })
  .meta({ description: 'The get_config result of prisma-schema-wasm' })

/** The provider of the first `datasource` block as Prisma parses it, or null without one. */
function readProvider(input: z.infer<typeof ParseSchemaFilesInput>) {
  return Effect.sync(() => {
    try {
      const result = PrismaConfig.safeParse(
        JSON.parse(
          get_config(
            JSON.stringify({
              prismaSchema: input.files.map((f) => [f.path, f.content]),
              ignoreEnvVarErrors: true,
              env: {},
            }),
          ),
        ),
      )
      return result.success ? (result.data.config.datasources[0]?.provider ?? null) : null
    } catch {
      return null
    }
  })
}

/**
 * Parses the files with the Prisma engine and maps the DMMF to the studio contract. The
 * language server supplies what the DMMF lacks: where each block is and the diagnostics.
 */
export function parseSchemaFiles(input: z.infer<typeof ParseSchemaFilesInput>) {
  return Effect.gen(function* () {
    const { files } = input
    const diagnostics = yield* LanguageService.diagnoseFiles({ files })
    const result: DMMF.Document | GetDMMFError = getDMMF({
      datamodel: files.map((f): [string, string] => [f.path, f.content]),
    })
    if ('type' in result) {
      return yield* new SchemaParseError({ message: prismaErrorMessage(result.error), diagnostics })
    }
    const provider = yield* readProvider({ files })
    const blocks = yield* LanguageService.blockLocations({ files })
    return {
      dmmf: result,
      schema: SchemaDomain.makeSchema({ dmmf: result, files, provider, blocks }),
      docs: DocsDomain.makeDocs({ dmmf: result }),
      diagnostics,
    }
  })
}
