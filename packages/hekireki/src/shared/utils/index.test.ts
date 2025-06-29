import { describe, it, expect } from 'vitest'
import {
  capitalize,
} from '.'

// Test run
// pnpm vitest run ./src/shared/utils/index.test.ts

describe('string-utils barrel file exports', () => {
  it('should export capitalize', () => {
    expect(typeof capitalize).toBe('function')
  })
})