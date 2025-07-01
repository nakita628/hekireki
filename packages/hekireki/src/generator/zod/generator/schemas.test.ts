import { describe, expect, it } from 'vitest'
import { schemas } from '.'

// Test run
// pnpm vitest run ./src/generator/zod/generator/schemas.test.ts

describe('schemas', () => {
  it.concurrent('schemas comment true', () => {
    const result = schemas(
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
    const result = schemas(
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
    const expected = `export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50)
})`
    expect(result).toBe(expected)
  })
})
