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
 * Opens what Studio serves besides the schema: the database, the project's Prisma Client and the
 * type checker over its types, each closed with the surrounding scope, and tells the state
 * whenever the migrations Prisma Migrate reads change. Neither a config that does not load nor a
 * database that does not open is fatal: Studio shows the schema and says why.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as start
 *   participant U as StudioUseCase
 *   participant D as DatabaseService
 *   participant P as ClientService
 *   participant T as TypescriptService
 *   participant W as WatchService
 *   C->>U: openStudio({ state, snapshot, schemaDir, databaseUrl, cwd })
 *   Note over U: the url of hekireki.config.ts, or why it did not load
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
 * @param input.cwd - where .env, the configs and the drivers are looked up
 * @returns the database, the client and the type checker
 */
export function openStudio(input: {
  readonly state: ReturnType<typeof StateService.createStudioState>
  readonly snapshot: z.input<typeof SnapshotSchema>
  readonly schemaDir: string
  readonly databaseUrl: string | null
  readonly cwd: string
}) {
  return Effect.gen(function* () {
    const config = yield* withTypeScriptImports(readConfigUrl(input.cwd)).pipe(
      Effect.match({
        onFailure: (error) => ({ url: null, error: error.message }),
        onSuccess: (url) => ({ url, error: null }),
      }),
    )
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
