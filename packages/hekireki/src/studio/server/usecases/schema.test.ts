import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { createStudioState } from '../services/index.js'
import { loadSnapshot } from './schema.js'

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

function schemaFile() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, SCHEMA)
  return schemaPath
}

const USER = `model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
}
`

const POST = `model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}
`

function schemaDirectory(files: Readonly<Record<string, string>>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content)
  return dir
}

const reload = (state: ReturnType<typeof createStudioState>) =>
  Effect.runPromise(loadSnapshot({ state }))

describe('loadSnapshot', () => {
  it('reports a read error while keeping the schema empty', async () => {
    const state = createStudioState({ schemaPath: '/nowhere/schema.prisma' })
    const before = Date.now()
    const snapshot = await reload(state)
    expect(snapshot).toStrictEqual({
      schema: null,
      error:
        'Schema not found: /nowhere/schema.prisma\n   Pass --schema <path> pointing at your schema.prisma or a directory of .prisma files.',
      diagnostics: [],
      updatedAt: snapshot.updatedAt,
      files: [],
    })
    expect(Date.parse(snapshot.updatedAt)).toBeGreaterThanOrEqual(before)
  })

  it('keeps the last good schema when a reload fails, but advances updatedAt', async () => {
    const schemaPath = schemaFile()
    const state = createStudioState({ schemaPath })
    const good = await reload(state)
    expect(good.error).toBeNull()
    writeFileSync(schemaPath, 'model User {\n  id Nope @id\n}\n')
    const broken = await reload(state)
    expect(broken).toStrictEqual({
      schema: good.schema,
      error: `error: Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.\n  -->  ${schemaPath}:2\n   | \n 1 | model User {\n 2 |   id Nope @id\n   | \n\nValidation Error Count: 1`,
      diagnostics: [
        {
          path: schemaPath,
          range: { start: { line: 1, character: 5 }, end: { line: 1, character: 9 } },
          message:
            'Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.',
          severity: 'error',
        },
      ],
      updatedAt: broken.updatedAt,
      files: [{ path: schemaPath, content: 'model User {\n  id Nope @id\n}\n' }],
    })
    expect(Date.parse(broken.updatedAt)).toBeGreaterThanOrEqual(Date.parse(good.updatedAt))
    expect(state.snapshot()).toBe(broken)
  })

  it('clears the error once the schema parses again', async () => {
    const schemaPath = schemaFile()
    const state = createStudioState({ schemaPath })
    await reload(state)
    writeFileSync(schemaPath, 'model User {\n  id Nope @id\n}\n')
    const broken = await reload(state)
    expect(broken.error).not.toBeNull()
    writeFileSync(schemaPath, SCHEMA)
    const fixed = await reload(state)
    expect(fixed.error).toBeNull()
    expect(fixed.schema?.models.map((m) => m.name)).toStrictEqual(['User'])
  })

  it('reads the files of a directory as one datamodel, with relations across them', async () => {
    const dir = schemaDirectory({ 'post.prisma': POST, 'user.prisma': USER })
    const snapshot = await reload(createStudioState({ schemaPath: dir }))
    expect(snapshot.error).toBeNull()
    expect(snapshot.schema?.models.map((m) => m.name)).toStrictEqual(['Post', 'User'])
    expect(snapshot.schema?.relations).toStrictEqual([
      {
        id: 'User.id->Post.authorId',
        name: 'PostToUser',
        origin: 'inferred',
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'authorId', cardinality: 'zero-many' },
        onDelete: null,
        onUpdate: null,
      },
    ])
  })

  it('reads the provider off the engine and the block locations off the language server', async () => {
    const dir = schemaDirectory({
      'a.prisma': `datasource db {\n  provider = "mysql"\n}\n\n${USER}`,
      'b.prisma': `${POST}\nenum Role {\n  ADMIN\n}\n`,
    })
    const snapshot = await reload(createStudioState({ schemaPath: dir }))
    const file = (name: string) => path.join(dir, name)
    expect(snapshot.schema?.provider).toBe('mysql')
    expect(snapshot.schema?.models.map((m) => [m.name, m.location])).toStrictEqual([
      ['User', { file: file('a.prisma'), line: 5 }],
      ['Post', { file: file('b.prisma'), line: 1 }],
    ])
    expect(snapshot.schema?.enums.map((e) => e.location)).toStrictEqual([
      { file: file('b.prisma'), line: 7 },
    ])
    expect(snapshot.diagnostics).toStrictEqual([])
  })

  it('keeps the snapshot it has when the files have not changed', async () => {
    const state = createStudioState({ schemaPath: schemaFile() })
    const first = await reload(state)
    expect(await reload(state)).toBe(first)
    expect(state.snapshot()).toBe(first)
  })
})
