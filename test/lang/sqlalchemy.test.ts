import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vite-plus/test'

const harness = resolve(import.meta.dirname, '..', 'harness', 'sqlalchemy')
// Entry-point scripts in .venv/bin bake in an absolute shebang, so everything
// goes through `python -m` — that keeps working if the checkout moves.
const python = join(harness, '.venv', 'bin', 'python')
const hasPython = spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0

describe('sqlalchemy', () => {
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
    const result = spawnSync('python3', ['-m', 'py_compile', 'models.py'], {
      cwd: harness,
      stdio: 'inherit',
    })
    expect(result.status).toBe(0)
  })

  // SQLAlchemy 2.0 ships PEP 561 stubs, so mypy --strict checks the generated
  // Mapped[] / mapped_column() declarations against the real ORM API.
  it.skipIf(!hasPython)('type-checks against the real SQLAlchemy API', () => {
    const result = spawnSync(
      python,
      ['-m', 'mypy', '--config-file', 'mypy.ini', 'models.py', 'smoke.py'],
      { cwd: harness, stdio: 'inherit' },
    )
    expect(result.status).toBe(0)
  })

  // Resolving the mappers, emitting PostgreSQL DDL and inserting into SQLite
  // catches what a type check cannot: a relationship whose join condition is
  // ambiguous only once the registry is configured.
  it.skipIf(!hasPython)('loads and runs against a live engine', () => {
    const result = spawnSync(python, ['smoke.py'], { cwd: harness, stdio: 'inherit' })
    expect(result.status).toBe(0)
  })
})
