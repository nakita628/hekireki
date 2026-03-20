import * as v from 'valibot'

export const UserSchema = v.object({
  /**
   * User ID
   */
  id: v.pipe(v.number(), v.integer()),
  /**
   * Email address
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  /**
   * Biography
   */
  bio: v.nullish(v.string()),
  /**
   * Avatar URL
   */
  avatarUrl: v.nullish(v.pipe(v.string(), v.url())),
  /**
   * Account active status
   */
  active: v.boolean(),
  /**
   * Score
   */
  score: v.number(),
  /**
   * Tags
   */
  tags: v.array(v.string()),
  /**
   * Metadata JSON
   */
  metadata: v.nullish(v.any()),
})

export type User = v.InferOutput<typeof UserSchema>

export const ProfileSchema = v.object({
  /**
   * Profile ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * User ID
   */
  userId: v.pipe(v.number(), v.integer()),
  /**
   * Website URL
   */
  website: v.nullish(v.pipe(v.string(), v.url())),
  /**
   * Location
   */
  location: v.nullish(v.string()),
  /**
   * Birth date
   */
  birthDate: v.nullish(v.pipe(v.string(), v.isoDate())),
})

export type Profile = v.InferOutput<typeof ProfileSchema>

export const PostSchema = v.object({
  /**
   * Post ID
   */
  id: v.pipe(v.number(), v.integer()),
  /**
   * Post title
   */
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  /**
   * URL slug
   */
  slug: v.string(),
  /**
   * Post content
   */
  content: v.string(),
  /**
   * View count
   */
  views: v.pipe(v.number(), v.integer()),
  /**
   * Author user ID
   */
  authorId: v.pipe(v.number(), v.integer()),
})

export type Post = v.InferOutput<typeof PostSchema>

export const CommentSchema = v.object({
  /**
   * Comment ID
   */
  id: v.pipe(v.number(), v.integer()),
  /**
   * Comment body
   */
  body: v.string(),
  /**
   * Post ID
   */
  postId: v.pipe(v.number(), v.integer()),
  /**
   * Author user ID
   */
  authorId: v.pipe(v.number(), v.integer()),
})

export type Comment = v.InferOutput<typeof CommentSchema>

export const TagSchema = v.object({
  /**
   * Tag ID
   */
  id: v.pipe(v.number(), v.integer()),
  /**
   * Tag name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
})

export type Tag = v.InferOutput<typeof TagSchema>

export const PostTagSchema = v.object({
  /**
   * Post ID
   */
  postId: v.pipe(v.number(), v.integer()),
  /**
   * Tag ID
   */
  tagId: v.pipe(v.number(), v.integer()),
})

export type PostTag = v.InferOutput<typeof PostTagSchema>

export const SessionSchema = v.object({
  /**
   * Session ID
   */
  id: v.pipe(v.string(), v.cuid2()),
  /**
   * Session token
   */
  token: v.string(),
  /**
   * User ID
   */
  userId: v.pipe(v.number(), v.integer()),
  /**
   * Expiration timestamp
   */
  expiresAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Client IP address
   */
  ipAddress: v.nullish(v.string()),
  /**
   * User agent string
   */
  userAgent: v.nullish(v.string()),
})

export type Session = v.InferOutput<typeof SessionSchema>

export const AuditLogSchema = v.object({
  /**
   * Audit log ID
   */
  id: v.pipe(v.number(), v.integer()),
  /**
   * Action performed
   */
  action: v.string(),
  /**
   * Table name
   */
  tableName: v.string(),
  /**
   * Record ID
   */
  recordId: v.string(),
})

export type AuditLog = v.InferOutput<typeof AuditLogSchema>

export const UserRelationsSchema = v.object({
  ...UserSchema.entries,
  posts: v.array(PostSchema),
  profile: ProfileSchema,
  comments: v.array(CommentSchema),
})

export type UserRelations = v.InferOutput<typeof UserRelationsSchema>

export const ProfileRelationsSchema = v.object({
  ...ProfileSchema.entries,
  user: UserSchema,
})

export type ProfileRelations = v.InferOutput<typeof ProfileRelationsSchema>

export const PostRelationsSchema = v.object({
  ...PostSchema.entries,
  author: UserSchema,
  comments: v.array(CommentSchema),
  postTags: v.array(PostTagSchema),
})

export type PostRelations = v.InferOutput<typeof PostRelationsSchema>

export const CommentRelationsSchema = v.object({
  ...CommentSchema.entries,
  post: PostSchema,
  author: UserSchema,
})

export type CommentRelations = v.InferOutput<typeof CommentRelationsSchema>

export const TagRelationsSchema = v.object({
  ...TagSchema.entries,
  postTags: v.array(PostTagSchema),
})

export type TagRelations = v.InferOutput<typeof TagRelationsSchema>

export const PostTagRelationsSchema = v.object({
  ...PostTagSchema.entries,
  post: PostSchema,
  tag: TagSchema,
})

export type PostTagRelations = v.InferOutput<typeof PostTagRelationsSchema>
