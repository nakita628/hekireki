import { Effect } from 'effect'
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
 *   store & stamp -->|version + 1| waiters[nextChange]
 * ```
 *
 * @param input.schemaPath - the schema file or directory the snapshot is read from
 * @returns the store's readers, the two ways it changes and a wait for the next change
 */
export function createStudioState(input: z.infer<typeof CreateStudioStateInput>) {
  const { schemaPath } = input
  // The store holds the plain shape; the use cases brand it by checking it against the contract.
  const store: {
    snapshot: z.input<typeof SnapshotSchema>
    docs: z.input<typeof DocsSchema>
    /** When the migrations directory was last seen to change; what the page reads its history again on. */
    migrationsUpdatedAt: string
    /** Counts the changes of either, for a waiter to tell one it has not seen. */
    version: number
  } = {
    migrationsUpdatedAt: new Date(0).toISOString(),
    version: 0,
    snapshot: {
      schema: null,
      error: null,
      diagnostics: [],
      updatedAt: new Date(0).toISOString(),
      files: [],
    },
    docs: { models: [], inputTypes: [], outputTypes: [], enumTypes: [] },
  }
  // Whoever waits for the next change: each is called once, then forgotten.
  const waiting = new Set<() => void>()
  function changed() {
    // oxlint-disable-next-line custom/no-mutation -- same cell: one more change
    store.version += 1
    const woken = [...waiting]
    waiting.clear()
    for (const wake of woken) wake()
  }
  /** Succeeds once the store has changed past `after`: at once when it already has. */
  function nextChange(after: number) {
    return Effect.callback<undefined>((resume) => {
      function wake() {
        waiting.delete(wake)
        resume(Effect.succeed(undefined))
      }
      waiting.add(wake)
      // Registered first, then looked: a change cannot fall between the two.
      if (store.version > after) wake()
      return Effect.sync(() => {
        waiting.delete(wake)
      })
    })
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
    changed()
    return store.snapshot
  }
  /** Notes that the migrations directory changed, for the pages watching it to read it again. */
  function touchMigrations() {
    // oxlint-disable-next-line custom/no-mutation -- same cell: when the migrations last changed
    store.migrationsUpdatedAt = new Date().toISOString()
    changed()
  }
  return {
    schemaPath,
    migrationsUpdatedAt: () => store.migrationsUpdatedAt,
    touchMigrations,
    snapshot: () => store.snapshot,
    docs: () => store.docs,
    version: () => store.version,
    nextChange,
    replace,
  }
}
