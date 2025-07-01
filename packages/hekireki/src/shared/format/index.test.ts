import { describe, expect, it } from 'vitest'
import { fmt } from '.'

// Test run
// pnpm vitest run ./src/shared/format/index.test.ts

describe('fmt', () => {
  it.concurrent('fmt Test', async () => {
    const result = await fmt('const hekireki = "hekireki";')
    const expected = `const hekireki = 'hekireki'
`
    expect(result).toBe(expected)
  })
})
