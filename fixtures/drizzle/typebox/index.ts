import { Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  id: Type.Integer(),
  email: Type.String(),
  name: Type.String(),
  bio: Type.Optional(Type.String()),
  avatarUrl: Type.Optional(Type.String()),
  role: Type.Union([Type.Literal('ADMIN'), Type.Literal('USER'), Type.Literal('GUEST')]),
  active: Type.Boolean(),
  score: Type.Number(),
  tags: Type.String(),
  metadata: Type.Optional(Type.Unknown()),
  createdAt: Type.Date(),
  updatedAt: Type.Date(),
})

export const ProfileSchema = Type.Object({
  id: Type.String(),
  userId: Type.Integer(),
  website: Type.Optional(Type.String()),
  location: Type.Optional(Type.String()),
  birthDate: Type.Optional(Type.Date()),
})

export const PostSchema = Type.Object({
  id: Type.Integer(),
  title: Type.String(),
  slug: Type.String(),
  content: Type.String(),
  status: Type.Union([Type.Literal('DRAFT'), Type.Literal('PUBLISHED'), Type.Literal('ARCHIVED')]),
  views: Type.Integer(),
  authorId: Type.Integer(),
  createdAt: Type.Date(),
  updatedAt: Type.Date(),
})

export const CommentSchema = Type.Object({
  id: Type.Integer(),
  body: Type.String(),
  postId: Type.Integer(),
  authorId: Type.Integer(),
  createdAt: Type.Date(),
})

export const TagSchema = Type.Object({
  id: Type.Integer(),
  name: Type.String(),
})

export const PostTagSchema = Type.Object({
  postId: Type.Integer(),
  tagId: Type.Integer(),
  createdAt: Type.Date(),
})

export const SessionSchema = Type.Object({
  id: Type.String(),
  token: Type.String(),
  userId: Type.Integer(),
  expiresAt: Type.Date(),
  ipAddress: Type.Optional(Type.String()),
  userAgent: Type.Optional(Type.String()),
  createdAt: Type.Date(),
})

export const AuditLogSchema = Type.Object({
  id: Type.BigInt(),
  action: Type.String(),
  tableName: Type.String(),
  recordId: Type.String(),
  payload: Type.Optional(Type.Unknown()),
  createdAt: Type.Date(),
})
