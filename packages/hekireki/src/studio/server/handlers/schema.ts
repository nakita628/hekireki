import type { RouteHandler } from '@hono/zod-openapi'
import { Effect, Match } from 'effect'
import { streamSSE } from 'hono/streaming'

import { SSE_PING_MS, SSE_POLL_MS } from '../constants/index.js'
import type {
  getSchemaEventsRoute,
  getSchemaRoute,
  postSchemaReloadRoute,
  putSchemaFilesRoute,
} from '../routes'
import { NotFoundProblemSchema, SnapshotSchema, ValidationProblemSchema } from '../routes/index.js'
import * as SchemaUseCase from '../usecases/index.js'

// The snapshot as last checked, by the object the state holds: a reload replaces that object,
// and the page asks for the snapshot after every change event, so the check runs once per reload.
const checked = new WeakMap<object, ReturnType<typeof SnapshotSchema.parse>>()

function checkSnapshot(snapshot: object) {
  const kept = checked.get(snapshot)
  if (kept !== undefined) return kept
  const parsed = SnapshotSchema.parse(snapshot)
  checked.set(snapshot, parsed)
  return parsed
}

/**
 * `GET /schema` handler. The current snapshot: the last valid schema, the current Prisma error and
 * the files on disk.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as SchemaUseCase
 *   C->>H: GET /schema
 *   H->>U: readSnapshot()
 *   U-->>H: Snapshot
 *   H-->>C: 200 Snapshot
 * ```
 */
export const getSchemaRouteHandler: RouteHandler<typeof getSchemaRoute> = (c) =>
  Effect.runPromise(
    Effect.map(SchemaUseCase.readSnapshot(), (value) => c.json(checkSnapshot(value), 200)),
  )

/**
 * `POST /schema/reload` handler. Re-read and re-parse the schema from disk (the watcher does this
 * on its own after every save).
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as SchemaUseCase
 *   C->>H: POST /schema/reload
 *   H->>U: reloadSnapshot()
 *   U-->>H: Snapshot
 *   H-->>C: 200 Snapshot
 * ```
 */
export const postSchemaReloadRouteHandler: RouteHandler<typeof postSchemaReloadRoute> = (c) =>
  Effect.runPromise(
    Effect.map(SchemaUseCase.reloadSnapshot(), (value) => c.json(checkSnapshot(value), 200)),
  )

/**
 * `PUT /schema/files` handler. Write one schema file back to disk and reload, so the returned
 * snapshot reflects the edit. Only a path listed in `Snapshot.files` can be written (404
 * otherwise); a file the OS refuses to write is reported as a validation problem on `path`.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as SchemaUseCase
 *   C->>H: PUT /schema/files
 *   H->>U: writeFile()
 *   U-->>H: Snapshot
 *   H-->>C: 200 Snapshot
 *   Note over H: on failure, Match.tag: UnknownFileError -> 404 / FileWriteError -> 422
 * ```
 */
export const putSchemaFilesRouteHandler: RouteHandler<typeof putSchemaFilesRoute> = (c) => {
  const data = c.req.valid('json')
  return Effect.runPromise(
    Effect.matchEffect(SchemaUseCase.writeFile({ path: data.path, content: data.content }), {
      onSuccess: (value) => Effect.succeed(c.json(checkSnapshot(value), 200)),
      onFailure: (error) =>
        Match.value(error).pipe(
          Match.tag('UnknownFileError', ({ path }) =>
            Effect.succeed(
              c.json(
                NotFoundProblemSchema.parse({
                  type: '/problems/not-found',
                  title: 'Not Found',
                  status: 404,
                  detail: `Unknown schema file "${path}". Only the files Studio loaded can be written.`,
                  instance: c.req.path,
                }),
                404,
                { 'Content-Type': 'application/problem+json' },
              ),
            ),
          ),
          Match.tag('FileWriteError', ({ cause, path }) =>
            Effect.logError('schema file write failed', cause).pipe(
              Effect.as(
                c.json(
                  ValidationProblemSchema.parse({
                    type: '/problems/validation-failed',
                    title: 'Validation Failed',
                    status: 422,
                    detail: `Could not write ${path}: ${cause}`,
                    instance: c.req.path,
                    errors: [{ field: 'path', message: cause }],
                  }),
                  422,
                  { 'Content-Type': 'application/problem+json' },
                ),
              ),
            ),
          ),
          Match.exhaustive,
        ),
    }),
  )
}

/**
 * `GET /schema/events` handler. A server-sent event stream: `ready` with the snapshot's updatedAt,
 * then `change` whenever it moves (whoever triggered the reload), `migrations` whenever the
 * migrations directory does, and `ping` to keep the connection open.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as SchemaUseCase
 *   C->>H: GET /schema/events
 *   H->>U: readUpdatedAt()
 *   U-->>H: updatedAt, migrationsUpdatedAt
 *   H-->>C: event: ready
 *   loop every SSE_POLL_MS until the client goes away
 *     H->>U: readUpdatedAt()
 *     U-->>H: updatedAt, migrationsUpdatedAt
 *     alt the snapshot changed
 *       H-->>C: event: change
 *     else the migrations directory changed
 *       H-->>C: event: migrations
 *     else SSE_PING_MS passed in silence
 *       H-->>C: event: ping
 *     end
 *   end
 * ```
 */
export const getSchemaEventsRouteHandler: RouteHandler<typeof getSchemaEventsRoute> = (c) =>
  streamSSE(c, async (stream) => {
    const initial = Effect.runSync(SchemaUseCase.readUpdatedAt())
    await stream.writeSSE({ event: 'ready', data: initial.updatedAt })
    // What the client was last told, carried from one poll to the next. A loop rather than a
    // recursion: a stream stays open for hours, and every tick of a recursion would be one more
    // frame waiting for the one below it.
    for (
      let seen: {
        readonly updatedAt: string
        readonly migrationsUpdatedAt: string
        readonly pingedAt: number
      } = { ...initial, pingedAt: Date.now() };
      !stream.aborted;
    ) {
      // oxlint-disable-next-line no-await-in-loop -- one poll of the stream runs after the one before it
      await stream.sleep(SSE_POLL_MS)
      const current = Effect.runSync(SchemaUseCase.readUpdatedAt())
      if (current.updatedAt !== seen.updatedAt) {
        // oxlint-disable-next-line no-await-in-loop -- one poll of the stream runs after the one before it
        await stream.writeSSE({ event: 'change', data: current.updatedAt })
        seen = { ...seen, updatedAt: current.updatedAt, pingedAt: Date.now() }
      } else if (current.migrationsUpdatedAt !== seen.migrationsUpdatedAt) {
        // The migrations directory changed: what the Migrate page reads its history from.
        // oxlint-disable-next-line no-await-in-loop -- one poll of the stream runs after the one before it
        await stream.writeSSE({ event: 'migrations', data: current.migrationsUpdatedAt })
        seen = { ...seen, migrationsUpdatedAt: current.migrationsUpdatedAt, pingedAt: Date.now() }
      } else if (Date.now() - seen.pingedAt > SSE_PING_MS) {
        // oxlint-disable-next-line no-await-in-loop -- one poll of the stream runs after the one before it
        await stream.writeSSE({ event: 'ping', data: '' })
        seen = { ...seen, pingedAt: Date.now() }
      }
    }
  })
