import path from 'node:path'

import { Effect } from 'effect'
import * as z from 'zod'

import { writeFile } from '../../../file/index.js'
import { FileWriteError } from '../errors/index.js'

const WriteSchemaFileInput = z
  .object({
    path: z
      .string()
      .meta({ description: 'The file path as Studio loaded it.', example: 'prisma/schema.prisma' }),
    content: z.string().meta({
      description: 'The whole new file content.',
      example: 'model User {\n  id Int @id\n}\n',
    }),
  })
  .readonly()
  .meta({ description: 'A schema file path (as loaded) and its new content' })

/** Writes the content to the file, resolved against the working directory. */
export function writeSchemaFile(input: z.infer<typeof WriteSchemaFileInput>) {
  return writeFile(path.resolve(process.cwd(), input.path), input.content).pipe(
    Effect.mapError((e) => new FileWriteError({ path: input.path, cause: e.message })),
  )
}
