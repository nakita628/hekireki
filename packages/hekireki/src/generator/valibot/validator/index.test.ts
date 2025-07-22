import { describe, it, expect } from 'vitest'
import { isValibotDocument, isValibot } from '.'

// Test run
// pnpm vitest run ./src/generator/valibot/validator/index.test.ts

describe('validator', () => {
  // isValibot
  describe('isValibotDocument', () => {
    it.concurrent('isValibotDocument Test', () => {
      const result = isValibotDocument(`Unique identifier for the user
@z.uuid()
@v.pipe(v.string(), v.uuid())`)
      const expected = ['Unique identifier for the user', '@z.uuid()']
      expect(result).toStrictEqual(expected)
    })
  })

  // isValibot
  describe('isValibot', () => {
    it.concurrent('isValibot Test', () => {
      const result = isValibot(`Unique identifier for the user
@z.uuid()
@v.pipe(v.string(), v.uuid())`)
      const expected = 'pipe(v.string(), v.uuid())'
      expect(result).toStrictEqual(expected)
    })
  })
})
