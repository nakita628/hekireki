import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    /** Primary key */
    id: { type: 'string' as const },
    /** Display name */
    name: { type: 'string' as const },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const PostSchema = {
  type: 'object' as const,
  properties: {
    /** Primary key */
    id: { type: 'string' as const },
    /** Article title */
    title: { type: 'string' as const },
    /** Body content (no length limit) */
    content: { type: 'string' as const },
    /** Foreign key referencing User.id */
    userId: { type: 'string' as const },
  },
  required: ['id', 'title', 'content', 'userId'] as const,
  additionalProperties: false,
} as const

export type Post = FromSchema<typeof PostSchema>

export const UserRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserSchema.properties,
    posts: { type: 'array' as const, items: PostSchema },
  },
  additionalProperties: false,
} as const

export type UserRelations = FromSchema<typeof UserRelationsSchema>

export const PostRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...PostSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type PostRelations = FromSchema<typeof PostRelationsSchema>
