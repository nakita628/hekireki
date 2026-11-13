import path from 'node:path'

import type { DMMF } from '@prisma/generator-helper'
import { Effect } from 'effect'
import * as z from 'zod'

import { parseSchema, readSchemaFiles as readSchemaFilesFrom } from '../../../schema/index.js'
import { SchemaLoadError, SchemaParseError } from '../errors/index.js'

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
 *
 * ```mermaid
 * flowchart LR
 *   schemaPath --> fs[(file system)] --> files[path + content of each .prisma file]
 *   fs -->|missing / unreadable| fail[SchemaLoadError]
 * ```
 *
 * @param input.schemaPath - the schema file or directory
 * @returns each file's path and content
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
    diagnostics: z
      .custom<SchemaParseError['diagnostics']>(Array.isArray)
      .meta({ description: "The language server's diagnostics, reported when the engine fails." }),
  })
  .readonly()
  .meta({ description: 'The schema files to parse together, and what the editor already found' })

/**
 * Parses the files together with the Prisma engine. When the engine rejects them, the failure
 * carries the language server's diagnostics, which say where, as the engine's message does not.
 *
 * ```mermaid
 * flowchart LR
 *   files --> engine[[Prisma engine: getDMMF]]
 *   engine -->|ok| dmmf[DMMF + provider]
 *   engine -->|error| fail[SchemaParseError + diagnostics]
 * ```
 *
 * @param input.files - the schema files, parsed as one schema
 * @param input.diagnostics - what the language server reported for them
 * @returns the DMMF and the datasource provider
 */
export function parseSchemaFiles(input: z.infer<typeof ParseSchemaFilesInput>) {
  return parseSchema(input.files).pipe(
    Effect.map(
      (parsed): { readonly dmmf: DMMF.Document; readonly provider: string | null } => parsed,
    ),
    Effect.mapError(
      (error) => new SchemaParseError({ message: error.message, diagnostics: input.diagnostics }),
    ),
  )
}
