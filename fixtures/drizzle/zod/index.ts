import * as z from 'zod'

export const UserSchema = z.object({
  /**
   * User ID
   */
  id: z.number().int(),
  /**
   * Email address
   */
  email: z.email(),
  /**
   * Display name
   */
  name: z.string().min(1).max(100),
  /**
   * Biography
   */
  bio: z.string().nullable(),
  /**
   * Avatar URL
   */
  avatarUrl: z.url().nullable(),
  /**
   * Account active status
   */
  active: z.boolean(),
  /**
   * Score
   */
  score: z.number(),
  /**
   * Tags
   */
  tags: z.array(z.string()),
  /**
   * Metadata JSON
   */
  metadata: z.any().nullable(),
})

export type User = z.infer<typeof UserSchema>

export const ProfileSchema = z.object({
  /**
   * Profile ID
   */
  id: z.uuid(),
  /**
   * User ID
   */
  userId: z.number().int(),
  /**
   * Website URL
   */
  website: z.url().nullable(),
  /**
   * Location
   */
  location: z.string().nullable(),
  /**
   * Birth date
   */
  birthDate: z.iso.date().nullable(),
})

export type Profile = z.infer<typeof ProfileSchema>

export const PostSchema = z.object({
  /**
   * Post ID
   */
  id: z.number().int(),
  /**
   * Post title
   */
  title: z.string().min(1).max(200),
  /**
   * URL slug
   */
  slug: z.string(),
  /**
   * Post content
   */
  content: z.string(),
  /**
   * View count
   */
  views: z.number().int(),
  /**
   * Author user ID
   */
  authorId: z.number().int(),
})

export type Post = z.infer<typeof PostSchema>

export const CommentSchema = z.object({
  /**
   * Comment ID
   */
  id: z.number().int(),
  /**
   * Comment body
   */
  body: z.string(),
  /**
   * Post ID
   */
  postId: z.number().int(),
  /**
   * Author user ID
   */
  authorId: z.number().int(),
})

export type Comment = z.infer<typeof CommentSchema>

export const TagSchema = z.object({
  /**
   * Tag ID
   */
  id: z.number().int(),
  /**
   * Tag name
   */
  name: z.string().min(1).max(50),
})

export type Tag = z.infer<typeof TagSchema>

export const PostTagSchema = z.object({
  /**
   * Post ID
   */
  postId: z.number().int(),
  /**
   * Tag ID
   */
  tagId: z.number().int(),
})

export type PostTag = z.infer<typeof PostTagSchema>

export const SessionSchema = z.object({
  /**
   * Session ID
   */
  id: z.cuid(),
  /**
   * Session token
   */
  token: z.string(),
  /**
   * User ID
   */
  userId: z.number().int(),
  /**
   * Expiration timestamp
   */
  expiresAt: z.iso.datetime(),
  /**
   * Client IP address
   */
  ipAddress: z.string().nullable(),
  /**
   * User agent string
   */
  userAgent: z.string().nullable(),
})

export type Session = z.infer<typeof SessionSchema>

export const AuditLogSchema = z.object({
  /**
   * Audit log ID
   */
  id: z.number().int(),
  /**
   * Action performed
   */
  action: z.string(),
  /**
   * Table name
   */
  tableName: z.string(),
  /**
   * Record ID
   */
  recordId: z.string(),
})

export type AuditLog = z.infer<typeof AuditLogSchema>

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  posts: z.array(PostSchema),
  profile: ProfileSchema,
  comments: z.array(CommentSchema),
})

export type UserRelations = z.infer<typeof UserRelationsSchema>

export const ProfileRelationsSchema = z.object({
  ...ProfileSchema.shape,
  user: UserSchema,
})

export type ProfileRelations = z.infer<typeof ProfileRelationsSchema>

export const PostRelationsSchema = z.object({
  ...PostSchema.shape,
  author: UserSchema,
  comments: z.array(CommentSchema),
  postTags: z.array(PostTagSchema),
})

export type PostRelations = z.infer<typeof PostRelationsSchema>

export const CommentRelationsSchema = z.object({
  ...CommentSchema.shape,
  post: PostSchema,
  author: UserSchema,
})

export type CommentRelations = z.infer<typeof CommentRelationsSchema>

export const TagRelationsSchema = z.object({
  ...TagSchema.shape,
  postTags: z.array(PostTagSchema),
})

export type TagRelations = z.infer<typeof TagRelationsSchema>

export const PostTagRelationsSchema = z.object({
  ...PostTagSchema.shape,
  post: PostSchema,
  tag: TagSchema,
})

export type PostTagRelations = z.infer<typeof PostTagRelationsSchema>
