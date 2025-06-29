import { z } from 'zod'

export const User = z.object({
  /**
   * Unique identifier for the user.
   */
  id: z.uuid(),
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

export const Post = z.object({
  /**
   * Unique identifier for the post.
   */
  id: z.uuid(),
  /**
   * ID of the user who created the post.
   */
  userId: z.uuid(),
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

export const Like = z.object({
  /**
   * Unique identifier for the like.
   */
  id: z.uuid(),
  /**
   * ID of the post that is liked.
   */
  postId: z.uuid(),
  /**
   * ID of the user who liked the post.
   */
  userId: z.uuid(),
  /**
   * Timestamp when the like was created.
   */
  createdAt: z.date(),
})

export type Like = z.infer<typeof LikeSchema>
