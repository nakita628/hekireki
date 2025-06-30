import { describe, expect, it } from 'vitest'
import { properties } from './properties.js'

// Test run
// pnpm vitest run ./src/generator/zod/generator/properties.test.ts

describe('properties', () => {
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
