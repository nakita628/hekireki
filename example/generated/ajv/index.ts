import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Primary key (UUIDv7)
     */
    id: { type: 'string' as const, format: 'uuid' as const },
    /**
     * Unique login email
     */
    email: { type: 'string' as const, format: 'email' as const },
    /**
     * Display name
     */
    name: { type: 'string' as const, minLength: 1, maxLength: 50 },
    role: { enum: ['ADMIN', 'EDITOR', 'VIEWER'] as const },
    interests: { type: 'string' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'email', 'name', 'role', 'interests', 'createdAt', 'updatedAt'] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const ProfileSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    userId: { type: 'string' as const },
    bio: { type: 'string' as const },
    nickname: { type: 'string' as const },
    age: { type: 'integer' as const },
    balance: { type: 'number' as const },
    verified: { type: 'boolean' as const },
    meta: {},
    avatar: { type: 'string' as const },
    lastSeen: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'userId', 'nickname', 'balance', 'verified'] as const,
  additionalProperties: false,
} as const

export type Profile = FromSchema<typeof ProfileSchema>

export const PostSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Primary key
     */
    id: { type: 'string' as const, format: 'uuid' as const },
    /**
     * Article title
     */
    title: { type: 'string' as const, minLength: 1, maxLength: 100 },
    content: { type: 'string' as const },
    visibility: { enum: ['PUBLIC', 'PRIVATE', 'LINK_ONLY'] as const },
    published: { type: 'boolean' as const },
    viewCount: { type: 'integer' as const },
    authorId: { type: 'string' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: [
    'id',
    'title',
    'visibility',
    'published',
    'viewCount',
    'authorId',
    'createdAt',
  ] as const,
  additionalProperties: false,
} as const

export type Post = FromSchema<typeof PostSchema>

export const TagSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    label: { type: 'string' as const },
  },
  required: ['id', 'label'] as const,
  additionalProperties: false,
} as const

export type Tag = FromSchema<typeof TagSchema>

export const CommentSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    body: { type: 'string' as const },
    postId: { type: 'string' as const },
    authorId: { type: 'string' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'body', 'postId', 'createdAt'] as const,
  additionalProperties: false,
} as const

export type Comment = FromSchema<typeof CommentSchema>

export const FollowSchema = {
  type: 'object' as const,
  properties: {
    followerId: { type: 'string' as const },
    followingId: { type: 'string' as const },
    since: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['followerId', 'followingId', 'since'] as const,
  additionalProperties: false,
} as const

export type Follow = FromSchema<typeof FollowSchema>

export const CategorySchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    name: { type: 'string' as const },
    parentId: { type: 'integer' as const },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const

export type Category = FromSchema<typeof CategorySchema>

export const OrderSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    userId: { type: 'string' as const },
    total: { type: 'number' as const },
    placedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'userId', 'total', 'placedAt'] as const,
  additionalProperties: false,
} as const

export type Order = FromSchema<typeof OrderSchema>

export const OrderItemSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    orderId: { type: 'integer' as const },
    sku: { type: 'string' as const },
    qty: { type: 'integer' as const },
    price: { type: 'number' as const },
  },
  required: ['id', 'orderId', 'sku', 'qty', 'price'] as const,
  additionalProperties: false,
} as const

export type OrderItem = FromSchema<typeof OrderItemSchema>

export const AuditLogSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    action: { type: 'string' as const },
    payload: {},
    signature: { type: 'string' as const },
    loggedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'action', 'payload', 'loggedAt'] as const,
  additionalProperties: false,
} as const

export type AuditLog = FromSchema<typeof AuditLogSchema>

export const ActorSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    name: { type: 'string' as const },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const

export type Actor = FromSchema<typeof ActorSchema>

export const FilmSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    title: { type: 'string' as const },
  },
  required: ['id', 'title'] as const,
  additionalProperties: false,
} as const

export type Film = FromSchema<typeof FilmSchema>

export const UserRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserSchema.properties,
    profile: ProfileSchema,
    posts: { type: 'array' as const, items: PostSchema },
    comments: { type: 'array' as const, items: CommentSchema },
    orders: { type: 'array' as const, items: OrderSchema },
    followers: { type: 'array' as const, items: FollowSchema },
    following: { type: 'array' as const, items: FollowSchema },
  },
  additionalProperties: false,
} as const

export type UserRelations = FromSchema<typeof UserRelationsSchema>

export const ProfileRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...ProfileSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type ProfileRelations = FromSchema<typeof ProfileRelationsSchema>

export const PostRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...PostSchema.properties,
    author: UserSchema,
    tags: { type: 'array' as const, items: TagSchema },
    comments: { type: 'array' as const, items: CommentSchema },
  },
  additionalProperties: false,
} as const

export type PostRelations = FromSchema<typeof PostRelationsSchema>

export const TagRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...TagSchema.properties,
    posts: { type: 'array' as const, items: PostSchema },
  },
  additionalProperties: false,
} as const

export type TagRelations = FromSchema<typeof TagRelationsSchema>

export const CommentRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...CommentSchema.properties,
    post: PostSchema,
    author: UserSchema,
  },
  additionalProperties: false,
} as const

export type CommentRelations = FromSchema<typeof CommentRelationsSchema>

export const FollowRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...FollowSchema.properties,
    follower: UserSchema,
    following: UserSchema,
  },
  additionalProperties: false,
} as const

export type FollowRelations = FromSchema<typeof FollowRelationsSchema>

export const CategoryRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...CategorySchema.properties,
    parent: CategorySchema,
    children: { type: 'array' as const, items: CategorySchema },
  },
  additionalProperties: false,
} as const

export type CategoryRelations = FromSchema<typeof CategoryRelationsSchema>

export const OrderRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...OrderSchema.properties,
    user: UserSchema,
    items: { type: 'array' as const, items: OrderItemSchema },
  },
  additionalProperties: false,
} as const

export type OrderRelations = FromSchema<typeof OrderRelationsSchema>

export const OrderItemRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...OrderItemSchema.properties,
    order: OrderSchema,
  },
  additionalProperties: false,
} as const

export type OrderItemRelations = FromSchema<typeof OrderItemRelationsSchema>

export const ActorRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...ActorSchema.properties,
    films: { type: 'array' as const, items: FilmSchema },
  },
  additionalProperties: false,
} as const

export type ActorRelations = FromSchema<typeof ActorRelationsSchema>

export const FilmRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...FilmSchema.properties,
    actors: { type: 'array' as const, items: ActorSchema },
  },
  additionalProperties: false,
} as const

export type FilmRelations = FromSchema<typeof FilmRelationsSchema>
