import { describe, expect, it } from 'vite-plus/test'

import { fmt } from './index.js'

// Test run
// pnpm vitest run ./src/format/index.test.ts

describe('fmt', () => {
  it.concurrent('formats valid TypeScript code', async () => {
    const result = await fmt('const hekireki = "hekireki";')
    expect(result).toBe(`const hekireki = 'hekireki'\n`)
  })

  it.concurrent('throws on invalid syntax', async () => {
    await expect(fmt('const x = {')).rejects.toThrow()
  })
})
