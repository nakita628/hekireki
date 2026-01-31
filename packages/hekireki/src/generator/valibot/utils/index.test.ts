import {
  makeDocumentParser,
  makePropertiesGenerator,
  makeValibotInfer,
  makeValidationExtractor,
} from 'utils-lab'
import { describe, expect, it } from 'vitest'

// Test run
// pnpm vitest run ./src/generator/valibot/utils/index.test.ts

describe('utils', () => {
  // makeValibotInfer
  describe('makeValibotInfer', () => {
    it.concurrent('makeValibotInfer test', () => {
      const result = makeValibotInfer('User')
      const expected = 'export type User = v.InferInput<typeof UserSchema>'
      expect(result).toBe(expected)
    })
  })

  // makePropertiesGenerator('v')
  describe('makePropertiesGenerator', () => {
    const properties = makePropertiesGenerator('v')

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
    // makeDocumentParser('@v.')
    describe('makeDocumentParser', () => {
      const isValibotDocument = makeDocumentParser('@v.')

      it.concurrent('isValibotDocument Test', () => {
        const result = isValibotDocument(`Unique identifier for the user
@z.uuid()
@v.pipe(v.string(), v.uuid())`)
        const expected = ['Unique identifier for the user', '@z.uuid()']
        expect(result).toStrictEqual(expected)
      })
    })

    // makeValidationExtractor('@v.')
    describe('makeValidationExtractor', () => {
      const isValibot = makeValidationExtractor('@v.')

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
