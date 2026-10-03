import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { prismaSchemaPath } from './path.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function project(files: Readonly<Record<string, string>>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-schema-path-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), content)
  }
  return dir
}

function found(dir: string) {
  return Effect.runPromise(prismaSchemaPath(dir).pipe(Effect.provide(NodeFileSystem.layer)))
}

const MODEL = 'model User {\n  id Int @id\n}\n'

// The schema Prisma itself reads when the command names none.
describe('prismaSchemaPath', () => {
  it('takes the schema prisma.config.ts names, from the directory of the config', async () => {
    const dir = project({
      'prisma.config.ts':
        "import { defineConfig } from 'prisma/config'\n\nexport default defineConfig({\n  schema: 'db/schema',\n})\n",
      'db/schema/main.prisma': MODEL,
      'prisma/schema.prisma': MODEL,
    })
    expect(await found(dir)).toBe(path.join(dir, 'db', 'schema'))
  })

  // Prisma resolves the path from the config file's own directory, wherever the file is.
  it('reads a config under .config, the path taken from that directory', async () => {
    const dir = project({
      '.config/prisma.mjs': "export default { schema: '../db/schema.prisma' }\n",
      'db/schema.prisma': MODEL,
    })
    expect(await found(dir)).toBe(path.join(dir, 'db', 'schema.prisma'))
  })

  it('takes prisma7.config before prisma.config, as Prisma does', async () => {
    const dir = project({
      'prisma7.config.ts': "export default { schema: 'seven.prisma' }\n",
      'prisma.config.ts': "export default { schema: 'legacy.prisma' }\n",
    })
    expect(await found(dir)).toBe(path.join(dir, 'seven.prisma'))
  })

  it('names the schema prisma.config.ts gives even when it is not there', async () => {
    const dir = project({
      'prisma.config.ts': 'export default defineConfig({ schema: "missing.prisma" })\n',
      'schema.prisma': MODEL,
    })
    expect(await found(dir)).toBe(path.join(dir, 'missing.prisma'))
  })

  it('falls back to the default paths, prisma/schema.prisma first', async () => {
    const dir = project({
      'prisma.config.ts':
        'export default defineConfig({\n  datasource: { url: env("DATABASE_URL") },\n})\n',
      'prisma/schema.prisma': MODEL,
      'schema.prisma': MODEL,
    })
    expect(await found(dir)).toBe(path.join(dir, 'prisma', 'schema.prisma'))
  })

  it('finds nothing where there is no schema', async () => {
    expect(await found(project({}))).toBeNull()
  })
})
