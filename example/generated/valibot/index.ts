import * as v from 'valibot'

export const UserSchema = v.object({
  /**
   * Primary key (UUIDv7)
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Unique login email
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
  role: v.picklist(['ADMIN', 'EDITOR', 'VIEWER']),
  interests: v.string(),
  createdAt: v.date(),
  updatedAt: v.date(),
})

export type User = v.InferOutput<typeof UserSchema>

export const ProfileSchema = v.object({
  id: v.string(),
  userId: v.string(),
  bio: v.exactOptional(v.string()),
  nickname: v.string(),
  age: v.exactOptional(v.number()),
  balance: v.number(),
  verified: v.boolean(),
  meta: v.exactOptional(v.unknown()),
  avatar: v.exactOptional(v.any()),
  lastSeen: v.exactOptional(v.date()),
})

export type Profile = v.InferOutput<typeof ProfileSchema>

export const PostSchema = v.object({
  /**
   * Primary key
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Article title
   */
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  content: v.exactOptional(v.string()),
  visibility: v.picklist(['PUBLIC', 'PRIVATE', 'LINK_ONLY']),
  published: v.boolean(),
  viewCount: v.number(),
  authorId: v.string(),
  createdAt: v.date(),
})

export type Post = v.InferOutput<typeof PostSchema>

export const TagSchema = v.object({
  id: v.number(),
  label: v.string(),
})

export type Tag = v.InferOutput<typeof TagSchema>

export const CommentSchema = v.object({
  id: v.number(),
  body: v.string(),
  postId: v.string(),
  authorId: v.exactOptional(v.string()),
  createdAt: v.date(),
})

export type Comment = v.InferOutput<typeof CommentSchema>

export const FollowSchema = v.object({
  followerId: v.string(),
  followingId: v.string(),
  since: v.date(),
})

export type Follow = v.InferOutput<typeof FollowSchema>

export const CategorySchema = v.object({
  id: v.number(),
  name: v.string(),
  parentId: v.exactOptional(v.number()),
})

export type Category = v.InferOutput<typeof CategorySchema>

export const OrderSchema = v.object({
  id: v.bigint(),
  userId: v.string(),
  total: v.number(),
  placedAt: v.date(),
})

export type Order = v.InferOutput<typeof OrderSchema>

export const OrderItemSchema = v.object({
  id: v.bigint(),
  orderId: v.bigint(),
  sku: v.string(),
  qty: v.number(),
  price: v.number(),
})

export type OrderItem = v.InferOutput<typeof OrderItemSchema>

export const AuditLogSchema = v.object({
  id: v.string(),
  action: v.string(),
  payload: v.unknown(),
  signature: v.exactOptional(v.any()),
  loggedAt: v.date(),
})

export type AuditLog = v.InferOutput<typeof AuditLogSchema>

export const ActorSchema = v.object({
  id: v.number(),
  name: v.string(),
})

export type Actor = v.InferOutput<typeof ActorSchema>

export const FilmSchema = v.object({
  id: v.number(),
  title: v.string(),
})

export type Film = v.InferOutput<typeof FilmSchema>

export const UserRelationsSchema = v.object({
  ...UserSchema.entries,
  profile: ProfileSchema,
  posts: v.array(PostSchema),
  comments: v.array(CommentSchema),
  orders: v.array(OrderSchema),
  followers: v.array(FollowSchema),
  following: v.array(FollowSchema),
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
  tags: v.array(TagSchema),
  comments: v.array(CommentSchema),
})

export type PostRelations = v.InferOutput<typeof PostRelationsSchema>

export const TagRelationsSchema = v.object({
  ...TagSchema.entries,
  posts: v.array(PostSchema),
})

export type TagRelations = v.InferOutput<typeof TagRelationsSchema>

export const CommentRelationsSchema = v.object({
  ...CommentSchema.entries,
  post: PostSchema,
  author: UserSchema,
})

export type CommentRelations = v.InferOutput<typeof CommentRelationsSchema>

export const FollowRelationsSchema = v.object({
  ...FollowSchema.entries,
  follower: UserSchema,
  following: UserSchema,
})

export type FollowRelations = v.InferOutput<typeof FollowRelationsSchema>

export const CategoryRelationsSchema = v.object({
  ...CategorySchema.entries,
  parent: CategorySchema,
  children: v.array(CategorySchema),
})

export type CategoryRelations = v.InferOutput<typeof CategoryRelationsSchema>

export const OrderRelationsSchema = v.object({
  ...OrderSchema.entries,
  user: UserSchema,
  items: v.array(OrderItemSchema),
})

export type OrderRelations = v.InferOutput<typeof OrderRelationsSchema>

export const OrderItemRelationsSchema = v.object({
  ...OrderItemSchema.entries,
  order: OrderSchema,
})

export type OrderItemRelations = v.InferOutput<typeof OrderItemRelationsSchema>

export const ActorRelationsSchema = v.object({
  ...ActorSchema.entries,
  films: v.array(FilmSchema),
})

export type ActorRelations = v.InferOutput<typeof ActorRelationsSchema>

export const FilmRelationsSchema = v.object({
  ...FilmSchema.entries,
  actors: v.array(ActorSchema),
})

export type FilmRelations = v.InferOutput<typeof FilmRelationsSchema>
