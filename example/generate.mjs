#!/usr/bin/env node
// Regenerates example/generated/ from example/schema.prisma with the built
// generators, then verifies that every generator actually produced output.
// The generated files are committed so the syntax of each target can be
// reviewed by eye; this script answers "did every generator run at all".
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const example = join(root, 'example')
const dist = join(root, 'packages/hekireki/dist/bin')

const GENERATORS = [
  'activerecord',
  'ajv',
  'arktype',
  'dbml',
  'docs',
  'drizzle',
  'ecto',
  'effect',
  'eloquent',
  'gorm',
  'kysely',
  'mermaid-er',
  'sea-orm',
  'sqlalchemy',
  'typebox',
  'valibot',
  'zod',
]

// kind 'file' checks a single non-empty file; kind 'dir' checks a directory
// containing at least one non-empty file (generators that emit 1 file per
// model or enum).
const EXPECTED = [
  { name: 'zod', kind: 'file', path: 'generated/zod/index.ts' },
  { name: 'valibot', kind: 'file', path: 'generated/valibot/index.ts' },
  { name: 'arktype', kind: 'file', path: 'generated/arktype/index.ts' },
  { name: 'effect', kind: 'file', path: 'generated/effect/index.ts' },
  { name: 'typebox', kind: 'file', path: 'generated/typebox/index.ts' },
  { name: 'ajv', kind: 'file', path: 'generated/ajv/index.ts' },
  { name: 'drizzle', kind: 'file', path: 'generated/drizzle/schema.ts' },
  { name: 'kysely', kind: 'file', path: 'generated/kysely/types.ts' },
  { name: 'sqlalchemy', kind: 'file', path: 'generated/sqlalchemy/models.py' },
  { name: 'gorm', kind: 'file', path: 'generated/gorm/models.go' },
  { name: 'sea-orm', kind: 'dir', path: 'generated/sea-orm' },
  { name: 'ecto', kind: 'dir', path: 'generated/ecto' },
  { name: 'activerecord', kind: 'dir', path: 'generated/activerecord' },
  { name: 'eloquent', kind: 'dir', path: 'generated/eloquent' },
  { name: 'mermaid-er', kind: 'file', path: 'generated/mermaid-er/ER.md' },
  { name: 'dbml', kind: 'file', path: 'generated/dbml/schema.dbml' },
  { name: 'dbml (png)', kind: 'file', path: 'generated/dbml/er.png' },
  { name: 'docs', kind: 'file', path: 'generated/docs/index.html' },
]

if (!existsSync(join(dist, 'zod.js'))) {
  console.error(
    `${dist} not found. Build the generators first: pnpm -F hekireki build (or run via pnpm example)`,
  )
  process.exit(1)
}

// prisma resolves `provider = "hekireki-zod"` by name on PATH, so the built
// bins are linked into a throwaway directory that is prepended to it.
const bin = mkdtempSync(join(tmpdir(), 'hekireki-example-bin-'))
for (const generator of GENERATORS) {
  symlinkSync(join(dist, `${generator}.js`), join(bin, `hekireki-${generator}`))
}

rmSync(join(example, 'generated'), { recursive: true, force: true })

try {
  execFileSync(
    join(root, 'packages/hekireki/node_modules/.bin/prisma'),
    ['generate', '--schema', join(example, 'schema.prisma')],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        DATABASE_URL: 'postgresql://localhost/hekireki_example',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  )
} finally {
  rmSync(bin, { recursive: true, force: true })
}

function checkFile(path) {
  return existsSync(path) && statSync(path).size > 0
}

function describe(entry) {
  const abs = join(example, entry.path)
  if (entry.kind === 'file') {
    const ok = checkFile(abs)
    return { ok, detail: ok ? `${(statSync(abs).size / 1024).toFixed(1)} kB` : 'missing or empty' }
  }
  const files = existsSync(abs)
    ? readdirSync(abs).filter((f) => checkFile(join(abs, f)))
    : []
  return {
    ok: files.length > 0,
    detail: files.length > 0 ? `${files.length} files` : 'missing or empty',
  }
}

const results = EXPECTED.map((entry) => ({ entry, ...describe(entry) }))
const width = Math.max(...EXPECTED.map((e) => e.name.length))
const pathWidth = Math.max(...EXPECTED.map((e) => e.path.length))

console.log('')
for (const { entry, ok, detail } of results) {
  console.log(
    `${ok ? '✓' : '✗'} ${entry.name.padEnd(width)}  ${entry.path.padEnd(pathWidth)}  ${detail}`,
  )
}

const failed = results.filter((r) => !r.ok)
console.log('')
if (failed.length > 0) {
  console.error(`${failed.length}/${EXPECTED.length} generators produced no output.`)
  process.exit(1)
}
console.log(`All ${EXPECTED.length} outputs generated. Inspect them under example/generated/.`)
