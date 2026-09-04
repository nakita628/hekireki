import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../file/index.js'
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
          const schema = yield* Effect.promise(() =>
            fetch(`http://127.0.0.1:${port}/api/schema`).then((r) => r.status),
          )
          const index = yield* Effect.promise(() =>
            fetch(`http://127.0.0.1:${port}/`).then((r) => r.status),
          )
          return { port, schema, index, models: started.snapshot.schema?.models.length }
        }),
      ).pipe(Effect.provide(fileSystemLayer)),
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
          const html = yield* Effect.promise(() =>
            fetch(`http://127.0.0.1:${port}/docs`).then((r) => r.text()),
          )
          return { html, database: started.database }
        }),
      ).pipe(Effect.provide(fileSystemLayer)),
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
      ).pipe(Effect.provide(fileSystemLayer)),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('EADDRINUSE')
    }
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
      ).pipe(Effect.provide(fileSystemLayer)),
    )
    expect(String(exit)).toContain('Schema not found')
  })
})
