import path from 'node:path'

import { layer as nodeFileSystemLayer } from '@effect/platform-node/NodeFileSystem'
import { Effect } from 'effect'
import * as z from 'zod'

import { isDirectory } from '../../../file/index.js'
import { RELOAD_DEBOUNCE_MS } from '../constants/index.js'
import * as DocsDomain from '../domain/index.js'
import * as SchemaDomain from '../domain/index.js'
import { SchemaLoadError, UnknownFileError } from '../errors/index.js'
import * as LanguageService from '../services/index.js'
import * as LoadService from '../services/index.js'
import * as StateService from '../services/index.js'
import * as StudioService from '../services/index.js'
import * as SchemaService from '../services/index.js'
import * as WatchService from '../services/index.js'

/**
 * What a reload makes of files that were read: the language server's diagnostics and block
 * locations, then the engine's DMMF, mapped to the snapshot and the docs. A schema the engine
 * rejects keeps the last one that parsed, beside the error.
 */
function parseFiles(input: {
  readonly files: readonly { readonly path: string; readonly content: string }[]
  readonly previous: ReturnType<ReturnType<typeof StateService.createStudioState>['snapshot']>
  readonly docs: ReturnType<ReturnType<typeof StateService.createStudioState>['docs']>
}) {
  return Effect.gen(function* () {
    const { files } = input
    // One workspace of the language server serves both: the diagnostics the error path reports
    // and the block locations the schema carries.
    const { diagnostics, blocks } = yield* LanguageService.inspectFiles({ files })
    return yield* LoadService.parseSchemaFiles({ files, diagnostics }).pipe(
      Effect.match({
        onFailure: (error) => ({
          snapshot: {
            files,
            schema: input.previous.schema,
            error: error.message,
            diagnostics: [...error.diagnostics],
          },
          docs: input.docs,
        }),
        onSuccess: ({ dmmf, provider }) => ({
          snapshot: {
            files,
            schema: SchemaDomain.makeSchema({ dmmf, files, provider, blocks }),
            error: null,
            diagnostics,
          },
          docs: DocsDomain.makeDocs({ dmmf }),
        }),
      }),
    )
  })
}

/**
 * Re-reads and re-parses the schema from disk into the state. Neither failure is raised: files
 * that cannot be read keep the last files and schema, a schema the engine rejects keeps the last
 * schema that parsed, and either way the snapshot says what went wrong.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Caller (handler, watcher, start)
 *   participant U as SchemaUseCase
 *   participant L as LoadService
 *   participant G as LanguageService
 *   participant D as SchemaDomain / DocsDomain
 *   participant S as StateService
 *   C->>U: loadSnapshot({ state })
 *   U->>L: readSchemaFiles({ schemaPath })
 *   alt SchemaLoadError
 *     Note over U: keep the last files and schema, with the error
 *   else files
 *     U->>G: inspectFiles({ files })
 *     G-->>U: diagnostics, blocks
 *     U->>L: parseSchemaFiles({ files, diagnostics })
 *     alt SchemaParseError
 *       Note over U: keep the last schema, with the error and diagnostics
 *     else DMMF
 *       U->>D: makeSchema / makeDocs
 *     end
 *   end
 *   U->>S: replace({ snapshot, docs })
 *   U-->>C: snapshot
 * ```
 *
 * @param input.state - the store the snapshot is read from and written to
 * @returns the snapshot as stored
 */
export function loadSnapshot(input: {
  readonly state: ReturnType<typeof StateService.createStudioState>
}) {
  return Effect.gen(function* () {
    const { state } = input
    const previous = state.snapshot()
    const docs = state.docs()
    const next = yield* LoadService.readSchemaFiles({ schemaPath: state.schemaPath }).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.succeed({
            snapshot: {
              files: previous.files,
              schema: previous.schema,
              error: error.message,
              diagnostics: [],
            },
            docs,
          }),
        onSuccess: (files) => parseFiles({ files, previous, docs }),
      }),
    )
    return state.replace(next)
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

/**
 * Makes the state for the schema, loads it once for Studio to start on, and reloads it after
 * every burst of `.prisma` changes for as long as the surrounding scope. A schema directory is
 * watched down through its subdirectories, as it is read; a schema file's whole directory is.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as start
 *   participant U as SchemaUseCase
 *   participant S as StateService
 *   participant W as WatchService
 *   C->>U: openSnapshot({ schemaPath })
 *   Note over U: is the path a directory? missing -> SchemaLoadError
 *   U->>S: createStudioState({ schemaPath })
 *   U->>U: loadSnapshot({ state })
 *   U->>W: watchSchema({ dir, recursive, debounceMs, onChange })
 *   loop each burst of changes
 *     W->>U: onChange()
 *     U->>U: loadSnapshot({ state })
 *   end
 *   U-->>C: state, snapshot, schemaDir
 * ```
 *
 * @param input.schemaPath - the schema file or directory
 * @returns the state, its first snapshot and the directory the schema is in
 */
export function openSnapshot(input: { readonly schemaPath: string }) {
  return Effect.gen(function* () {
    const recursive = yield* isDirectory(input.schemaPath).pipe(
      Effect.mapError(
        (error) =>
          new SchemaLoadError({
            message: `Schema not found: ${input.schemaPath}\n   ${error.message}`,
          }),
      ),
    )
    const state = StateService.createStudioState({ schemaPath: input.schemaPath })
    const snapshot = yield* loadSnapshot({ state })
    const schemaDir = recursive ? input.schemaPath : path.dirname(input.schemaPath)
    yield* WatchService.watchSchema({
      onChange: () => loadSnapshot({ state }),
      dir: schemaDir,
      recursive,
      debounceMs: RELOAD_DEBOUNCE_MS,
    })
    return { state, snapshot, schemaDir }
  }).pipe(Effect.provide(nodeFileSystemLayer))
}

/**
 * The current snapshot: the last valid schema, the current Prisma error and the files on disk.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as SchemaUseCase
 *   participant S as StudioService
 *   H->>U: readSnapshot()
 *   U->>S: studio().state.snapshot()
 *   U-->>H: snapshot
 * ```
 *
 * @returns the snapshot as the state holds it
 */
export function readSnapshot() {
  return Effect.sync(() => StudioService.studio().state.snapshot())
}

/**
 * When the snapshot and the migrations directory last changed: what the event stream polls.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as SchemaUseCase
 *   participant S as StudioService
 *   H->>U: readUpdatedAt()
 *   U->>S: studio().state
 *   U-->>H: updatedAt, migrationsUpdatedAt
 * ```
 *
 * @returns both timestamps as ISO strings
 */
export function readUpdatedAt() {
  return Effect.sync(() => {
    const state = StudioService.studio().state
    return {
      updatedAt: state.snapshot().updatedAt,
      migrationsUpdatedAt: state.migrationsUpdatedAt(),
    }
  })
}

/**
 * Re-reads and re-parses the schema from disk.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as SchemaUseCase
 *   participant S as StudioService
 *   H->>U: reloadSnapshot()
 *   U->>S: studio().state
 *   U->>U: loadSnapshot({ state })
 *   U-->>H: snapshot
 * ```
 *
 * @returns the fresh snapshot
 */
export function reloadSnapshot() {
  return loadSnapshot({ state: StudioService.studio().state })
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
 *   participant H as Handler
 *   participant U as SchemaUseCase
 *   participant S as StudioService
 *   participant F as SchemaService (disk)
 *   H->>U: writeFile({ path, content })
 *   U->>S: studio().state.snapshot().files
 *   alt path not among the loaded files
 *     U-->>H: UnknownFileError
 *   else
 *     U->>F: writeSchemaFile({ path, content })
 *     F-->>U: ok / FileWriteError
 *     U->>U: loadSnapshot({ state })
 *     U-->>H: snapshot
 *   end
 * ```
 *
 * @param input.path - the file path exactly as Studio loaded it
 * @param input.content - the whole new file content
 * @returns the snapshot after the reload
 */
export function writeFile(input: z.infer<typeof WriteFileInput>) {
  return Effect.gen(function* () {
    const state = StudioService.studio().state
    const known = state.snapshot().files.find((f) => f.path === input.path)
    if (!known) return yield* new UnknownFileError({ path: input.path })
    yield* SchemaService.writeSchemaFile({ path: known.path, content: input.content })
    return yield* loadSnapshot({ state })
  }).pipe(Effect.provide(nodeFileSystemLayer))
}
