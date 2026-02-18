import * as v from 'valibot'

export const UserSchema = v.object({
  /**
   * Unique identifier for the user
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * User's display name
   */
  name: v.string(),
  /**
   * Unique username for the user
   */
  username: v.string(),
  /**
   * User's biography or profile description
   */
  bio: v.optional(v.nullish(v.string())),
  /**
   * User's unique email address
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Timestamp of email verification
   */
  emailVerified: v.optional(v.nullish(v.pipe(v.string(), v.isoDate()))),
  /**
   * URL of user's image
   */
  image: v.optional(v.nullish(v.pipe(v.string(), v.url()))),
  /**
   * URL of user's cover image
   */
  coverImage: v.optional(v.nullish(v.pipe(v.string(), v.url()))),
  /**
   * URL of user's profile image
   */
  profileImage: v.optional(v.nullish(v.pipe(v.string(), v.url()))),
  /**
   * Hashed password for security
   */
  hashedPassword: v.optional(v.nullish(v.string())),
  /**
   * Timestamp when the user was created
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Timestamp when the user was last updated
   */
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Flag indicating if user has unread notifications
   */
  hasNotification: v.optional(v.nullish(v.boolean())),
})

export type User = v.InferInput<typeof UserSchema>

export const PostSchema = v.object({
  /**
   * Unique identifier for the post
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Content of the post
   */
  body: v.pipe(v.string(), v.minLength(1), v.maxLength(1000)),
  /**
   * Timestamp when the post was created
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Timestamp when the post was last updated
   */
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * ID of the user who created the post
   */
  userId: v.pipe(v.string(), v.uuid()),
})

export type Post = v.InferInput<typeof PostSchema>

export const FollowSchema = v.object({
  /**
   * ID of the user who is following
   */
  followerId: v.pipe(v.string(), v.uuid()),
  /**
   * ID of the user being followed
   */
  followingId: v.pipe(v.string(), v.uuid()),
  /**
   * Timestamp when the follow relationship was created
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
})

export type Follow = v.InferInput<typeof FollowSchema>

export const LikeSchema = v.object({
  /**
   * ID of the user who liked the post
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * ID of the post that was liked
   */
  postId: v.pipe(v.string(), v.uuid()),
  /**
   * Timestamp when the like was created
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
})

export type Like = v.InferInput<typeof LikeSchema>

export const CommentSchema = v.object({
  /**
   * Unique identifier for the comment
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Content of the comment
   */
  body: v.string(),
  /**
   * Timestamp when the comment was created
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Timestamp when the comment was last updated
   */
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * ID of the user who created the comment
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * ID of the post this comment belongs to
   */
  postId: v.pipe(v.string(), v.uuid()),
})

export type Comment = v.InferInput<typeof CommentSchema>

export const NotificationSchema = v.object({
  /**
   * Unique identifier for the notification
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Content of the notification message
   */
  body: v.string(),
  /**
   * ID of the user who receives the notification
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Timestamp when the notification was created
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
})

export type Notification = v.InferInput<typeof NotificationSchema>
