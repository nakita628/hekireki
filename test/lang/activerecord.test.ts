import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vite-plus/test'

const harness = resolve(import.meta.dirname, '..', 'harness', 'activerecord')
const hasRuby = spawnSync('ruby', ['--version'], { stdio: 'ignore' }).status === 0

describe('activerecord', () => {
  // Skipping keeps `vp test` runnable without Ruby installed; a CI leg that
  // silently skipped would be a false green.
  it.runIf(!!process.env.CI)('the Ruby toolchain is installed', () => {
    expect(hasRuby).toBe(true)
  })

  beforeAll(() => {
    if (!hasRuby) return
    spawnSync('bundle', ['config', 'set', '--local', 'path', 'vendor/bundle'], {
      cwd: harness,
      stdio: 'inherit',
    })
    const installed = spawnSync('bundle', ['install', '--quiet'], {
      cwd: harness,
      stdio: 'inherit',
    })
    expect(installed.status).toBe(0)
  })

  it.skipIf(!hasRuby)('generated models parse', () => {
    const models = join(harness, 'models')
    const files = readdirSync(models).filter((f) => f.endsWith('.rb'))
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const result = spawnSync('ruby', ['-c', join(models, file)], {
        cwd: harness,
        stdio: ['ignore', 'ignore', 'inherit'],
      })
      expect(result.status).toBe(0)
    }
  })

  // smoke.rb loads every model and walks its reflections, so a malformed
  // association or an unknown column option fails here rather than silently
  // string-matching in a unit test.
  it.skipIf(!hasRuby)('loads against the real Active Record API', () => {
    const result = spawnSync('bundle', ['exec', 'ruby', 'smoke.rb'], {
      cwd: harness,
      stdio: 'inherit',
    })
    expect(result.status).toBe(0)
  })
})
