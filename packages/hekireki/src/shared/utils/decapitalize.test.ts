import { describe, expect, it } from 'vitest'
import { decapitalize } from './decapitalize.js'

// Test run
// pnpm vitest run ./src/shared/utils/decapitalize.test.ts

describe('decapitalize Test', () => {
  it.concurrent(`decapitalize('test') -> 'test'`, () => {
    const result = decapitalize('test')
    const expected = 'test'
    expect(result).toBe(expected)
  })
  it.concurrent(`decapitalize('Test') -> 'test'`, () => {
    const result = decapitalize('Test')
    const expected = 'test'
    expect(result).toBe(expected)
  })
})
