import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

const harness = resolve(import.meta.dirname, '..', 'harness', 'gorm')
const hasGo = spawnSync('go', ['version'], { stdio: 'ignore' }).status === 0
const env = { ...process.env, CGO_ENABLED: '0' }

describe('gorm', () => {
  // Skipping keeps `vp test` runnable without Go installed; a CI leg that
  // silently skipped would be a false green.
  it.runIf(!!process.env.CI)('the Go toolchain is installed', () => {
    expect(hasGo).toBe(true)
  })

  it.skipIf(!hasGo)('generated models parse', () => {
    const result = spawnSync('gofmt', ['-e', join('model', 'models.go')], {
      cwd: harness,
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    expect(result.status).toBe(0)
  })

  // model/use.go pins the invariants a compile alone would miss: a scalar list
  // stays a slice, a self-relation stays a pointer, an optional scalar stays a
  // pointer.
  it.skipIf(!hasGo)('compiles against the real GORM API', () => {
    const result = spawnSync('go', ['build', '-mod=readonly', './model/'], {
      cwd: harness,
      stdio: 'inherit',
      env,
    })
    expect(result.status).toBe(0)
  })

  it.skipIf(!hasGo)('passes go vet', () => {
    const result = spawnSync('go', ['vet', '-mod=readonly', './model/'], {
      cwd: harness,
      stdio: 'inherit',
      env,
    })
    expect(result.status).toBe(0)
  })

  // The same schema on SQLite and MySQL (test/lang/setup.ts), each a package of its own.
  it.skipIf(!hasGo)('compiles and vets the SQLite and MySQL output', () => {
    for (const command of ['build', 'vet']) {
      const result = spawnSync(
        'go',
        [command, '-mod=readonly', './variants/sqlite/', './variants/mysql/'],
        { cwd: harness, stdio: 'inherit', env },
      )
      expect(result.status).toBe(0)
    }
  })
})
