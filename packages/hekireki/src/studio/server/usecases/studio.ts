import path from 'node:path'

import { Effect } from 'effect'
import type * as z from 'zod'

import { resolveMigrationsDir } from '../../../migrate/adapter/migrations-dir.js'
import { readConfigUrl } from '../../../seed/load-config.js'
import { withTypeScriptImports } from '../../../seed/resolve.js'
import { MIGRATIONS_POLL_MS } from '../constants/index.js'
import type { SnapshotSchema } from '../routes/index.js'
import * as ClientService from '../services/index.js'
import * as DatabaseService from '../services/index.js'
import type * as StateService from '../services/index.js'
import * as TypescriptService from '../services/index.js'
import * as WatchService from '../services/index.js'

/**
 * The `url` of hekireki.config.ts, so the database `hekireki seed` fills is the one Studio opens.
 * A config that does not load is not fatal: Studio shows the schema and says why.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as start
 *   participant U as StudioUseCase
 *   participant L as seed/load-config
 *   C->>U: readStudioConfig({ cwd })
 *   U->>L: readConfigUrl(cwd), TypeScript imports on
 *   alt loaded
 *     U-->>C: url, no error
 *   else does not load
 *     U-->>C: no url, why
 *   end
 * ```
 *
 * @param input.cwd - where hekireki.config.ts is looked up
 * @returns the url it names (or null) and why it did not load (or null)
 */
export function readStudioConfig(input: { readonly cwd: string }) {
  return withTypeScriptImports(readConfigUrl(input.cwd)).pipe(
    Effect.match({
      onFailure: (error) => ({ url: null, error: error.message }),
      onSuccess: (url) => ({ url, error: null }),
    }),
  )
}

/**
 * Opens what Studio serves besides the schema: the database, the project's Prisma Client and the
 * type checker over its types, each closed with the surrounding scope, and tells the state
 * whenever the migrations Prisma Migrate reads change. A database that does not open is not fatal:
 * Studio shows the schema and says why.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as start
 *   participant U as StudioUseCase
 *   participant D as DatabaseService
 *   participant P as ClientService
 *   participant T as TypescriptService
 *   participant W as WatchService
 *   C->>U: openStudio({ state, snapshot, schemaDir, databaseUrl, config, cwd })
 *   U->>D: connectDatabase({ explicitUrl, configUrl, schemaProvider, ... })
 *   D-->>U: db (connected, or disconnected with the reason)
 *   U->>P: createProjectClient({ target, reason, schemaDir, cwd })
 *   U->>T: createTypeChecker({ schemaDir, cwd })
 *   Note over U: migrations.path of prisma.config.ts, else beside the schema
 *   U->>W: watchMigrations({ dir, intervalMs, onChange: state.touchMigrations })
 *   U-->>C: db, client, typescript
 * ```
 *
 * @param input.state - the store whose migrations stamp is moved on
 * @param input.snapshot - the first snapshot, for the datasource provider and url
 * @param input.schemaDir - the directory of the schema, where relative files resolve from
 * @param input.databaseUrl - the --url flag, when given
 * @param input.config - what readStudioConfig found in hekireki.config.ts
 * @param input.cwd - where .env, the configs and the drivers are looked up
 * @returns the database, the client and the type checker
 */
export function openStudio(input: {
  readonly state: ReturnType<typeof StateService.createStudioState>
  readonly snapshot: z.input<typeof SnapshotSchema>
  readonly schemaDir: string
  readonly databaseUrl: string | null
  readonly config: { readonly url: string | null; readonly error: string | null }
  readonly cwd: string
}) {
  return Effect.gen(function* () {
    const { config } = input
    // The connection and the migrations directory do not wait on each other.
    const [db, migrationsDir] = yield* Effect.all(
      [
        DatabaseService.connectDatabase({
          explicitUrl: input.databaseUrl,
          configUrl: config.url,
          configError: config.error,
          schemaProvider: input.snapshot.schema?.provider ?? null,
          schemaText: input.snapshot.files.map((file) => file.content).join('\n'),
          cwd: input.cwd,
          schemaDir: input.schemaDir,
        }),
        resolveMigrationsDir({ cwd: input.cwd, schemaDir: path.resolve(input.schemaDir) }),
      ],
      { concurrency: 2 },
    )
    yield* Effect.addFinalizer(() => db.close)
    const client = ClientService.createProjectClient({
      target: db.target,
      reason: db.status.error,
      schemaDir: input.schemaDir,
      cwd: input.cwd,
    })
    yield* Effect.addFinalizer(() => client.close)
    const typescript = TypescriptService.createTypeChecker({
      schemaDir: input.schemaDir,
      cwd: input.cwd,
    })
    yield* WatchService.watchMigrations({
      onChange: input.state.touchMigrations,
      dir: migrationsDir,
      intervalMs: MIGRATIONS_POLL_MS,
    })
    return { db, client, typescript }
  })
}
