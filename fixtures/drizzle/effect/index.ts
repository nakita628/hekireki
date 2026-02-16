import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  /** User ID */
  id: Schema.Int,
  /** Email address */
  email: Schema.String,
  /** Display name */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /** Biography */
  bio: Schema.NullOr(Schema.String),
  /** Avatar URL */
  avatarUrl: Schema.NullOr(Schema.String),
  /** Account active status */
  active: Schema.Boolean,
  /** Score */
  score: Schema.Number,
  /** Tags */
  tags: Schema.Array(Schema.String),
  /** Metadata JSON */
  metadata: Schema.NullOr(Schema.Unknown),
})

export type User = Schema.Schema.Type<typeof UserSchema>

export const ProfileSchema = Schema.Struct({
  /** Profile ID */
  id: Schema.UUID,
  /** User ID */
  userId: Schema.Int,
  /** Website URL */
  website: Schema.NullOr(Schema.String),
  /** Location */
  location: Schema.NullOr(Schema.String),
  /** Birth date */
  birthDate: Schema.NullOr(Schema.DateFromString),
})

export type Profile = Schema.Schema.Type<typeof ProfileSchema>

export const PostSchema = Schema.Struct({
  /** Post ID */
  id: Schema.Int,
  /** Post title */
  title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
  /** URL slug */
  slug: Schema.String,
  /** Post content */
  content: Schema.String,
  /** View count */
  views: Schema.Int,
  /** Author user ID */
  authorId: Schema.Int,
})

export type Post = Schema.Schema.Type<typeof PostSchema>

export const CommentSchema = Schema.Struct({
  /** Comment ID */
  id: Schema.Int,
  /** Comment body */
  body: Schema.String,
  /** Post ID */
  postId: Schema.Int,
  /** Author user ID */
  authorId: Schema.Int,
})

export type Comment = Schema.Schema.Type<typeof CommentSchema>

export const TagSchema = Schema.Struct({
  /** Tag ID */
  id: Schema.Int,
  /** Tag name */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
})

export type Tag = Schema.Schema.Type<typeof TagSchema>

export const PostTagSchema = Schema.Struct({
  /** Post ID */
  postId: Schema.Int,
  /** Tag ID */
  tagId: Schema.Int,
})

export type PostTag = Schema.Schema.Type<typeof PostTagSchema>

export const SessionSchema = Schema.Struct({
  /** Session ID */
  id: Schema.String,
  /** Session token */
  token: Schema.String,
  /** User ID */
  userId: Schema.Int,
  /** Expiration timestamp */
  expiresAt: Schema.DateFromString,
  /** Client IP address */
  ipAddress: Schema.NullOr(Schema.String),
  /** User agent string */
  userAgent: Schema.NullOr(Schema.String),
})

export type Session = Schema.Schema.Type<typeof SessionSchema>

export const AuditLogSchema = Schema.Struct({
  /** Audit log ID */
  id: Schema.Int,
  /** Action performed */
  action: Schema.String,
  /** Table name */
  tableName: Schema.String,
  /** Record ID */
  recordId: Schema.String,
})

export type AuditLog = Schema.Schema.Type<typeof AuditLogSchema>
