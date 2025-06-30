import { describe, expect, it } from 'vitest'
import { infer } from './infer.js'

// Test run
// pnpm vitest run ./src/generator/zod/generator/infer.test.ts

describe('infer', () => {
  it.concurrent('infer test', () => {
    const result = infer('User')
    const expected = `export type User = z.infer<typeof UserSchema>`
    expect(result).toBe(expected)
  })
})
