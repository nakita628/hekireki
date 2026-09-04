import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import type { FileSystem } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { parseSchemaFiles, readSchemaFiles } from './load.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function run<A, E extends { readonly message: string }>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem>,
) {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(fileSystemLayer),
      Effect.match({
        onSuccess: (value) => ({ ok: true, value }) as const,
        onFailure: (error) => ({ ok: false, error: error.message }) as const,
      }),
    ),
  )
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

describe('readSchemaFiles', () => {
  it('keeps an absolute path for a schema outside the working directory', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-'))
    dirs.push(dir)
    const file = path.join(dir, 'schema.prisma')
    writeFileSync(file, USER)
    expect(await run(readSchemaFiles({ schemaPath: file }))).toStrictEqual({
      ok: true,
      value: [{ path: file, content: USER }],
    })
  })

  it('reports a cwd-relative path for a schema inside the working directory', async () => {
    const dir = mkdtempSync(path.join(process.cwd(), '.hekireki-studio-test-'))
    dirs.push(dir)
    const file = path.join(dir, 'schema.prisma')
    writeFileSync(file, USER)
    expect(await run(readSchemaFiles({ schemaPath: file }))).toStrictEqual({
      ok: true,
      value: [{ path: `${path.basename(dir)}/schema.prisma`, content: USER }],
    })
  })

  it('reads every .prisma file of a directory in name order', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-'))
    dirs.push(dir)
    writeFileSync(path.join(dir, 'post.prisma'), POST)
    writeFileSync(path.join(dir, 'user.prisma'), USER)
    writeFileSync(path.join(dir, 'README.md'), 'ignored')
    expect(await run(readSchemaFiles({ schemaPath: dir }))).toStrictEqual({
      ok: true,
      value: [
        { path: path.join(dir, 'post.prisma'), content: POST },
        { path: path.join(dir, 'user.prisma'), content: USER },
      ],
    })
  })

  it('fails for a directory without .prisma files', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-'))
    dirs.push(dir)
    mkdirSync(path.join(dir, 'empty'))
    expect(await run(readSchemaFiles({ schemaPath: path.join(dir, 'empty') }))).toStrictEqual({
      ok: false,
      error: `No .prisma files found in ${path.join(dir, 'empty')}\n   Add a schema.prisma file or pass --schema <path>.`,
    })
  })

  it('fails for a missing path', async () => {
    expect(
      await run(readSchemaFiles({ schemaPath: '/definitely/missing/schema.prisma' })),
    ).toStrictEqual({
      ok: false,
      error:
        'Schema not found: /definitely/missing/schema.prisma\n   Pass --schema <path> pointing at your schema.prisma or a directory of .prisma files.',
    })
  })
})

describe('parseSchemaFiles', () => {
  it('parses multiple files as one datamodel', async () => {
    const result = await run(
      parseSchemaFiles({
        files: [
          { path: 'post.prisma', content: POST },
          { path: 'user.prisma', content: USER },
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.schema.models.map((m) => m.name)).toStrictEqual(['Post', 'User'])
      expect(result.value.dmmf.datamodel.models.map((m) => m.name)).toStrictEqual(['Post', 'User'])
      expect(result.value.schema.relations).toStrictEqual([
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
    }
  })

  it('fails with the Prisma validation message without ANSI colors', async () => {
    expect(
      await run(
        parseSchemaFiles({
          files: [{ path: 'prisma/schema.prisma', content: 'model A {\n  id Int @id\n  b B\n}\n' }],
        }),
      ),
    ).toStrictEqual({
      ok: false,
      error:
        'error: Type "B" is neither a built-in type, nor refers to another model, composite type, or enum.\n  -->  prisma/schema.prisma:3\n   | \n 2 |   id Int @id\n 3 |   b B\n   | \n\nValidation Error Count: 1',
    })
  })
})

describe('parseSchemaFiles across files', () => {
  it('reads the provider, the block locations and the diagnostics off the engine', async () => {
    const files = [
      { path: 'a.prisma', content: `datasource db {\n  provider = "mysql"\n}\n\n${USER}` },
      { path: 'b.prisma', content: `${POST}\nenum Role {\n  ADMIN\n}\n` },
    ]
    const result = await run(parseSchemaFiles({ files }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.schema.provider).toBe('mysql')
      expect(result.value.schema.models.map((m) => [m.name, m.location])).toStrictEqual([
        ['User', { file: 'a.prisma', line: 5 }],
        ['Post', { file: 'b.prisma', line: 1 }],
      ])
      expect(result.value.schema.enums.map((e) => e.location)).toStrictEqual([
        { file: 'b.prisma', line: 7 },
      ])
      expect(result.value.diagnostics).toStrictEqual([])
    }
  })
})
