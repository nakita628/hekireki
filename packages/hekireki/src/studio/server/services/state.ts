import * as z from 'zod'

import type { DocsSchema, SnapshotSchema } from '../routes/index.js'

const CreateStudioStateInput = z
  .object({
    schemaPath: z
      .string()
      .meta({ description: 'The file or directory path.', example: 'prisma/schema.prisma' }),
  })
  .readonly()
  .meta({
    description: 'The schema path the state is kept for',
    example: { schemaPath: 'prisma/schema.prisma' },
  })

/**
 * The in-memory snapshot store: the last snapshot and docs a reload made, and when the migrations
 * directory last changed. What goes in is decided by the schema use case; the store only keeps it
 * and stamps it with the time it arrived.
 *
 * ```mermaid
 * flowchart LR
 *   reload[SchemaUseCase.loadSnapshot] -->|replace| store[(snapshot, docs)]
 *   watch[migrations poller] -->|touchMigrations| stamp[(migrationsUpdatedAt)]
 *   store --> reads[snapshot / docs]
 *   stamp --> reads
 * ```
 *
 * @param input.schemaPath - the schema file or directory the snapshot is read from
 * @returns the store's readers and the two ways it changes
 */
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
  /** Keeps what a reload made, stamped with now; returns the snapshot as stored. */
  function replace(next: {
    readonly snapshot: Omit<z.input<typeof SnapshotSchema>, 'updatedAt'>
    readonly docs: z.input<typeof DocsSchema>
  }) {
    // oxlint-disable-next-line custom/no-mutation -- the store is the one mutable cell of Studio
    store.snapshot = { ...next.snapshot, updatedAt: new Date().toISOString() }
    // oxlint-disable-next-line custom/no-mutation -- same cell: the docs of the last schema that result
    store.docs = next.docs
    return store.snapshot
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
    replace,
  }
}
