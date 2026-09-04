import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { createStudioApp } from '../app.js'
import { disconnectedDatabase, createStudioState } from '../services/index.js'

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
  const app = createStudioApp(state, dir, disconnectedDatabase())
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
  it('formats a schema with the Prisma formatter as one whole-document edit', async () => {
    const { post } = await setup()
    const formatted = 'model User {\n  id           Int    @id\n  emailAddress String @unique\n}\n'
    const result = await post('/api/prisma/format', {
      text: 'model User {\n  id Int @id\n  emailAddress String @unique\n}\n',
    })
    expect(result.status).toBe(200)
    const edits = (result.json as { edits: { range: { start: unknown }; newText: string }[] }).edits
    expect(edits.map((e) => [e.range.start, e.newText])).toStrictEqual([
      [{ line: 0, character: 0 }, formatted],
    ])
    expect(await post('/api/prisma/format', { text: formatted })).toStrictEqual({
      status: 200,
      json: { edits: [] },
    })
    const malformed = await post('/api/prisma/format', { nope: 1 })
    expect(malformed.status).toBe(422)
  })

  it('formats the edited file together with the other loaded files', async () => {
    const { post, schemaPath } = await setup()
    // Post lives on disk; the buffer only declares User with a relation to it, which the
    // formatter can complete because it sees both.
    const result = await post('/api/prisma/format', {
      path: schemaPath,
      text: 'model User {\n  id Int @id\n}\n\nmodel Post {\n  id Int @id\n  author User\n}\n',
    })
    expect(result.status).toBe(200)
    const edits = (result.json as { edits: { newText: string }[] }).edits
    expect(edits[0]?.newText).toMatch(/posts\s+Post\[\]/u)
    expect(edits[0]?.newText).toMatch(/userId\s+Int/u)
  })

  it('outlines the blocks of the text as document symbols', async () => {
    const { post } = await setup()
    expect(await post('/api/prisma/symbols', { text: SCHEMA })).toStrictEqual({
      status: 200,
      json: {
        symbols: [
          {
            name: 'User',
            kind: 5,
            range: { start: { line: 0, character: 0 }, end: { line: 3, character: 1 } },
            selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } },
          },
          {
            name: 'Post',
            kind: 5,
            range: { start: { line: 5, character: 0 }, end: { line: 9, character: 1 } },
            selectionRange: { start: { line: 5, character: 6 }, end: { line: 5, character: 10 } },
          },
        ],
      },
    })
  })

  it('lists every reference of the symbol at a position', async () => {
    const { post, schemaPath } = await setup()
    const result = await post('/api/prisma/references', { text: SCHEMA, line: 0, character: 7 })
    expect(result.status).toBe(200)
    const locations = (
      result.json as { locations: { path: string; range: { start: { line: number } } }[] }
    ).locations
    expect(locations.map((l) => [l.path, l.range.start.line])).toStrictEqual([
      [schemaPath, 0],
      [schemaPath, 8],
    ])
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
      json: {
        diagnostics: [
          {
            range: { start: { line: 1, character: 5 }, end: { line: 1, character: 9 } },
            message: NOPE,
            severity: 'error',
          },
        ],
      },
    })
    expect(
      await post('/api/prisma/lint', { path: schemaPath, text: 'model User {\n  id Int @id\n}\n' }),
    ).toStrictEqual({
      status: 200,
      json: { diagnostics: [] },
    })
  })

  it('positions diagnostics by line and column around multibyte comments', async () => {
    const { post, schemaPath } = await setup()
    const text = '/// 日本語のコメント\nmodel User {\n  id Nope @id\n}\n'
    expect(await post('/api/prisma/lint', { path: schemaPath, text })).toStrictEqual({
      status: 200,
      json: {
        diagnostics: [
          {
            range: { start: { line: 2, character: 5 }, end: { line: 2, character: 9 } },
            message: NOPE,
            severity: 'error',
          },
        ],
      },
    })
  })

  it('reports the hints the language server adds for ignored fields', async () => {
    const { post, schemaPath } = await setup()
    const result = await post('/api/prisma/lint', {
      path: schemaPath,
      text: 'model User {\n  id Int @id\n  legacy String @ignore\n}\n',
    })
    expect(result.status).toBe(200)
    const diagnostics = (result.json as { diagnostics: { severity: string; message: string }[] })
      .diagnostics
    expect(diagnostics.map((d) => d.severity)).toStrictEqual(['hint'])
    expect(diagnostics[0]?.message).toContain('@ignore')
  })

  it('explains a relation field on hover and says nothing elsewhere', async () => {
    const { post } = await setup()
    const hover = await post('/api/prisma/hover', { text: SCHEMA, line: 2, character: 9 })
    expect(hover.status).toBe(200)
    const { contents, range } = hover.json as { contents: string | null; range: unknown }
    // Hovering the type of a relation field shows the other model and the relation kind.
    expect(contents).toContain('model Post {')
    expect(contents).toContain('one-to-many')
    // The Prisma hover names no range; the editor underlines the word under the cursor.
    expect(range).toBeNull()
    expect(await post('/api/prisma/hover', { text: SCHEMA, line: 4, character: 0 })).toStrictEqual({
      status: 200,
      json: { contents: null, range: null },
    })
  })

  it('completes attributes with their documentation and snippets', async () => {
    const { post } = await setup()
    const text = 'model User {\n  id Int @\n}\n'
    const result = await post('/api/prisma/complete', { text, line: 1, character: 10 })
    expect(result.status).toBe(200)
    const items = (
      result.json as {
        items: {
          label: string
          kind: number | null
          insertTextFormat: string
          documentation: string | null
        }[]
      }
    ).items
    const id = items.find((i) => i.label === '@id')
    expect(id?.kind).toBe(10)
    expect(id?.insertTextFormat).toBe('snippet')
    expect(id?.documentation).toContain('Defines a single-field ID')
    expect(items.map((i) => i.label)).toContain('@unique')
  })

  it('finds the declaration of a referenced model and renames it everywhere', async () => {
    const { post, schemaPath } = await setup()
    const definition = await post('/api/prisma/definition', { text: SCHEMA, line: 2, character: 9 })
    expect(definition).toStrictEqual({
      status: 200,
      json: {
        locations: [
          {
            path: schemaPath,
            range: { start: { line: 5, character: 0 }, end: { line: 9, character: 1 } },
            selection: { start: { line: 5, character: 6 }, end: { line: 5, character: 10 } },
          },
        ],
      },
    })
    const rename = await post('/api/prisma/rename', {
      text: SCHEMA,
      line: 0,
      character: 7,
      newName: 'Account',
    })
    expect(rename.status).toBe(200)
    const changes = (rename.json as { changes: { path: string; edits: { newText: string }[] }[] })
      .changes
    expect(changes.map((c) => c.path)).toStrictEqual([schemaPath])
    expect(changes[0]?.edits.map((e) => e.newText)).toContain('Account')
  })

  it('offers to create the missing type behind an unknown-type diagnostic', async () => {
    const { post } = await setup()
    const text = 'model User {\n  id Int @id\n  role Rol\n}\n\nenum Role {\n  ADMIN\n}\n'
    const range = { start: { line: 2, character: 7 }, end: { line: 2, character: 10 } }
    const result = await post('/api/prisma/code-actions', {
      text,
      range,
      diagnostics: [
        {
          range,
          message:
            'Type "Rol" is neither a built-in type, nor refers to another model, composite type, or enum.',
          severity: 'error',
        },
      ],
    })
    expect(result.status).toBe(200)
    const actions = (
      result.json as { actions: { title: string; changes: { edits: { newText: string }[] }[] }[] }
    ).actions
    expect(actions.map((a) => a.title)).toStrictEqual([
      "Create new model 'Rol'",
      "Create new enum 'Rol'",
      "Change spelling to 'Role'",
    ])
    expect(actions[1]?.changes[0]?.edits[0]?.newText).toContain('enum Rol {')
    expect(actions[2]?.changes[0]?.edits[0]?.newText).toBe('Role')
  })

  it('offers the formatter as the fix for an incomplete relation', async () => {
    const { post, schemaPath } = await setup()
    const text = 'model User {\n  id Int @id\n}\n\nmodel Post {\n  id Int @id\n  author User\n}\n'
    const range = { start: { line: 6, character: 2 }, end: { line: 6, character: 13 } }
    const result = await post('/api/prisma/code-actions', {
      text,
      range,
      diagnostics: [
        {
          range,
          message:
            'Error validating field `author` in model `Post`: The relation field `author` on model `Post` is missing an opposite relation field on the model `User`. Either run `prisma format` or add it manually.',
          severity: 'error',
        },
      ],
    })
    expect(result.status).toBe(200)
    const actions = (
      result.json as {
        actions: {
          title: string
          isPreferred: boolean
          changes: { path: string; edits: { range: { start: unknown }; newText: string }[] }[]
        }[]
      }
    ).actions
    // The language server adds the opposite field; formatting removes the error, so the
    // formatter is offered as the preferred fix.
    expect(actions.map((a) => [a.title, a.isPreferred])).toStrictEqual([
      ['Add missing relation field to model User', false],
      ['Format with Prisma (fixes 1 error)', true],
    ])
    const edit = actions[1]?.changes[0]?.edits[0]
    expect(actions[1]?.changes[0]?.path).toBe(schemaPath)
    expect(edit?.range.start).toStrictEqual({ line: 0, character: 0 })
    expect(edit?.newText).toMatch(/posts\s+Post\[\]/u)
    expect(edit?.newText).toMatch(
      /author\s+User\s+@relation\(fields: \[userId\], references: \[id\]\)/u,
    )
    expect(edit?.newText).toMatch(/userId\s+Int/u)
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
            kind: 13,
            detail: 'Delete the child records when the parent record is deleted.',
            documentation: null,
            insertText: 'Cascade',
            insertTextFormat: 'plainText',
            sortText: null,
          },
          {
            label: 'Restrict',
            kind: 13,
            detail: 'Prevent deleting a parent record as long as it is referenced.',
            documentation: null,
            insertText: 'Restrict',
            insertTextFormat: 'plainText',
            sortText: null,
          },
          {
            label: 'NoAction',
            kind: 13,
            detail: 'Prevent deleting a parent record as long as it is referenced.',
            documentation: null,
            insertText: 'NoAction',
            insertTextFormat: 'plainText',
            sortText: null,
          },
          {
            label: 'SetNull',
            kind: 13,
            detail: 'Set the referencing fields to NULL when the referenced record is deleted.',
            documentation: null,
            insertText: 'SetNull',
            insertTextFormat: 'plainText',
            sortText: null,
          },
          {
            label: 'SetDefault',
            kind: 13,
            detail:
              "Set the referencing field's value to the default when the referenced record is deleted.",
            documentation: null,
            insertText: 'SetDefault',
            insertTextFormat: 'plainText',
            sortText: null,
          },
        ],
      },
    })
    const negative = await post('/api/prisma/complete', { text: SCHEMA, line: -1, character: 0 })
    expect(negative.status).toBe(422)
  })
})
