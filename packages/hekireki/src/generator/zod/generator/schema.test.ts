import { describe, expect, it } from 'vitest'
import { schema } from './schema.js'

// Test run
// pnpm vitest run ./src/generator/zod/generator/schema.test.ts

describe('schema', () => {
  it.concurrent('schema comment true', () => {
    const result = schema(
      'Post',
      `  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Article title
   */
  title: z.string().min(1).max(100),
  /**
   * Body content (no length limit)
   */
  content: z.string(),
  /**
   * Foreign key referencing User.id
   */
  userId: z.uuid()`,
    )
    const expected = `export const PostSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Article title
   */
  title: z.string().min(1).max(100),
  /**
   * Body content (no length limit)
   */
  content: z.string(),
  /**
   * Foreign key referencing User.id
   */
  userId: z.uuid()
})`
    expect(result).toBe(expected)
  })

  it.concurrent('schema comment false', () => {
    const result = schema(
      'Post',
      `  id: z.uuid(),
  title: z.string().min(1).max(100),
  content: z.string(),
  userId: z.uuid()`,
    )
    const expected = `export const PostSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(100),
  content: z.string(),
  userId: z.uuid()
})`
    expect(result).toBe(expected)
  })
})
