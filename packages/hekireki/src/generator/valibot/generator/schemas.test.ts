import { describe, expect, it } from 'vitest'
import { schemas } from '.'

// Test run
// pnpm vitest run ./src/generator/valibot/generator/schemas.test.ts

describe('schemas', () => {
  it.concurrent('schemas comment true', () => {
    const result = schemas(
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
    const result = schemas(
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

    const expected = `export const UserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))
})`
    expect(result).toBe(expected)
  })
})
