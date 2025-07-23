import { describe, expect, it } from 'vitest'
import { inferInput, isValibot, isValibotDocument, properties } from './index.js'

// Test run
// pnpm vitest run ./src/generator/valibot/utils/index.test.ts

describe('utils', () => {
  // inferInput
  describe('inferInput', () => {
    it.concurrent('inferInput test', () => {
      const result = inferInput('User')
      const expected = 'export type User = v.InferInput<typeof UserSchema>'
      expect(result).toBe(expected)
    })
  })

  // properties
  describe('properties', () => {
    it.concurrent('properties comment true', () => {
      const result = properties(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@z.uuid()'],
            validation: 'pipe(v.string(), v.uuid())',
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@z.string().min(1).max(50)'],
            validation: 'pipe(v.string(), v.minLength(1), v.maxLength(50))',
          },
        ],
        true,
      )
      const expected = `  /**
   * Primary key
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))`

      expect(result).toBe(expected)
    })

    it.concurrent('properties comment false', () => {
      const result = properties(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@z.uuid()'],
            validation: 'pipe(v.string(), v.uuid())',
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@z.string().min(1).max(50)'],
            validation: 'pipe(v.string(), v.minLength(1), v.maxLength(50))',
          },
        ],
        false,
      )
      const expected = `  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))`
      expect(result).toBe(expected)
    })
  })

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
})
