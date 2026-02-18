import { describe, expect, it } from 'vitest'
import { makeValibotSchemas, PRISMA_TO_VALIBOT } from './valibot.js'

describe('helper/valibot', () => {
  describe('PRISMA_TO_VALIBOT', () => {
    it('PRISMA_TO_VALIBOT maps String to string()', () => {
      expect(PRISMA_TO_VALIBOT.String).toBe('string()')
      expect(PRISMA_TO_VALIBOT.Int).toBe('number()')
    })
  })

  describe('makeValibotSchemas', () => {
    it.concurrent('schemas comment true', () => {
      const result = makeValibotSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@z.uuid()'],
            validation: 'pipe(v.string(), v.uuid())',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@z.string().min(1).max(50)'],
            validation: 'pipe(v.string(), v.minLength(1), v.maxLength(50))',
            isRequired: true,
          },
        ],
        true,
      )

      const expected = `export const UserSchema = v.object({
  /**
   * Primary key
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))
})`
      expect(result).toBe(expected)
    })
    it.concurrent('schemas comment false', () => {
      const result = makeValibotSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@z.uuid()'],
            validation: 'pipe(v.string(), v.uuid())',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@z.string().min(1).max(50)'],
            validation: 'pipe(v.string(), v.minLength(1), v.maxLength(50))',
            isRequired: true,
          },
        ],
        false,
      )

      const expected = `export const UserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))
})`
      expect(result).toBe(expected)
    })
  })
})
