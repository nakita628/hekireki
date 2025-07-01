import { describe, it, expect } from 'vitest'
import { infer, properties, schema, schemas, zod } from '.'

// Test run
// pnpm vitest run ./src/generator/zod/generator/index.test.ts

describe('zod generator exports', () => {
  it('should export infer', () => {
    expect(typeof infer).toBe('function')
  })
  it('should export properties', () => {
    expect(typeof properties).toBe('function')
  })
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
