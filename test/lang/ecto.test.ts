import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vite-plus/test'

const harness = resolve(import.meta.dirname, '..', 'harness', 'ecto')
const hasMix = spawnSync('mix', ['--version'], { stdio: 'ignore' }).status === 0

describe('ecto', () => {
  // Skipping keeps `vp test` runnable without Elixir installed; a CI leg that
  // silently skipped would be a false green.
  it.runIf(!!process.env.CI)('the Elixir toolchain is installed', () => {
    expect(hasMix).toBe(true)
  })

  beforeAll(() => {
    if (!hasMix) return
    // telemetry is an Erlang dep; without rebar3 mix blocks on an install
    // prompt. CI pre-installs a pinned rebar3 (setup-beam rebar3-version), so
    // these only fetch on a first local run.
    for (const task of ['local.hex', 'local.rebar']) {
      spawnSync('mix', [task, '--force', '--if-missing'], { cwd: harness, stdio: 'inherit' })
    }
    const deps = spawnSync('mix', ['deps.get'], { cwd: harness, stdio: 'inherit' })
    expect(deps.status).toBe(0)
  })

  it.skipIf(!hasMix)('generated schemas parse', () => {
    const result = spawnSync(
      'elixir',
      [
        '-e',
        'for f <- Path.wildcard("lib/*.ex"), do: Code.string_to_quoted!(File.read!(f), file: f)',
      ],
      { cwd: harness, stdio: 'inherit' },
    )
    expect(result.status).toBe(0)
  })

  // mix compile expands the generated `use Ecto.Schema` / schema/2 DSL against
  // the real Ecto API, catching reserved-word collisions, bad field types and
  // malformed associations.
  it.skipIf(!hasMix)('compiles against the real Ecto API', () => {
    const result = spawnSync('mix', ['compile', '--force'], { cwd: harness, stdio: 'inherit' })
    expect(result.status).toBe(0)
  })
})
