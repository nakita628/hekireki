import { describe, expect, it } from 'vitest'
import { schema } from '.'

// Test run
// pnpm vitest run ./src/generator/valibot/generator/schema.test.ts

describe('schema', () => {
  it('schema comment ture', () => {
    const result = schema(
      'User',
      `  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50),`,
    )
    const expected = `export const UserSchema = v.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50),
})`
    expect(result).toBe(expected)
  })
  it('schema comment false', () => {
    const result = schema(
      'User',
      `  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))`,
    )
    console.log(result)
    const expected = `export const UserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))
})`
    expect(result).toBe(expected)
  })
})
