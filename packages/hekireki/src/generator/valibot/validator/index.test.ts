import { describe, it, expect } from 'vitest'
import { isValibotDocument, isValibot } from '.'

// Test run
// pnpm vitest run ./src/generator/valibot/validator/index.test.ts

describe('valibot validator exports', () => {
  it('should export isValibotDocument', () => {
    expect(typeof isValibotDocument).toBe('function')
  })

  it('should export isValibot', () => {
    expect(typeof isValibot).toBe('function')
  })
})
