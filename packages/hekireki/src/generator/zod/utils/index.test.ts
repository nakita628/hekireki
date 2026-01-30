import { describe, expect, it } from 'vitest'
import {
  makeDocumentParser,
  makePropertiesGenerator,
  makeValidationExtractor,
  makeZodInfer,
} from 'utils-lab'

// Test run
// pnpm vitest run ./src/generator/zod/utils/index.test.ts

describe('utils', () => {
  // makeZodInfer
  describe('makeZodInfer', () => {
    it.concurrent('makeZodInfer', () => {
      expect(makeZodInfer('User')).toBe('export type User = z.infer<typeof UserSchema>')
    })
  })

  // makePropertiesGenerator('z')
  describe('makePropertiesGenerator', () => {
    const properties = makePropertiesGenerator('z')

    it.concurrent('properties comment true', () => {
      const result = properties(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
            validation: 'uuid()',
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
            validation: 'string().min(1).max(50)',
          },
        ],
        true,
      )
      const expected = `  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50)`
      expect(result).toBe(expected)
    })
    it.concurrent('properties comment false', () => {
      const result = properties(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
            validation: 'uuid()',
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
            validation: 'string().min(1).max(50)',
          },
        ],
        false,
      )
      const expected = `  id: z.uuid(),
  name: z.string().min(1).max(50)`
      expect(result).toBe(expected)
    })
  })

  // makeDocumentParser('@z.')
  describe('makeDocumentParser', () => {
    const isZodDocument = makeDocumentParser('@z.')

    it.concurrent('isZodDocument Test', () => {
      const result = isZodDocument(`Unique identifier for the user
      @z.uuid()
      @v.pipe(v.string(), v.uuid())`)
      const expected = ['Unique identifier for the user', '@v.pipe(v.string(), v.uuid())']
      expect(result).toStrictEqual(expected)
    })
  })

  // makeValidationExtractor('@z.')
  describe('makeValidationExtractor', () => {
    const isZod = makeValidationExtractor('@z.')

    it.concurrent('isZod Test', () => {
      const result = isZod(`Unique identifier for the user
  @z.uuid()
  @v.pipe(v.string(), v.uuid())`)
      expect(result).toBe('uuid()')
    })
  })
})
