import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, describe, expect, it } from 'vite-plus/test'

const root = resolve(import.meta.dirname, '..', '..')
const harness = join(root, 'test', 'harness', 'drizzle')
const bin = join(root, 'packages', 'hekireki', 'node_modules', '.bin')
const out = mkdtempSync(join(tmpdir(), 'hekireki-drizzle-kit-'))

describe('drizzle', () => {
  afterAll(() => {
    rmSync(out, { recursive: true, force: true })
  })

  // tsc --strict covers syntax and type against the real drizzle-orm API, plus
  // the smoke.ts invariants (a scalar list stays an array, an optional column
  // stays `T | null`, a BigInt column infers bigint, an enum column stays a
  // value union of the @map-ped database values).
  it('type-checks against the real drizzle-orm API', () => {
    const result = spawnSync(join(bin, 'tsc'), ['--noEmit', '-p', harness], { stdio: 'inherit' })
    expect(result.status).toBe(0)
  })

  // An inline pgEnum type-checks but emits a migration referencing a type it
  // never creates, so the schema also has to survive migration generation.
  // drizzle-kit exits 0 even when snapshot serialization crashes (a bigint
  // default, say), leaving no migration behind — the .sql file is the proof.
  it('generates migration SQL', () => {
    const result = spawnSync(
      join(bin, 'drizzle-kit'),
      [
        'generate',
        '--dialect=postgresql',
        `--schema=${join(harness, 'schema.ts')}`,
        `--out=${out}`,
      ],
      { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
    )
    expect(result.status).toBe(0)
    expect(readdirSync(out).filter((f) => f.endsWith('.sql')).length).toBeGreaterThan(0)
  })
})
