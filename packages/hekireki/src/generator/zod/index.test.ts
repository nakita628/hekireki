import { describe, it, expect, vi } from 'vitest'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
const execAsync = promisify(exec)

describe('prisma generate', () => {
  it('should successfully generate zod schemas', async () => {
    const { stderr } = await execAsync('npx prisma generate')
    // Not Error
    expect(stderr).toBeFalsy()

    const result = fs.readFileSync('./prisma/zod/index.ts', {
      encoding: 'utf-8',
    })

    const expected = `import { z } from 'zod'

export const UserSchema = z.object({
  /**
   * Unique identifier for the user.
   */
  id: z.string().uuid(),
  /**
   * Username of the user.
   */
  username: z.string().min(3),
  /**
   * Email address of the user.
   */
  email: z.string().email(),
  /**
   * Password for the user.
   */
  password: z.string().min(8).max(100),
  /**
   * Timestamp when the user was created.
   */
  createdAt: z.date(),
  /**
   * Timestamp when the user was last updated.
   */
  updatedAt: z.date(),
})

export type User = z.infer<typeof UserSchema>

export const PostSchema = z.object({
  /**
   * Unique identifier for the post.
   */
  id: z.string().uuid(),
  /**
   * ID of the user who created the post.
   */
  userId: z.string().uuid(),
  /**
   * Content of the post.
   */
  content: z.string().max(500),
  /**
   * Timestamp when the post was created.
   */
  createdAt: z.date(),
  /**
   * Timestamp when the post was last updated.
   */
  updatedAt: z.date(),
})

export type Post = z.infer<typeof PostSchema>

export const LikeSchema = z.object({
  /**
   * Unique identifier for the like.
   */
  id: z.string().uuid(),
  /**
   * ID of the post that is liked.
   */
  postId: z.string().uuid(),
  /**
   * ID of the user who liked the post.
   */
  userId: z.string().uuid(),
  /**
   * Timestamp when the like was created.
   */
  createdAt: z.date(),
})

export type Like = z.infer<typeof LikeSchema>
`

    expect(result).toBe(expected)
  })
})
