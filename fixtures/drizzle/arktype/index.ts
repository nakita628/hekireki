import { type } from 'arktype'

export const UserSchema = type({
  /** User ID */
  id: 'number.integer',
  /** Email address */
  email: 'string.email',
  /** Display name */
  name: '1 <= string <= 100',
  /** Biography */
  bio: 'string | null',
  /** Avatar URL */
  avatarUrl: 'string.url | null',
  /** Account active status */
  active: 'boolean',
  /** Score */
  score: 'number',
  /** Tags */
  tags: 'string[]',
  /** Metadata JSON */
  metadata: 'unknown | null',
})

export type User = typeof UserSchema.infer

export const ProfileSchema = type({
  /** Profile ID */
  id: 'string.uuid',
  /** User ID */
  userId: 'number.integer',
  /** Website URL */
  website: 'string.url | null',
  /** Location */
  location: 'string | null',
  /** Birth date */
  birthDate: 'string.date.iso | null',
})

export type Profile = typeof ProfileSchema.infer

export const PostSchema = type({
  /** Post ID */
  id: 'number.integer',
  /** Post title */
  title: '1 <= string <= 200',
  /** URL slug */
  slug: 'string',
  /** Post content */
  content: 'string',
  /** View count */
  views: 'number.integer',
  /** Author user ID */
  authorId: 'number.integer',
})

export type Post = typeof PostSchema.infer

export const CommentSchema = type({
  /** Comment ID */
  id: 'number.integer',
  /** Comment body */
  body: 'string',
  /** Post ID */
  postId: 'number.integer',
  /** Author user ID */
  authorId: 'number.integer',
})

export type Comment = typeof CommentSchema.infer

export const TagSchema = type({
  /** Tag ID */
  id: 'number.integer',
  /** Tag name */
  name: '1 <= string <= 50',
})

export type Tag = typeof TagSchema.infer

export const PostTagSchema = type({
  /** Post ID */
  postId: 'number.integer',
  /** Tag ID */
  tagId: 'number.integer',
})

export type PostTag = typeof PostTagSchema.infer

export const SessionSchema = type({
  /** Session ID */
  id: 'string',
  /** Session token */
  token: 'string',
  /** User ID */
  userId: 'number.integer',
  /** Expiration timestamp */
  expiresAt: 'string.date.iso',
  /** Client IP address */
  ipAddress: 'string | null',
  /** User agent string */
  userAgent: 'string | null',
})

export type Session = typeof SessionSchema.infer

export const AuditLogSchema = type({
  /** Audit log ID */
  id: 'number.integer',
  /** Action performed */
  action: 'string',
  /** Table name */
  tableName: 'string',
  /** Record ID */
  recordId: 'string',
})

export type AuditLog = typeof AuditLogSchema.infer
