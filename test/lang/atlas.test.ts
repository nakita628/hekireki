import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

const harness = resolve(import.meta.dirname, '..', 'harness', 'atlas')
const hasAtlas = spawnSync('atlas', ['version'], { stdio: 'ignore' }).status === 0
const hasDocker = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0

describe('atlas', () => {
  // Skipping keeps `vp test` runnable without the Atlas CLI installed; a CI
  // leg that silently skipped would be a false green.
  it.runIf(!!process.env.CI)('the Atlas CLI and Docker are installed', () => {
    expect(hasAtlas).toBe(true)
    expect(hasDocker).toBe(true)
  })

  // `atlas schema fmt` parses the HCL (a parse error fails the run) and
  // rewrites it in canonical hclfmt style; requiring a byte-identical result
  // proves the generator's own `=` alignment already matches `atlas schema
  // fmt` output.
  it.skipIf(!hasAtlas)('generated HCL parses and is already hclfmt-canonical', () => {
    const before = readFileSync(join(harness, 'schema.hcl'), 'utf8')
    const result = spawnSync('atlas', ['schema', 'fmt', 'schema.hcl'], {
      cwd: harness,
      stdio: 'inherit',
    })
    expect(result.status).toBe(0)
    const after = readFileSync(join(harness, 'schema.hcl'), 'utf8')
    expect(after).toBe(before)
  })

  // Replays the HCL against Atlas's migration engine on a disposable dev
  // database: unknown column types, dangling column/table references, and
  // invalid default expressions all fail here, not just syntax.
  it.skipIf(!(hasAtlas && hasDocker))('applies to a real PostgreSQL dev database', () => {
    const result = spawnSync(
      'atlas',
      [
        'schema',
        'inspect',
        '--url',
        'file://schema.hcl',
        '--dev-url',
        'docker://postgres/17/dev',
        '--format',
        '{{ sql . }}',
      ],
      { cwd: harness, stdio: 'inherit' },
    )
    expect(result.status).toBe(0)
  })
})
