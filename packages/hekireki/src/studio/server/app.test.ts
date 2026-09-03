import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../file/index.js'
import { createStudioApp, missingAssetsMessage } from './app.js'
import { FORBIDDEN_HOST_MESSAGE } from './constants/index.js'
import { disconnectedDatabase, createStudioState } from './services/index.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const SCHEMA = `model User {
  id   Int    @id @default(autoincrement())
  name String
}
`

const reloadState = (state: ReturnType<typeof createStudioState>) =>
  Effect.runPromise(Effect.provide(state.reload(), fileSystemLayer))

async function setup(options: { readonly schema?: string; readonly withIndex?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, options.schema ?? SCHEMA)
  const staticDir = path.join(dir, 'static')
  if (options.withIndex ?? true) {
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Studio</title>')
  }
  const state = createStudioState({ schemaPath })
  await reloadState(state)
  const app = createStudioApp(
    state,
    (options.withIndex ?? true) ? dir : staticDir,
    disconnectedDatabase('No database URL found.'),
  )
  return { app, state, schemaPath, staticDir }
}

function brokenError(schemaPath: string) {
  return `error: Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.\n  -->  ${schemaPath}:2\n   | \n 1 | model User {\n 2 |   id Nope @id\n   | \n\nValidation Error Count: 1`
}

const json = (body: unknown) => ({
  method: 'PUT',
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
})

describe('createStudioApp', () => {
  it('serves the current snapshot at /api/schema', async () => {
    const { app, state } = await setup()
    const response = await app.request('/api/schema')
    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual(state.snapshot())
  })

  it('keeps the last valid schema and reports the error after a broken reload', async () => {
    const { app, state, schemaPath } = await setup()
    const good = state.snapshot()
    writeFileSync(schemaPath, 'model User {\n  id Nope @id\n}\n')
    const reload = await app.request('/api/schema/reload', { method: 'POST' })
    expect(reload.status).toBe(200)
    expect(await reload.json()).toStrictEqual({
      schema: good.schema,
      error: brokenError(schemaPath),
      diagnostics: [
        {
          path: schemaPath,
          range: { start: { line: 1, character: 5 }, end: { line: 1, character: 9 } },
          message:
            'Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.',
          severity: 'error',
        },
      ],
      updatedAt: state.snapshot().updatedAt,
      files: [{ path: schemaPath, content: 'model User {\n  id Nope @id\n}\n' }],
    })
  })

  it('writes a loaded schema file back to disk and reloads', async () => {
    const { app, state, schemaPath } = await setup()
    const next = `${SCHEMA}\nmodel Post {\n  id Int @id\n}\n`
    const response = await app.request(
      '/api/schema/files',
      json({ path: schemaPath, content: next }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual(state.snapshot())
    expect(readFileSync(schemaPath, 'utf8')).toBe(next)
    expect(state.snapshot().schema?.models.map((m) => m.name)).toStrictEqual(['User', 'Post'])
  })

  it('answers problem+json for unknown files and invalid bodies', async () => {
    const { app } = await setup()
    const unknown = await app.request(
      '/api/schema/files',
      json({ path: '/etc/passwd', content: 'x' }),
    )
    expect(unknown.status).toBe(404)
    expect(unknown.headers.get('content-type')).toBe('application/problem+json')
    expect(await unknown.json()).toStrictEqual({
      type: '/problems/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'Unknown schema file "/etc/passwd". Only the files Studio loaded can be written.',
      instance: '/api/schema/files',
    })
    const malformed = await app.request('/api/schema/files', json({ path: 1 }))
    expect(malformed.status).toBe(422)
    expect(await malformed.json()).toStrictEqual({
      type: '/problems/validation-failed',
      title: 'Validation Failed',
      status: 422,
      detail: 'The request failed validation. See `errors` for the offending fields.',
      instance: '/api/schema/files',
      errors: [
        { field: 'path', message: 'Path must be a non-empty string' },
        { field: 'content', message: 'Schema text must be a string' },
      ],
    })
  })

  it('reports the database status and answers 503 for data requests while disconnected', async () => {
    const { app } = await setup()
    const status = await app.request('/api/db')
    expect(await status.json()).toStrictEqual({
      connected: false,
      dialect: null,
      url: null,
      source: null,
      error: 'No database URL found.',
    })
    const rows = await app.request('/api/db/rows/User')
    expect(rows.status).toBe(503)
    expect(await rows.json()).toStrictEqual({
      type: '/problems/service-unavailable',
      title: 'Service Unavailable',
      status: 503,
      detail: 'No database URL found.',
      instance: '/api/db/rows/User',
    })
    const missing = await app.request('/api/db/rows/Nope')
    expect(missing.status).toBe(404)
    const counts = await app.request('/api/db/counts')
    expect(counts.status).toBe(503)
    const sql = await app.request('/api/db/sql', { ...json({ sql: 'select 1' }), method: 'POST' })
    expect(sql.status).toBe(503)
  })

  it('publishes the OpenAPI document', async () => {
    const { app } = await setup()
    const response = await app.request('/api/openapi.json')
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    const paths =
      typeof body === 'object' &&
      body !== null &&
      'paths' in body &&
      typeof body.paths === 'object' &&
      body.paths !== null
        ? Object.keys(body.paths)
        : []
    expect(new Set(paths)).toStrictEqual(
      new Set([
        '/api/db',
        '/api/db/counts',
        '/api/docs',
        '/api/db/rows/{modelName}',
        '/api/db/sql',
        '/api/prisma/complete',
        '/api/prisma/format',
        '/api/prisma/hover',
        '/api/prisma/definition',
        '/api/prisma/rename',
        '/api/prisma/code-actions',
        '/api/prisma/lint',
        '/api/prisma/symbols',
        '/api/prisma/references',
        '/api/schema',
        '/api/schema/events',
        '/api/schema/files',
        '/api/schema/reload',
      ]),
    )
  })

  it('streams a ready event on /api/schema/events', async () => {
    const { app, state } = await setup()
    const response = await app.request('/api/schema/events')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('no body')
    const chunk = await reader.read()
    await reader.cancel()
    expect(new TextDecoder().decode(chunk.value)).toBe(
      `event: ready\ndata: ${state.snapshot().updatedAt}\n\n`,
    )
  })

  it('streams a change event after a reload', async () => {
    const { app, state, schemaPath } = await setup()
    const response = await app.request('/api/schema/events')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('no body')
    await reader.read()
    writeFileSync(schemaPath, `${SCHEMA}\nmodel Post {\n  id Int @id\n}\n`)
    const next = await reloadState(state)
    const chunk = await reader.read()
    await reader.cancel()
    expect(new TextDecoder().decode(chunk.value)).toBe(`event: change\ndata: ${next.updatedAt}\n\n`)
  })

  it('rejects API requests addressed to a non-loopback host', async () => {
    const { app } = await setup()
    const response = await app.request('http://evil.example:5858/api/schema')
    expect(response.status).toBe(403)
    expect(await response.text()).toBe(FORBIDDEN_HOST_MESSAGE)
    const loopback = await app.request('http://127.0.0.1:5858/api/schema')
    expect(loopback.status).toBe(200)
  })

  it('serves index.html at / and for every client route, but not for unknown API paths', async () => {
    const { app } = await setup()
    const response = await app.request('/')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<!doctype html><title>Studio</title>')
    const docs = await app.request('/docs')
    expect(docs.status).toBe(200)
    expect(await docs.text()).toBe('<!doctype html><title>Studio</title>')
    const model = await app.request('/models/User?tab=fields')
    expect(model.status).toBe(200)
    const missing = await app.request('/api/nope')
    expect(missing.status).toBe(404)
  })

  it('explains how to restore missing studio assets', async () => {
    const { app, staticDir } = await setup({ withIndex: false })
    const response = await app.request('/')
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toBe(missingAssetsMessage(staticDir))
  })
})
