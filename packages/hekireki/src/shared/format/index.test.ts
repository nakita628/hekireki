import { describe, expect, it } from 'vitest'
import { fmt } from '.'

// Test run
// pnpm vitest run ./src/shared/format/index.test.ts

describe('fmt', () => {
  it.concurrent('fmt Test', async () => {
    const result = await fmt('const hekireki = "hekireki";')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(`const hekireki = 'hekireki'\n`)
    }
  })

  it.concurrent('fmt error Test', async () => {
    const result = await fmt('const x = {')
    expect(result.ok).toBe(false)
  })
})
