import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vite-plus/test'

const harness = resolve(import.meta.dirname, '..', 'harness', 'django')
// Entry-point scripts in .venv/bin bake in an absolute shebang, so everything
// goes through `python -m` — that keeps working if the checkout moves.
const python = join(harness, '.venv', 'bin', 'python')
const hasPython = spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0

describe('django', () => {
  // Skipping keeps `vp test` runnable without Python installed; a CI leg that
  // silently skipped would be a false green.
  it.runIf(!!process.env.CI)('the Python toolchain is installed', () => {
    expect(hasPython).toBe(true)
  })

  beforeAll(() => {
    if (!hasPython) return
    // Idempotent: creates the venv, and refreshes its interpreter links when
    // one already exists.
    const created = spawnSync('python3', ['-m', 'venv', '.venv'], {
      cwd: harness,
      stdio: 'inherit',
    })
    expect(created.status).toBe(0)

    const installed = spawnSync(
      python,
      ['-m', 'pip', 'install', '--quiet', '-r', 'requirements.txt'],
      { cwd: harness, stdio: 'inherit' },
    )
    expect(installed.status).toBe(0)
  })

  it.skipIf(!hasPython)('generated models parse', () => {
    const result = spawnSync('python3', ['-m', 'py_compile', 'app/models.py'], {
      cwd: harness,
      stdio: 'inherit',
    })
    expect(result.status).toBe(0)
  })

  // django-stubs resolves fields, managers and relations through its mypy
  // plugin, so the generated model declarations are checked against the real
  // Django ORM API under --strict.
  it.skipIf(!hasPython)('type-checks against the real Django API', () => {
    const result = spawnSync(
      python,
      ['-m', 'mypy', '--config-file', 'mypy.ini', 'app/models.py', 'smoke.py'],
      { cwd: harness, stdio: 'inherit' },
    )
    expect(result.status).toBe(0)
  })

  // System checks, migration serialization, offline PostgreSQL DDL and model
  // instantiation catch what a type check cannot: a field name Django rejects,
  // a default the migration writer cannot serialize, a related_name clash.
  it.skipIf(!hasPython)('passes system checks and serializes migrations', () => {
    const result = spawnSync(python, ['smoke.py'], { cwd: harness, stdio: 'inherit' })
    expect(result.status).toBe(0)
  })
})
