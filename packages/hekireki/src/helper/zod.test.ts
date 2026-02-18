import { describe, expect, it } from 'vitest'
import { makeZodSchemas, PRISMA_TO_ZOD } from './zod.js'

describe('helper/zod', () => {
  describe('PRISMA_TO_ZOD', () => {
    it('PRISMA_TO_ZOD maps String to string()', () => {
      expect(PRISMA_TO_ZOD.String).toBe('string()')
      expect(PRISMA_TO_ZOD.Int).toBe('number()')
      expect(PRISMA_TO_ZOD.Boolean).toBe('boolean()')
      expect(PRISMA_TO_ZOD.DateTime).toBe('iso.datetime()')
      expect(PRISMA_TO_ZOD.BigInt).toBe('bigint()')
    })
  })

  describe('makeZodSchemas', () => {
    it.concurrent('schemas comment true', () => {
      const result = makeZodSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
            validation: 'uuid()',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
            validation: 'string().min(1).max(50)',
            isRequired: true,
          },
        ],
        true,
      )
      const expected = `export const UserSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50)
})`
      expect(result).toBe(expected)
    })
    it.concurrent('schemas comment false', () => {
      const result = makeZodSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
            validation: 'uuid()',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
            validation: 'string().min(1).max(50)',
            isRequired: true,
          },
        ],
        false,
      )
      const expected = `export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50)
})`
      expect(result).toBe(expected)
    })
  })
})
