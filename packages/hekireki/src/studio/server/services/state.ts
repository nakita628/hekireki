import { Effect } from 'effect'
import * as z from 'zod'

import type { DocsSchema, SnapshotSchema } from '../routes/index.js'
import * as LoadService from './load.js'

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
    /** When the migrations directory was last seen to change; what the page reads its history again on. */
    migrationsUpdatedAt: string
  } = {
    migrationsUpdatedAt: new Date(0).toISOString(),
    snapshot: {
      schema: null,
      error: null,
      diagnostics: [],
      updatedAt: new Date(0).toISOString(),
      files: [],
    },
    docs: { models: [], inputTypes: [], outputTypes: [], enumTypes: [] },
  }
  function load() {
    return Effect.gen(function* () {
      const previous = store.snapshot
      const files = yield* LoadService.readSchemaFiles({ schemaPath })
      const result = yield* LoadService.parseSchemaFiles({ files }).pipe(
        Effect.catchTag('SchemaParseError', (error) =>
          Effect.succeed({
            schema: previous.schema,
            docs: store.docs,
            error: error.message,
            diagnostics: [...error.diagnostics],
          }),
        ),
      )
      return {
        files,
        schema: result.schema,
        docs: result.docs,
        error: 'error' in result ? result.error : null,
        diagnostics: result.diagnostics,
      }
    })
  }
  function reload() {
    return Effect.gen(function* () {
      const previous = store.snapshot
      const loaded = yield* load().pipe(
        Effect.catchTag('SchemaLoadError', (error) =>
          Effect.succeed({
            files: previous.files,
            schema: previous.schema,
            docs: store.docs,
            error: error.message,
            diagnostics: [],
          }),
        ),
      )
      const { docs, ...snapshot } = loaded
      // oxlint-disable-next-line custom/no-mutation -- the store is the one mutable cell of Studio
      store.snapshot = { ...snapshot, updatedAt: new Date().toISOString() }
      // oxlint-disable-next-line custom/no-mutation -- same cell: the docs of the last schema that result
      store.docs = docs
      return store.snapshot
    })
  }
  /** Notes that the migrations directory changed, for the pages watching it to read it again. */
  function touchMigrations() {
    // oxlint-disable-next-line custom/no-mutation -- same cell: when the migrations last changed
    store.migrationsUpdatedAt = new Date().toISOString()
  }
  return {
    schemaPath,
    migrationsUpdatedAt: () => store.migrationsUpdatedAt,
    touchMigrations,
    snapshot: () => store.snapshot,
    docs: () => store.docs,
    reload,
  }
}
