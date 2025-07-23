import { describe, expect, it } from 'vitest'
import { schema, schemas, zod } from '.'

// Test run
// pnpm vitest run ./src/generator/zod/generator/index.test.ts

describe('zod generator exports', () => {
  it('should export schema', () => {
    expect(typeof schema).toBe('function')
  })
  it('should export schemas', () => {
    expect(typeof schemas).toBe('function')
  })
  it('should export zod', () => {
    expect(typeof zod).toBe('function')
  })
})
