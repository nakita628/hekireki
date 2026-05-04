import { describe, expect, it } from 'vite-plus/test'

import { fmt } from './index.js'

// Test run
// pnpm vitest run ./src/format/index.test.ts

describe('fmt', () => {
  it.concurrent('formats valid TypeScript code', async () => {
    const result = await fmt('const hekireki = "hekireki";')
    expect(result).toStrictEqual({ ok: true, value: `const hekireki = 'hekireki'\n` })
  })

  it.concurrent('returns err on invalid syntax', async () => {
    const result = await fmt('const x = {')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.error).toBe('string')
      expect(result.error.length > 0).toBe(true)
    }
  })
})
