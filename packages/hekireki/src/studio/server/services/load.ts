import path from 'node:path'

import type { DMMF } from '@prisma/generator-helper'
import { Effect } from 'effect'
import * as z from 'zod'

import { parseSchema, readSchemaFiles as readSchemaFilesFrom } from '../../../schema/index.js'
import * as DocsDomain from '../domain/index.js'
import * as SchemaDomain from '../domain/index.js'
import { SchemaLoadError, SchemaParseError } from '../errors/index.js'
import * as LanguageService from './language.js'

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

/**
 * Reads the schema file, or every `.prisma` file of the directory and those below it, each path
 * as Studio reports it: relative to the working directory when the file lives under it, absolute
 * otherwise.
 */
export function readSchemaFiles(input: z.infer<typeof ReadSchemaFilesInput>) {
  return readSchemaFilesFrom(input.schemaPath).pipe(
    Effect.map((files) =>
      files.map((file) => {
        const relative = path.relative(process.cwd(), file.path)
        return {
          path: relative === '' || relative.startsWith('..') ? file.path : relative,
          content: file.content,
        }
      }),
    ),
    Effect.mapError((error) => new SchemaLoadError({ message: error.message })),
  )
}

const ParseSchemaFilesInput = z
  .object({
    files: z
      .array(
        z
          .object({
            path: z.string().meta({
              description: 'The file path as Studio loaded it.',
              example: 'prisma/schema.prisma',
            }),
            content: z.string().meta({
              description: 'The whole file content.',
              example: 'model User {\n  id Int @id\n}\n',
            }),
          })
          .readonly(),
      )
      .readonly()
      .meta({ description: 'The loaded schema files.' }),
  })
  .readonly()
  .meta({ description: 'The schema files to parse together' })

/**
 * Parses the files with the Prisma engine and maps the DMMF to the studio contract. The
 * language server supplies what the DMMF lacks: where each block is and the diagnostics.
 */
export function parseSchemaFiles(input: z.infer<typeof ParseSchemaFilesInput>) {
  return Effect.gen(function* () {
    const { files } = input
    const diagnostics = yield* LanguageService.diagnoseFiles({ files })
    const parsed: { readonly dmmf: DMMF.Document; readonly provider: string | null } =
      yield* parseSchema(files).pipe(
        Effect.mapError((error) => new SchemaParseError({ message: error.message, diagnostics })),
      )
    const blocks = yield* LanguageService.blockLocations({ files })
    return {
      dmmf: parsed.dmmf,
      schema: SchemaDomain.makeSchema({
        dmmf: parsed.dmmf,
        files,
        provider: parsed.provider,
        blocks,
      }),
      docs: DocsDomain.makeDocs({ dmmf: parsed.dmmf }),
      diagnostics,
    }
  })
}
