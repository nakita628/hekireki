import { describe, it, expect } from 'vitest'
import { capitalize, decapitalize, snakeCase } from '.'

// Test run
// pnpm vitest run ./src/shared/utils/index.test.ts

describe('shared utils barrel file exports', () => {
  it('should export capitalize', () => {
    expect(typeof capitalize).toBe('function')
  })
  it('should export decapitalize', () => {
    expect(typeof decapitalize).toBe('function')
  })
  it('should export snakeCase', () => {
    expect(typeof snakeCase).toBe('function')
  })
})
