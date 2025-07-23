import { describe, expect, it } from 'vitest'
import { inferInput, properties, schema, schemas, valibot } from '.'

// Test run
// pnpm vitest run ./src/generator/valibot/generator/index.test.ts

describe('valibot generator exports', () => {
  it('should export inferInput', () => {
    expect(typeof inferInput).toBe('function')
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

  it('should export valibot', () => {
    expect(typeof valibot).toBe('function')
  })
})
