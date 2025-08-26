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
  bio: z.string().optional().default('').optional(),
  /**
   * User's unique email address
   */
  email: z.email(),
  /**
   * Timestamp of email verification
   */
  emailVerified: z.date().nullable().optional(),
  /**
   * URL of user's image
   */
  image: z.url().nullable().optional(),
  /**
   * URL of user's cover image
   */
  coverImage: z.url().nullable().optional(),
  /**
   * URL of user's profile image
   */
  profileImage: z.url().nullable().optional(),
  /**
   * Hashed password for security
   */
  hashedPassword: z.string().optional(),
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
  hasNotification: z.boolean().default(false).optional(),
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
   * z.iso.datetime()
   */
  createdAt: z.string().datetime(),
  /**
   * Timestamp when the post was last updated
   * z.iso.datetime()
   */
  updatedAt: z.string().datetime(),
  /**
   * ID of the user who created the post
   */
  userId: z.uuid(),
})

export type Post = z.infer<typeof PostSchema>

export const FollowSchema = z.object({
  /**
   * Unique identifier for the follow relationship
   */
  id: z.uuid(),
  /**
   * ID of the user who is following
   */
  followerId: z.string().uuid(),
  /**
   * ID of the user being followed
   */
  followingId: z.string().uuid(),
  /**
   * Timestamp when the follow relationship was created
   * z.iso.datetime()
   */
  createdAt: z.string().datetime(),
})

export type Follow = z.infer<typeof FollowSchema>

export const LikeSchema = z.object({
  /**
   * Unique identifier for the like
   */
  id: z.uuid(),
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

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  posts: z.array(PostSchema),
  comments: z.array(CommentSchema),
  notifications: z.array(NotificationSchema),
  followers: z.array(FollowSchema),
  following: z.array(FollowSchema),
  likes: z.array(LikeSchema),
})

export type UserRelations = z.infer<typeof UserRelationsSchema>

export const PostRelationsSchema = z.object({
  ...PostSchema.shape,
  user: UserSchema,
  comments: z.array(CommentSchema),
  likes: z.array(LikeSchema),
})

export type PostRelations = z.infer<typeof PostRelationsSchema>

export const FollowRelationsSchema = z.object({
  ...FollowSchema.shape,
  follower: UserSchema,
  following: UserSchema,
})

export type FollowRelations = z.infer<typeof FollowRelationsSchema>

export const LikeRelationsSchema = z.object({
  ...LikeSchema.shape,
  user: UserSchema,
  post: PostSchema,
})

export type LikeRelations = z.infer<typeof LikeRelationsSchema>

export const CommentRelationsSchema = z.object({
  ...CommentSchema.shape,
  user: UserSchema,
  post: PostSchema,
})

export type CommentRelations = z.infer<typeof CommentRelationsSchema>

export const NotificationRelationsSchema = z.object({
  ...NotificationSchema.shape,
  user: UserSchema,
})

export type NotificationRelations = z.infer<typeof NotificationRelationsSchema>
