import { type } from 'arktype'

export const UserSchema = type({
  /** Unique identifier for the user */
  id: 'string.uuid',
  /** User's display name */
  name: 'string',
  /** Unique username for the user */
  username: 'string',
  /** User's biography or profile description */
  bio: 'string | null',
  /** User's unique email address */
  email: 'string.email',
  /** Timestamp of email verification */
  emailVerified: 'string.date.iso | null',
  /** URL of user's image */
  image: 'string.url | null',
  /** URL of user's cover image */
  coverImage: 'string.url | null',
  /** URL of user's profile image */
  profileImage: 'string.url | null',
  /** Hashed password for security */
  hashedPassword: 'string | null',
  /** Timestamp when the user was created */
  createdAt: 'string.date.iso',
  /** Timestamp when the user was last updated */
  updatedAt: 'string.date.iso',
  /** Flag indicating if user has unread notifications */
  hasNotification: 'boolean | null',
})

export type User = typeof UserSchema.infer

export const PostSchema = type({
  /** Unique identifier for the post */
  id: 'string.uuid',
  /** Content of the post */
  body: '1 <= string <= 1000',
  /** Timestamp when the post was created */
  createdAt: 'string.date.iso',
  /** Timestamp when the post was last updated */
  updatedAt: 'string.date.iso',
  /** ID of the user who created the post */
  userId: 'string.uuid',
})

export type Post = typeof PostSchema.infer

export const FollowSchema = type({
  /** ID of the user who is following */
  followerId: 'string.uuid',
  /** ID of the user being followed */
  followingId: 'string.uuid',
  /** Timestamp when the follow relationship was created */
  createdAt: 'string.date.iso',
})

export type Follow = typeof FollowSchema.infer

export const LikeSchema = type({
  /** ID of the user who liked the post */
  userId: 'string.uuid',
  /** ID of the post that was liked */
  postId: 'string.uuid',
  /** Timestamp when the like was created */
  createdAt: 'string.date.iso',
})

export type Like = typeof LikeSchema.infer

export const CommentSchema = type({
  /** Unique identifier for the comment */
  id: 'string.uuid',
  /** Content of the comment */
  body: 'string',
  /** Timestamp when the comment was created */
  createdAt: 'string.date.iso',
  /** Timestamp when the comment was last updated */
  updatedAt: 'string.date.iso',
  /** ID of the user who created the comment */
  userId: 'string.uuid',
  /** ID of the post this comment belongs to */
  postId: 'string.uuid',
})

export type Comment = typeof CommentSchema.infer

export const NotificationSchema = type({
  /** Unique identifier for the notification */
  id: 'string.uuid',
  /** Content of the notification message */
  body: 'string',
  /** ID of the user who receives the notification */
  userId: 'string.uuid',
  /** Timestamp when the notification was created */
  createdAt: 'string.date.iso',
})

export type Notification = typeof NotificationSchema.infer
