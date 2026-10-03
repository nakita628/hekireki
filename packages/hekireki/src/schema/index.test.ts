import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { parseSchema, readSchemaFiles } from './index.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

// hekireki seed, hekireki migrate and Studio read a schema directory as Prisma does: down through
// its subdirectories, so `User.posts` finds the Post kept in `models/`.
describe('readSchemaFiles', () => {
  it('reads the .prisma files of a directory and its subdirectories', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-schema-'))
    dirs.push(dir)
    mkdirSync(path.join(dir, 'models'))
    writeFileSync(
      path.join(dir, 'main.prisma'),
      'datasource db {\n  provider = "sqlite"\n}\nmodel User {\n  id    Int    @id\n  posts Post[]\n}\n',
    )
    writeFileSync(
      path.join(dir, 'models', 'post.prisma'),
      'model Post {\n  id     Int  @id\n  userId Int\n  user   User @relation(fields: [userId], references: [id])\n}\n',
    )
    const models = await Effect.runPromise(
      Effect.gen(function* () {
        const files = yield* readSchemaFiles(dir)
        const { dmmf } = yield* parseSchema(files)
        return {
          files: files.map((f) => path.relative(dir, f.path)),
          models: dmmf.datamodel.models.map((m) => m.name),
        }
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    )
    expect(models).toStrictEqual({
      files: ['main.prisma', path.join('models', 'post.prisma')],
      models: ['User', 'Post'],
    })
  })
})
