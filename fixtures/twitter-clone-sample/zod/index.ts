import * as z from 'zod'

export const UserSchema = z.object({
  /**
   * Unique identifier for the user
   */
  id: z.uuid(),
  /**
   * User's display name
   */
  name: z.string(),
  /**
   * Unique username for the user
   */
  username: z.string(),
  /**
   * User's biography or profile description
   */
  bio: z.string().optional().default(''),
  /**
   * User's unique email address
   */
  email: z.email(),
  /**
   * Timestamp of email verification
   */
  emailVerified: z.date().nullable(),
  /**
   * URL of user's image
   */
  image: z.url().nullable(),
  /**
   * URL of user's cover image
   */
  coverImage: z.url().nullable(),
  /**
   * URL of user's profile image
   */
  profileImage: z.url().nullable(),
  /**
   * Hashed password for security
   */
  hashedPassword: z.string(),
  /**
   * Timestamp when the user was created
   */
  createdAt: z.iso.datetime(),
  /**
   * Timestamp when the user was last updated
   */
  updatedAt: z.iso.datetime(),
  /**
   * Flag indicating if user has unread notifications
   */
  hasNotification: z.boolean().default(false),
})

export type User = z.infer<typeof UserSchema>

export const PostSchema = z.object({
  /**
   * Unique identifier for the post
   */
  id: z.uuid(),
  /**
   * Content of the post
   */
  body: z.string().min(1).max(1000),
  /**
   * Timestamp when the post was created
   */
  createdAt: z.iso.datetime(),
  /**
   * Timestamp when the post was last updated
   */
  updatedAt: z.iso.datetime(),
  /**
   * ID of the user who created the post
   */
  userId: z.uuid(),
})

export type Post = z.infer<typeof PostSchema>

export const FollowSchema = z.object({
  /**
   * ID of the user who is following
   */
  followerId: z.uuid(),
  /**
   * ID of the user being followed
   */
  followingId: z.uuid(),
  /**
   * Timestamp when the follow relationship was created
   */
  createdAt: z.iso.datetime(),
})

export type Follow = z.infer<typeof FollowSchema>

export const LikeSchema = z.object({
  /**
   * ID of the user who liked the post
   */
  userId: z.uuid(),
  /**
   * ID of the post that was liked
   */
  postId: z.uuid(),
  /**
   * Timestamp when the like was created
   */
  createdAt: z.iso.datetime(),
})

export type Like = z.infer<typeof LikeSchema>

export const CommentSchema = z.object({
  /**
   * Unique identifier for the comment
   */
  id: z.uuid(),
  /**
   * Content of the comment
   */
  body: z.string(),
  /**
   * Timestamp when the comment was created
   */
  createdAt: z.iso.datetime(),
  /**
   * Timestamp when the comment was last updated
   */
  updatedAt: z.iso.datetime(),
  /**
   * ID of the user who created the comment
   */
  userId: z.uuid(),
  /**
   * ID of the post this comment belongs to
   */
  postId: z.uuid(),
})

export type Comment = z.infer<typeof CommentSchema>

export const NotificationSchema = z.object({
  /**
   * Unique identifier for the notification
   */
  id: z.uuid(),
  /**
   * Content of the notification message
   */
  body: z.string(),
  /**
   * ID of the user who receives the notification
   */
  userId: z.uuid(),
  /**
   * Timestamp when the notification was created
   */
  createdAt: z.iso.datetime(),
})

export type Notification = z.infer<typeof NotificationSchema>
