import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { createStudioApp } from '../app.js'
import { disconnectedDbState, createStudioState } from '../services/index.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const SCHEMA = `model User {
  id Int @id
  posts Post[]
}

model Post {
  id Int @id
  authorId Int
  author User @relation(fields: [authorId], references: [id], onDelete: )
}
`

async function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-lang-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, SCHEMA)
  const state = createStudioState({ schemaPath })
  await Effect.runPromise(Effect.provide(state.reload(), fileSystemLayer))
  const app = createStudioApp(state, dir, disconnectedDbState())
  const post = async (url: string, body: unknown) => {
    const response = await app.request(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
    const json: unknown = await response.json()
    return { status: response.status, json }
  }
  return { post, schemaPath }
}

const NOPE =
  'Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.'

describe('prisma routes', () => {
  it('formats a schema with the Prisma formatter', async () => {
    const { post } = await setup()
    expect(
      await post('/api/prisma/format', {
        text: 'model User {\n  id Int @id\n  emailAddress String @unique\n}\n',
      }),
    ).toStrictEqual({
      status: 200,
      json: { text: 'model User {\n  id           Int    @id\n  emailAddress String @unique\n}\n' },
    })
    const malformed = await post('/api/prisma/format', { nope: 1 })
    expect(malformed.status).toBe(422)
  })

  it('lints the edited text in place of the file on disk', async () => {
    const { post, schemaPath } = await setup()
    expect(
      await post('/api/prisma/lint', {
        path: schemaPath,
        text: 'model User {\n  id Nope @id\n}\n',
      }),
    ).toStrictEqual({
      status: 200,
      json: { diagnostics: [{ from: 18, to: 22, message: NOPE, severity: 'error' }] },
    })
    expect(
      await post('/api/prisma/lint', { path: schemaPath, text: 'model User {\n  id Int @id\n}\n' }),
    ).toStrictEqual({
      status: 200,
      json: { diagnostics: [] },
    })
  })

  it('keeps string indexes intact around multibyte comments', async () => {
    const { post, schemaPath } = await setup()
    const text = '/// 日本語のコメント\nmodel User {\n  id Nope @id\n}\n'
    const from = text.indexOf('Nope')
    expect(await post('/api/prisma/lint', { path: schemaPath, text })).toStrictEqual({
      status: 200,
      json: { diagnostics: [{ from, to: from + 4, message: NOPE, severity: 'error' }] },
    })
  })

  it('completes referential actions through the Prisma language server', async () => {
    const { post } = await setup()
    expect(
      await post('/api/prisma/complete', { text: SCHEMA, line: 8, character: 73 }),
    ).toStrictEqual({
      status: 200,
      json: {
        items: [
          {
            label: 'Cascade',
            detail: 'Delete the child records when the parent record is deleted.',
            documentation: null,
            insertText: 'Cascade',
          },
          {
            label: 'Restrict',
            detail: 'Prevent deleting a parent record as long as it is referenced.',
            documentation: null,
            insertText: 'Restrict',
          },
          {
            label: 'NoAction',
            detail: 'Prevent deleting a parent record as long as it is referenced.',
            documentation: null,
            insertText: 'NoAction',
          },
          {
            label: 'SetNull',
            detail: 'Set the referencing fields to NULL when the referenced record is deleted.',
            documentation: null,
            insertText: 'SetNull',
          },
          {
            label: 'SetDefault',
            detail:
              "Set the referencing field's value to the default when the referenced record is deleted.",
            documentation: null,
            insertText: 'SetDefault',
          },
        ],
      },
    })
    const negative = await post('/api/prisma/complete', { text: SCHEMA, line: -1, character: 0 })
    expect(negative.status).toBe(422)
  })
})
