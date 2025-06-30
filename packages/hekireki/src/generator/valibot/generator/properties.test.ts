import { describe, expect, it } from 'vitest'
import { properties } from '.'

// Test run
// pnpm vitest run ./src/generator/valibot/generator/properties.test.ts

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
