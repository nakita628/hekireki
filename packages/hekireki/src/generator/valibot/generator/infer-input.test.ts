import { describe, expect, it } from 'vitest'
import { inferInput } from '.'

// Test run
// pnpm vitest run ./src/generator/valibot/generator/infer-input.test.ts

describe('inferInput', () => {
  it.concurrent('inferInput test', () => {
    const result = inferInput('User')
    const expected = 'export type User = v.InferInput<typeof UserSchema>'
    expect(result).toBe(expected)
  })
})
