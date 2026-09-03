import { Effect } from 'effect'
import * as z from 'zod'

import type { DocsSchema, SnapshotSchema } from '../routes/index.js'
import { parseSchemaFiles, readSchemaFiles } from './load.js'

const CreateStudioStateInput = z
  .object({
    schemaPath: z
      .string()
      .meta({ description: 'The file or directory path.', example: 'prisma/schema.prisma' }),
  })
  .readonly()
  .meta({
    description: 'The schema path the state re-reads on every reload',
    example: { schemaPath: 'prisma/schema.prisma' },
  })

/** The in-memory snapshot store: `reload` re-reads the files and keeps the last valid schema on errors. */
export function createStudioState(input: z.infer<typeof CreateStudioStateInput>) {
  const { schemaPath } = input
  // The store holds the plain shape; the use cases brand it by checking it against the contract.
  const store: {
    snapshot: z.input<typeof SnapshotSchema>
    docs: z.input<typeof DocsSchema>
  } = {
    snapshot: { schema: null, error: null, updatedAt: new Date(0).toISOString(), files: [] },
    docs: { models: [], inputTypes: [], outputTypes: [], enumTypes: [] },
  }
  function load() {
    return Effect.gen(function* () {
      const previous = store.snapshot
      const files = yield* readSchemaFiles({ schemaPath })
      const parsed = yield* parseSchemaFiles({ files }).pipe(
        Effect.catchTag('SchemaParseError', (e) =>
          Effect.succeed({ schema: previous.schema, docs: store.docs, error: e.message }),
        ),
      )
      return {
        files,
        schema: parsed.schema,
        docs: parsed.docs,
        error: 'error' in parsed ? parsed.error : null,
      }
    })
  }
  function reload() {
    return Effect.gen(function* () {
      const previous = store.snapshot
      const loaded = yield* load().pipe(
        Effect.catchTag('SchemaLoadError', (e) =>
          Effect.succeed({
            files: previous.files,
            schema: previous.schema,
            docs: store.docs,
            error: e.message,
          }),
        ),
      )
      const { docs, ...snapshot } = loaded
      // oxlint-disable-next-line custom/no-mutation -- the store is the one mutable cell of Studio
      store.snapshot = { ...snapshot, updatedAt: new Date().toISOString() }
      // oxlint-disable-next-line custom/no-mutation -- same cell: the docs of the last schema that parsed
      store.docs = docs
      return store.snapshot
    })
  }
  return { schemaPath, snapshot: () => store.snapshot, docs: () => store.docs, reload }
}
