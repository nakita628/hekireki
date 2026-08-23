import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

const root = resolve(import.meta.dirname, '..', '..')
const harness = join(root, 'test', 'harness', 'kysely')
const bin = join(root, 'packages', 'hekireki', 'node_modules', '.bin')

describe('kysely', () => {
  // tsc --strict covers the generated DB interface against the real kysely
  // API, plus the smoke.ts invariants (Generated unwraps on select and goes
  // optional on insert, Timestamp selects as Date, enum columns stay unions
  // of the @map-ped database values, @@map/@map names key the DB interface,
  // and the implicit m2m join tables exist).
  it('type-checks against the real kysely API', () => {
    const result = spawnSync(join(bin, 'tsc'), ['--noEmit', '-p', harness], { stdio: 'inherit' })
    expect(result.status).toBe(0)
  })
})
