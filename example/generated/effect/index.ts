import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  /**
   * Primary key (UUIDv7)
   */
  id: Schema.UUID,
  /**
   * Unique login email
   */
  email: Schema.String.pipe(Schema.pattern(/^[^@]+@[^@]+\.[^@]+$/)),
  /**
   * Display name
   */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
  role: Schema.Literal('ADMIN', 'EDITOR', 'VIEWER'),
  interests: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

export type User = typeof UserSchema.Type

export const ProfileSchema = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  bio: Schema.String,
  nickname: Schema.String,
  age: Schema.Number,
  balance: Schema.Number,
  verified: Schema.Boolean,
  meta: Schema.Unknown,
  avatar: Schema.Unknown,
  lastSeen: Schema.Date,
})

export type Profile = typeof ProfileSchema.Type

export const PostSchema = Schema.Struct({
  /**
   * Primary key
   */
  id: Schema.UUID,
  /**
   * Article title
   */
  title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  content: Schema.String,
  visibility: Schema.Literal('PUBLIC', 'PRIVATE', 'LINK_ONLY'),
  published: Schema.Boolean,
  viewCount: Schema.Number,
  authorId: Schema.String,
  createdAt: Schema.Date,
})

export type Post = typeof PostSchema.Type

export const TagSchema = Schema.Struct({
  id: Schema.Number,
  label: Schema.String,
})

export type Tag = typeof TagSchema.Type

export const CommentSchema = Schema.Struct({
  id: Schema.Number,
  body: Schema.String,
  postId: Schema.String,
  authorId: Schema.String,
  createdAt: Schema.Date,
})

export type Comment = typeof CommentSchema.Type

export const FollowSchema = Schema.Struct({
  followerId: Schema.String,
  followingId: Schema.String,
  since: Schema.Date,
})

export type Follow = typeof FollowSchema.Type

export const CategorySchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  parentId: Schema.Number,
})

export type Category = typeof CategorySchema.Type

export const OrderSchema = Schema.Struct({
  id: Schema.BigIntFromSelf,
  userId: Schema.String,
  total: Schema.Number,
  placedAt: Schema.Date,
})

export type Order = typeof OrderSchema.Type

export const OrderItemSchema = Schema.Struct({
  id: Schema.BigIntFromSelf,
  orderId: Schema.BigIntFromSelf,
  sku: Schema.String,
  qty: Schema.Number,
  price: Schema.Number,
})

export type OrderItem = typeof OrderItemSchema.Type

export const AuditLogSchema = Schema.Struct({
  id: Schema.String,
  action: Schema.String,
  payload: Schema.Unknown,
  signature: Schema.Unknown,
  loggedAt: Schema.Date,
})

export type AuditLog = typeof AuditLogSchema.Type

export const ActorSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
})

export type Actor = typeof ActorSchema.Type

export const FilmSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
})

export type Film = typeof FilmSchema.Type

export const UserRelationsSchema = Schema.Struct({
  ...UserSchema.fields,
  profile: ProfileSchema,
  posts: Schema.Array(PostSchema),
  comments: Schema.Array(CommentSchema),
  orders: Schema.Array(OrderSchema),
  followers: Schema.Array(FollowSchema),
  following: Schema.Array(FollowSchema),
})

export type UserRelations = typeof UserRelationsSchema.Type

export const ProfileRelationsSchema = Schema.Struct({ ...ProfileSchema.fields, user: UserSchema })

export type ProfileRelations = typeof ProfileRelationsSchema.Type

export const PostRelationsSchema = Schema.Struct({
  ...PostSchema.fields,
  author: UserSchema,
  tags: Schema.Array(TagSchema),
  comments: Schema.Array(CommentSchema),
})

export type PostRelations = typeof PostRelationsSchema.Type

export const TagRelationsSchema = Schema.Struct({
  ...TagSchema.fields,
  posts: Schema.Array(PostSchema),
})

export type TagRelations = typeof TagRelationsSchema.Type

export const CommentRelationsSchema = Schema.Struct({
  ...CommentSchema.fields,
  post: PostSchema,
  author: UserSchema,
})

export type CommentRelations = typeof CommentRelationsSchema.Type

export const FollowRelationsSchema = Schema.Struct({
  ...FollowSchema.fields,
  follower: UserSchema,
  following: UserSchema,
})

export type FollowRelations = typeof FollowRelationsSchema.Type

export const CategoryRelationsSchema = Schema.Struct({
  ...CategorySchema.fields,
  parent: CategorySchema,
  children: Schema.Array(CategorySchema),
})

export type CategoryRelations = typeof CategoryRelationsSchema.Type

export const OrderRelationsSchema = Schema.Struct({
  ...OrderSchema.fields,
  user: UserSchema,
  items: Schema.Array(OrderItemSchema),
})

export type OrderRelations = typeof OrderRelationsSchema.Type

export const OrderItemRelationsSchema = Schema.Struct({
  ...OrderItemSchema.fields,
  order: OrderSchema,
})

export type OrderItemRelations = typeof OrderItemRelationsSchema.Type

export const ActorRelationsSchema = Schema.Struct({
  ...ActorSchema.fields,
  films: Schema.Array(FilmSchema),
})

export type ActorRelations = typeof ActorRelationsSchema.Type

export const FilmRelationsSchema = Schema.Struct({
  ...FilmSchema.fields,
  actors: Schema.Array(ActorSchema),
})

export type FilmRelations = typeof FilmRelationsSchema.Type
