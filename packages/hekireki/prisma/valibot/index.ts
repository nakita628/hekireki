import * as v from 'valibot'

export const User = v.object({
  /**
   * Unique identifier for the user.
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Username of the user.
   */
  username: v.pipe(v.string(), v.minLength(3)),
  /**
   * Email address of the user.
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Password for the user.
   */
  password: v.pipe(v.string(), v.minLength(8), v.maxLength(100)),
  /**
   * Timestamp when the user was created.
   */
  createdAt: v.date(),
  /**
   * Timestamp when the user was last updated.
   */
  updatedAt: v.date(),
})

export type User = v.InferInput<typeof UserSchema>

export const Post = v.object({
  /**
   * Unique identifier for the post.
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * ID of the user who created the post.
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Content of the post.
   */
  content: v.pipe(v.string(), v.maxLength(500)),
  /**
   * Timestamp when the post was created.
   */
  createdAt: v.date(),
  /**
   * Timestamp when the post was last updated.
   */
  updatedAt: v.date(),
})

export type Post = v.InferInput<typeof PostSchema>

export const Like = v.object({
  /**
   * Unique identifier for the like.
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * ID of the post that is liked.
   */
  postId: v.pipe(v.string(), v.uuid()),
  /**
   * ID of the user who liked the post.
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Timestamp when the like was created.
   */
  createdAt: v.date(),
})

export type Like = v.InferInput<typeof LikeSchema>
