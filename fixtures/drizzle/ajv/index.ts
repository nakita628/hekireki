import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    email: { type: 'string' as const },
    name: { type: 'string' as const },
    bio: { type: 'string' as const },
    avatarUrl: { type: 'string' as const },
    role: { enum: ['ADMIN', 'USER', 'GUEST'] as const },
    active: { type: 'boolean' as const },
    score: { type: 'number' as const },
    tags: { type: 'string' as const },
    metadata: {},
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: [
    'id',
    'email',
    'name',
    'role',
    'active',
    'score',
    'tags',
    'createdAt',
    'updatedAt',
  ] as const,
  additionalProperties: false,
} as const

export const ProfileSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    userId: { type: 'integer' as const },
    website: { type: 'string' as const },
    location: { type: 'string' as const },
    birthDate: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'userId'] as const,
  additionalProperties: false,
} as const

export const PostSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    title: { type: 'string' as const },
    slug: { type: 'string' as const },
    content: { type: 'string' as const },
    status: { enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const },
    views: { type: 'integer' as const },
    authorId: { type: 'integer' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: [
    'id',
    'title',
    'slug',
    'content',
    'status',
    'views',
    'authorId',
    'createdAt',
    'updatedAt',
  ] as const,
  additionalProperties: false,
} as const

export const CommentSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    body: { type: 'string' as const },
    postId: { type: 'integer' as const },
    authorId: { type: 'integer' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'body', 'postId', 'authorId', 'createdAt'] as const,
  additionalProperties: false,
} as const

export const TagSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    name: { type: 'string' as const },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const

export const PostTagSchema = {
  type: 'object' as const,
  properties: {
    postId: { type: 'integer' as const },
    tagId: { type: 'integer' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['postId', 'tagId', 'createdAt'] as const,
  additionalProperties: false,
} as const

export const SessionSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    token: { type: 'string' as const },
    userId: { type: 'integer' as const },
    expiresAt: { type: 'string' as const, format: 'date-time' as const },
    ipAddress: { type: 'string' as const },
    userAgent: { type: 'string' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'token', 'userId', 'expiresAt', 'createdAt'] as const,
  additionalProperties: false,
} as const

export const AuditLogSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    action: { type: 'string' as const },
    tableName: { type: 'string' as const },
    recordId: { type: 'string' as const },
    payload: {},
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'action', 'tableName', 'recordId', 'createdAt'] as const,
  additionalProperties: false,
} as const
