import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../file/index.js'
import { migrationsStamp, resolveMigrationsDir } from './migrations-dir.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-migrations-dir-'))
  dirs.push(dir)
  return dir
}

describe('resolveMigrationsDir', () => {
  it('takes migrations.path relative to prisma.config.ts, and migrations beside the schema without one', async () => {
    const project = tmp()
    const schemaDir = path.join(project, 'prisma')
    mkdirSync(schemaDir)
    const resolve = () =>
      Effect.runPromise(
        resolveMigrationsDir({ cwd: project, schemaDir }).pipe(Effect.provide(fileSystemLayer)),
      )
    expect(await resolve()).toBe(path.join(schemaDir, 'migrations'))
    writeFileSync(
      path.join(project, 'prisma.config.ts'),
      "export default { schema: 'prisma/schema.prisma', migrations: { path: 'db/migrations' } }\n",
    )
    expect(await resolve()).toBe(path.join(project, 'db', 'migrations'))
  })
})

describe('migrationsStamp', () => {
  it('changes with a migration added or edited, and reads a directory that is not there as empty', async () => {
    const base = path.join(tmp(), 'migrations')
    const stamp = () =>
      Effect.runPromise(migrationsStamp(base).pipe(Effect.provide(fileSystemLayer)))
    const empty = await stamp()
    expect(await stamp()).toBe(empty)
    mkdirSync(path.join(base, '20260101000000_init'), { recursive: true })
    writeFileSync(path.join(base, '20260101000000_init', 'migration.sql'), 'SELECT 1;\n')
    const added = await stamp()
    expect(added).not.toBe(empty)
    expect(added).toContain('20260101000000_init=')
    writeFileSync(path.join(base, '20260101000000_init', 'migration.sql'), 'SELECT 1;\nSELECT 2;\n')
    expect(await stamp()).not.toBe(added)
    // A directory that is not a migration's is no part of it.
    mkdirSync(path.join(base, 'notes'))
    const withNotes = await stamp()
    expect(await stamp()).toBe(withNotes)
  })
})
