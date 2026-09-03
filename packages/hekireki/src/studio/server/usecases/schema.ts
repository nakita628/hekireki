import { Effect } from 'effect'
import * as z from 'zod'

import { ContractViolationError, UnknownFileError } from '../errors/index.js'
import { SnapshotSchema } from '../routes/index.js'
import * as RuntimeService from '../services/runtime.js'
import * as SchemaService from '../services/schema.js'

/**
 * The current snapshot: the last valid schema, the current Prisma error and the files on disk.
 *
 * @returns the snapshot, checked against the Snapshot contract
 */
export function readSnapshot() {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const result = SnapshotSchema.safeParse(state.snapshot())
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * Re-reads and re-parses the schema from disk.
 *
 * @returns the fresh snapshot
 */
export function reloadSnapshot() {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const result = SnapshotSchema.safeParse(yield* state.reload())
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

const WriteFileInput = z
  .object({
    path: z.string().min(1).brand<'SchemaFilePath'>().meta({
      description: 'The file path exactly as Studio loaded it.',
      example: 'prisma/schema.prisma',
    }),
    content: z.string().brand<'SchemaText'>().meta({
      description: 'The whole new file content.',
      example: 'model User {\n  id Int @id\n}\n',
    }),
  })
  .readonly()
  .meta({
    description: 'Input for writing a schema file',
    example: { path: 'prisma/schema.prisma', content: 'model User {\n  id Int @id\n}\n' },
  })

/**
 * Writes one loaded schema file back to disk and reloads, so the snapshot reflects the edit at once.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant U as writeFile
 *   participant St as StudioState
 *   participant F as SchemaService (disk)
 *   U->>St: snapshot().files
 *   alt path not among the loaded files
 *     U-->>U: UnknownFileError
 *   else
 *     U->>F: SchemaService.writeSchemaFile
 *     F-->>U: ok / FileWriteError
 *     U->>St: reload()
 *     St-->>U: snapshot
 *   end
 * ```
 *
 * @param input - the loaded file path and its new content
 * @returns the snapshot after the reload
 */
export function writeFile(input: z.infer<typeof WriteFileInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const known = state.snapshot().files.find((f) => f.path === input.path)
    if (!known) return yield* new UnknownFileError({ path: input.path })
    yield* SchemaService.writeSchemaFile({ path: known.path, content: input.content })
    const result = SnapshotSchema.safeParse(yield* state.reload())
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}
