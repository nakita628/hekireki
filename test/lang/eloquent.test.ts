import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vite-plus/test'

const harness = resolve(import.meta.dirname, '..', 'harness', 'eloquent')
const hasPhp = spawnSync('php', ['--version'], { stdio: 'ignore' }).status === 0
const hasComposer = spawnSync('composer', ['--version'], { stdio: 'ignore' }).status === 0

describe('eloquent', () => {
  // Skipping keeps `vp test` runnable without PHP installed; a CI leg that
  // silently skipped would be a false green.
  it.runIf(!!process.env.CI)('the PHP toolchain is installed', () => {
    expect({ php: hasPhp, composer: hasComposer }).toStrictEqual({ php: true, composer: true })
  })

  beforeAll(() => {
    if (!hasComposer) return
    const installed = spawnSync('composer', ['install', '--quiet', '--no-interaction'], {
      cwd: harness,
      stdio: 'inherit',
    })
    expect(installed.status).toBe(0)
  })

  it.skipIf(!hasPhp)('generated models parse', () => {
    const models = join(harness, 'models')
    const files = readdirSync(models).filter((f) => f.endsWith('.php'))
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const result = spawnSync('php', ['-l', join(models, file)], {
        cwd: harness,
        stdio: ['ignore', 'ignore', 'inherit'],
      })
      expect(result.status).toBe(0)
    }
  })

  // smoke.php instantiates every model and resolves its casts, so a bad
  // $casts entry or an unknown relation method fails here.
  it.skipIf(!hasPhp || !hasComposer)('loads against the real Eloquent API', () => {
    const result = spawnSync('php', ['smoke.php'], { cwd: harness, stdio: 'inherit' })
    expect(result.status).toBe(0)
  })
})
