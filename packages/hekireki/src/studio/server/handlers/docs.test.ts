import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { createStudioApp } from '../app.js'
import { createStudioState, disconnectedDatabase } from '../services/index.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const SCHEMA = `datasource db {
  provider = "sqlite"
}

/// A registered user
model User {
  id    Int    @id @default(autoincrement())
  /// Login address
  email String @unique
  role  Role   @default(VIEWER)
  posts Post[]
}

/// A blog post
model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}

enum Role {
  ADMIN
  VIEWER
}
`

type Docs = {
  readonly models: readonly {
    readonly name: string
    readonly documentation: string | null
    readonly fields: readonly { readonly name: string; readonly documentation: string | null }[]
    readonly operations: readonly { readonly name: string }[]
  }[]
  readonly enumTypes: readonly { readonly name: string }[]
}

async function setup(schema = SCHEMA) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-docs-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, schema)
  const state = createStudioState({ schemaPath })
  await Effect.runPromise(Effect.provide(state.reload(), fileSystemLayer))
  const app = createStudioApp(state, dir, disconnectedDatabase())
  const docs = async () => {
    const response = await app.request('/api/docs')
    return { status: response.status, json: (await response.json()) as Docs }
  }
  return { docs, state, schemaPath }
}

describe('GET /api/docs', () => {
  it('documents every model of the schema, with its own doc comment', async () => {
    const { docs } = await setup()
    const { status, json } = await docs()
    expect(status).toBe(200)
    expect(json.models.map((model) => [model.name, model.documentation])).toStrictEqual([
      ['User', 'A registered user'],
      ['Post', 'A blog post'],
    ])
  })

  it('carries the doc comment of a single field through to the field row', async () => {
    const { docs } = await setup()
    const { json } = await docs()
    const user = json.models.find((model) => model.name === 'User')
    expect(user?.fields.find((field) => field.name === 'email')?.documentation).toBe(
      'Login address',
    )
    expect(user?.fields.find((field) => field.name === 'id')?.documentation).toBeNull()
  })

  it('lists the client operations a model answers to', async () => {
    const { docs } = await setup()
    const { json } = await docs()
    const names = json.models.find((model) => model.name === 'User')?.operations.map((o) => o.name)
    expect(names).toStrictEqual([
      'findUnique',
      'findFirst',
      'findMany',
      'create',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
    ])
  })

  it('documents the enums beside the models', async () => {
    const { docs } = await setup()
    const { json } = await docs()
    expect(json.enumTypes.map((enumType) => enumType.name)).toContain('Role')
  })

  it('answers with empty documentation for a schema that never parsed', async () => {
    const { docs } = await setup('model Broken {\n  id Nope\n}\n')
    expect(await docs()).toStrictEqual({
      status: 200,
      json: { models: [], inputTypes: [], outputTypes: [], enumTypes: [] },
    })
  })

  // The docs of the last schema that parsed stay up while the file is mid-edit, so the page does
  // not blank out on every keystroke that leaves the schema briefly invalid.
  it('keeps the documentation of the last schema that parsed after a broken reload', async () => {
    const { docs, state, schemaPath } = await setup()
    const before = await docs()
    writeFileSync(schemaPath, 'model Broken {\n  id Nope\n}\n')
    await Effect.runPromise(Effect.provide(state.reload(), fileSystemLayer))
    expect(state.snapshot().error).not.toBeNull()
    expect(await docs()).toStrictEqual(before)
  })
})
