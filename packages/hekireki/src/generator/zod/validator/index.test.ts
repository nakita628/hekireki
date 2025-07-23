import { describe, expect, it } from 'vitest'
import { isZod, isZodDocument } from '.'

// Test run
// pnpm vitest run ./src/generator/zod/validator/index.test.ts

describe('validator', () => {
  // isZodDocument
  describe('isZodDocument', () => {
    it.concurrent('isZodDocument Test', () => {
      const result = isZodDocument(`Unique identifier for the user
    @z.uuid()
    @v.pipe(v.string(), v.uuid())`)
      const expected = ['Unique identifier for the user', '@v.pipe(v.string(), v.uuid())']
      expect(result).toStrictEqual(expected)
    })
  })

  // isZod
  describe('isZod', () => {
    it.concurrent('isZod Test', () => {
      const result = isZod(`Unique identifier for the user
@z.uuid()
@v.pipe(v.string(), v.uuid())`)
      expect(result).toBe('uuid()')
    })
  })
})
