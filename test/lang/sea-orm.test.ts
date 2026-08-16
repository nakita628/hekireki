import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

const harness = resolve(import.meta.dirname, '..', 'harness', 'sea-orm')
// A rustup shim answers even when the component is missing, so presence is the
// exit status rather than merely being spawnable.
const hasCargo = spawnSync('cargo', ['--version'], { stdio: 'ignore' }).status === 0
const hasRustfmt = spawnSync('rustfmt', ['--version'], { stdio: 'ignore' }).status === 0

describe('sea-orm', () => {
  // Skipping keeps `vp test` runnable without Rust installed; a CI leg that
  // silently skipped would be a false green.
  it.runIf(!!process.env.CI)('the Rust toolchain is installed', () => {
    expect({ cargo: hasCargo, rustfmt: hasRustfmt }).toStrictEqual({ cargo: true, rustfmt: true })
  })

  it.skipIf(!hasRustfmt)('generated entities parse', () => {
    const entities = join(harness, 'src', 'entities')
    const files = readdirSync(entities)
      .filter((f) => f.endsWith('.rs'))
      .map((f) => join(entities, f))
    expect(files.length).toBeGreaterThan(0)

    const result = spawnSync('rustfmt', ['--edition', '2021', '--emit=stdout', ...files], {
      cwd: harness,
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    expect(result.status).toBe(0)
  })

  // cargo check expands every DeriveEntityModel / DeriveActiveEnum /
  // DeriveRelation macro against the real sea-orm API. `-D warnings` matches
  // what setup-rust-toolchain injects in CI, so a lint in generated code (a
  // non_camel_case enum variant, say) fails locally too.
  it.skipIf(!hasCargo)('type-checks against the real sea-orm API', () => {
    const result = spawnSync('cargo', ['check', '--locked', '--quiet'], {
      cwd: harness,
      stdio: 'inherit',
      env: { ...process.env, RUSTFLAGS: '-D warnings' },
    })
    expect(result.status).toBe(0)
  })
})
