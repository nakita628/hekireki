import * as z from 'zod'

export const UserSchema = z.object({
  /**
   * Primary key (UUIDv7)
   */
  id: z.uuid(),
  /**
   * Unique login email
   */
  email: z.email(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
  interests: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type User = z.infer<typeof UserSchema>

export const ProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  bio: z.string().exactOptional(),
  nickname: z.string(),
  age: z.number().exactOptional(),
  balance: z.number(),
  verified: z.boolean(),
  meta: z.unknown().exactOptional(),
  avatar: z.any().exactOptional(),
  lastSeen: z.iso.datetime().exactOptional(),
})

export type Profile = z.infer<typeof ProfileSchema>

export const PostSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Article title
   */
  title: z.string().min(1).max(100),
  content: z.string().exactOptional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'LINK_ONLY']),
  published: z.boolean(),
  viewCount: z.number(),
  authorId: z.string(),
  createdAt: z.iso.datetime(),
})

export type Post = z.infer<typeof PostSchema>

export const TagSchema = z.object({
  id: z.number(),
  label: z.string(),
})

export type Tag = z.infer<typeof TagSchema>

export const CommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  postId: z.string(),
  authorId: z.string().exactOptional(),
  createdAt: z.iso.datetime(),
})

export type Comment = z.infer<typeof CommentSchema>

export const FollowSchema = z.object({
  followerId: z.string(),
  followingId: z.string(),
  since: z.iso.datetime(),
})

export type Follow = z.infer<typeof FollowSchema>

export const CategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  parentId: z.number().exactOptional(),
})

export type Category = z.infer<typeof CategorySchema>

export const OrderSchema = z.object({
  id: z.bigint(),
  userId: z.string(),
  total: z.number(),
  placedAt: z.iso.datetime(),
})

export type Order = z.infer<typeof OrderSchema>

export const OrderItemSchema = z.object({
  id: z.bigint(),
  orderId: z.bigint(),
  sku: z.string(),
  qty: z.number(),
  price: z.number(),
})

export type OrderItem = z.infer<typeof OrderItemSchema>

export const AuditLogSchema = z.object({
  id: z.string(),
  action: z.string(),
  payload: z.unknown(),
  signature: z.any().exactOptional(),
  loggedAt: z.iso.datetime(),
})

export type AuditLog = z.infer<typeof AuditLogSchema>

export const ActorSchema = z.object({
  id: z.number(),
  name: z.string(),
})

export type Actor = z.infer<typeof ActorSchema>

export const FilmSchema = z.object({
  id: z.number(),
  title: z.string(),
})

export type Film = z.infer<typeof FilmSchema>

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  profile: ProfileSchema,
  posts: z.array(PostSchema),
  comments: z.array(CommentSchema),
  orders: z.array(OrderSchema),
  followers: z.array(FollowSchema),
  following: z.array(FollowSchema),
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
  tags: z.array(TagSchema),
  comments: z.array(CommentSchema),
})

export type PostRelations = z.infer<typeof PostRelationsSchema>

export const TagRelationsSchema = z.object({
  ...TagSchema.shape,
  posts: z.array(PostSchema),
})

export type TagRelations = z.infer<typeof TagRelationsSchema>

export const CommentRelationsSchema = z.object({
  ...CommentSchema.shape,
  post: PostSchema,
  author: UserSchema,
})

export type CommentRelations = z.infer<typeof CommentRelationsSchema>

export const FollowRelationsSchema = z.object({
  ...FollowSchema.shape,
  follower: UserSchema,
  following: UserSchema,
})

export type FollowRelations = z.infer<typeof FollowRelationsSchema>

export const CategoryRelationsSchema = z.object({
  ...CategorySchema.shape,
  parent: CategorySchema,
  children: z.array(CategorySchema),
})

export type CategoryRelations = z.infer<typeof CategoryRelationsSchema>

export const OrderRelationsSchema = z.object({
  ...OrderSchema.shape,
  user: UserSchema,
  items: z.array(OrderItemSchema),
})

export type OrderRelations = z.infer<typeof OrderRelationsSchema>

export const OrderItemRelationsSchema = z.object({
  ...OrderItemSchema.shape,
  order: OrderSchema,
})

export type OrderItemRelations = z.infer<typeof OrderItemRelationsSchema>

export const ActorRelationsSchema = z.object({
  ...ActorSchema.shape,
  films: z.array(FilmSchema),
})

export type ActorRelations = z.infer<typeof ActorRelationsSchema>

export const FilmRelationsSchema = z.object({
  ...FilmSchema.shape,
  actors: z.array(ActorSchema),
})

export type FilmRelations = z.infer<typeof FilmRelationsSchema>
