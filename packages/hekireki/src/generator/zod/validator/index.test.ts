import { describe, it, expect } from 'vitest'
import { isZodDocument, isZod } from '.'

// Test run
// pnpm vitest run ./src/generator/zod/validator/index.test.ts

describe('validator barrel file exports', () => {
  it('should export isZod', () => {
    expect(typeof isZod).toBe('function')
  })
  it('should export isZodDocument', () => {
    expect(typeof isZodDocument).toBe('function')
  })
})
