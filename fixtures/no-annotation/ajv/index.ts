import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    email: { type: 'string' as const },
    name: { type: 'string' as const },
    age: { type: 'integer' as const },
    isActive: { type: 'boolean' as const },
    role: { enum: ['ADMIN', 'MEMBER', 'GUEST'] as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'email', 'isActive', 'role', 'createdAt', 'updatedAt'] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const PostSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    title: { type: 'string' as const },
    content: { type: 'string' as const },
    published: { type: 'boolean' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
    authorId: { type: 'string' as const },
  },
  required: ['id', 'title', 'content', 'published', 'createdAt', 'updatedAt', 'authorId'] as const,
  additionalProperties: false,
} as const

export type Post = FromSchema<typeof PostSchema>

export const ProfileSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    bio: { type: 'string' as const },
    avatar: { type: 'string' as const },
    userId: { type: 'string' as const },
  },
  required: ['id', 'userId'] as const,
  additionalProperties: false,
} as const

export type Profile = FromSchema<typeof ProfileSchema>

export const TagSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    name: { type: 'string' as const },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const

export type Tag = FromSchema<typeof TagSchema>

export const UserRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserSchema.properties,
    posts: { type: 'array' as const, items: PostSchema },
    profile: ProfileSchema,
  },
  additionalProperties: false,
} as const

export type UserRelations = FromSchema<typeof UserRelationsSchema>

export const PostRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...PostSchema.properties,
    author: UserSchema,
    tags: { type: 'array' as const, items: TagSchema },
  },
  additionalProperties: false,
} as const

export type PostRelations = FromSchema<typeof PostRelationsSchema>

export const ProfileRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...ProfileSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type ProfileRelations = FromSchema<typeof ProfileRelationsSchema>

export const TagRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...TagSchema.properties,
    posts: { type: 'array' as const, items: PostSchema },
  },
  additionalProperties: false,
} as const

export type TagRelations = FromSchema<typeof TagRelationsSchema>
