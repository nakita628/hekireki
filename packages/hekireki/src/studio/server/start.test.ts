import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { startStudioServer } from './start.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-start-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, 'model User {\n  id Int @id\n}\n')
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Studio</title>')
  return { dir, schemaPath }
}

/** The status of a GET, and the body of one as text. */
function statusOf(url: string) {
  return Effect.promise(async () => {
    const response = await fetch(url)
    return response.status
  })
}

function textOf(url: string) {
  return Effect.promise(async () => {
    const response = await fetch(url)
    return response.text()
  })
}

/** Why a run that has to fail failed. */
function causeOf<A, E>(exit: Exit.Exit<A, E>) {
  if (!Exit.isFailure(exit)) throw new Error('expected the second server to fail')
  return exit.cause
}

function addressPort(server: { address: () => unknown }) {
  const address = server.address()
  return typeof address === 'object' && address !== null && 'port' in address
    ? Number(address.port)
    : 0
}

describe('startStudioServer', () => {
  it('serves the API on loopback until the scope closes', async () => {
    const { dir, schemaPath } = setup()
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const started = yield* startStudioServer({
            schemaPath,
            port: 0,
            staticDir: dir,
            databaseUrl: null,
          })
          const port = addressPort(started.server)
          const schema = yield* statusOf(`http://127.0.0.1:${port}/api/schema`)
          const index = yield* statusOf(`http://127.0.0.1:${port}/`)
          return { port, schema, index, models: started.snapshot.schema?.models.length }
        }),
      ).pipe(Effect.provide(NodeFileSystem.layer)),
    )
    expect(result.schema).toBe(200)
    expect(result.index).toBe(200)
    expect(result.models).toBe(1)
    await expect(fetch(`http://127.0.0.1:${result.port}/api/schema`)).rejects.toThrow(
      'fetch failed',
    )
  })

  it('serves the client for /docs with no database to open', async () => {
    const { dir, schemaPath } = setup()
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const started = yield* startStudioServer({
            schemaPath,
            port: 0,
            staticDir: dir,
            databaseUrl: null,
          })
          const port = addressPort(started.server)
          const html = yield* textOf(`http://127.0.0.1:${port}/docs`)
          return { html, database: started.database }
        }),
      ).pipe(Effect.provide(NodeFileSystem.layer)),
    )
    expect(result.html).toContain('<title>Studio</title>')
    expect(result.database.connected).toBe(false)
  })

  it('fails with ServerListenError when the port is taken', async () => {
    const { dir, schemaPath } = setup()
    const exit = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const first = yield* startStudioServer({
            schemaPath,
            port: 0,
            staticDir: dir,
            databaseUrl: null,
          })
          return yield* Effect.exit(
            startStudioServer({
              schemaPath,
              port: addressPort(first.server),
              staticDir: dir,
              databaseUrl: null,
            }),
          )
        }),
      ).pipe(Effect.provide(NodeFileSystem.layer)),
    )
    expect(String(causeOf(exit))).toContain('EADDRINUSE')
  })

  it('fails with SchemaLoadError for a missing schema', async () => {
    const { dir } = setup()
    const exit = await Effect.runPromise(
      Effect.scoped(
        Effect.exit(
          startStudioServer({
            schemaPath: path.join(dir, 'nope.prisma'),
            port: 0,
            staticDir: dir,
            databaseUrl: null,
          }),
        ),
      ).pipe(Effect.provide(NodeFileSystem.layer)),
    )
    expect(String(exit)).toContain('Schema not found')
  })
})
