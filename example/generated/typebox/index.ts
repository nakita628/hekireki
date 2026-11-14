import { type Static, Type } from '@sinclair/typebox'

/**
 * Application user. Fully annotated for every validator generator,
 * with a UUIDv7 primary key, enum default, scalar list, @map columns,
 * @updatedAt, and relations of every cardinality.
 */
export const UserSchema = Type.Object({
  /** Primary key (UUIDv7) */
  id: Type.String({ format: 'uuid' }),
  /** Unique login email */
  email: Type.String({ format: 'email' }),
  /** Display name */
  name: Type.String({ minLength: 1, maxLength: 50 }),
  role: Type.Union([Type.Literal('ADMIN'), Type.Literal('EDITOR'), Type.Literal('VIEWER')]),
  interests: Type.String(),
  createdAt: Type.Date(),
  updatedAt: Type.Date(),
})

export type User = Static<typeof UserSchema>

/**
 * One-to-one relation with native @db.* types, literal defaults,
 * and optional scalars of every flavour. ConfigDict passthrough: the
 * Pydantic model rejects unknown keys (extra='forbid').
 */
export const ProfileSchema = Type.Object({
  id: Type.String(),
  userId: Type.String(),
  bio: Type.Optional(Type.String()),
  nickname: Type.String(),
  age: Type.Optional(Type.Integer()),
  balance: Type.Number(),
  verified: Type.Boolean(),
  meta: Type.Optional(Type.Unknown()),
  avatar: Type.Optional(Type.Any()),
  lastSeen: Type.Optional(Type.Date()),
})

export type Profile = Static<typeof ProfileSchema>

/**
 * @@map + @map column names, FK with a referential action,
 * mapped-enum default, and an implicit many-to-many to Tag.
 */
export const PostSchema = Type.Object({
  /** Primary key */
  id: Type.String({ format: 'uuid' }),
  /** Article title */
  title: Type.String({ minLength: 1, maxLength: 100 }),
  content: Type.Optional(Type.String()),
  visibility: Type.Union([
    Type.Literal('PUBLIC'),
    Type.Literal('PRIVATE'),
    Type.Literal('LINK_ONLY'),
  ]),
  published: Type.Boolean(),
  viewCount: Type.Integer(),
  authorId: Type.String(),
  createdAt: Type.Date(),
})

export type Post = Static<typeof PostSchema>

/** Implicit many-to-many partner of Post (join table `_PostToTag`). */
export const TagSchema = Type.Object({
  id: Type.Integer(),
  label: Type.String(),
})

export type Tag = Static<typeof TagSchema>

/**
 * Two foreign keys with different referential actions
 * (Cascade vs SetNull) and a composite index.
 */
export const CommentSchema = Type.Object({
  id: Type.Integer(),
  body: Type.String(),
  postId: Type.String(),
  authorId: Type.Optional(Type.String()),
  createdAt: Type.Date(),
})

export type Comment = Static<typeof CommentSchema>

/** Composite primary key + two named relations to the same model. */
export const FollowSchema = Type.Object({
  followerId: Type.String(),
  followingId: Type.String(),
  since: Type.Date(),
})

export type Follow = Static<typeof FollowSchema>

/** Self-relation (adjacency-list tree) with a composite unique. */
export const CategorySchema = Type.Object({
  id: Type.Integer(),
  name: Type.String(),
  parentId: Type.Optional(Type.Integer()),
})

export type Category = Static<typeof CategorySchema>

/** BigInt autoincrement primary key (bigserial) and money as Decimal. */
export const OrderSchema = Type.Object({
  id: Type.BigInt(),
  userId: Type.String(),
  total: Type.Number(),
  placedAt: Type.Date(),
})

export type Order = Static<typeof OrderSchema>

/** Child of Order with a composite unique constraint. */
export const OrderItemSchema = Type.Object({
  id: Type.BigInt(),
  orderId: Type.BigInt(),
  sku: Type.String(),
  qty: Type.Integer(),
  price: Type.Number(),
})

export type OrderItem = Static<typeof OrderItemSchema>

/** DB-side generated defaults (dbgenerated) plus Json / Bytes payloads. */
export const AuditLogSchema = Type.Object({
  id: Type.String(),
  action: Type.String(),
  payload: Type.Unknown(),
  signature: Type.Optional(Type.Any()),
  loggedAt: Type.Date(),
})

export type AuditLog = Static<typeof AuditLogSchema>

/**
 * Named implicit many-to-many: the join table is `_cast`,
 * not `_ActorToFilm`.
 */
export const ActorSchema = Type.Object({
  id: Type.Integer(),
  name: Type.String(),
})

export type Actor = Static<typeof ActorSchema>

export const FilmSchema = Type.Object({
  id: Type.Integer(),
  title: Type.String(),
})

export type Film = Static<typeof FilmSchema>

export const UserRelationsSchema = Type.Object({
  ...UserSchema.properties,
  profile: ProfileSchema,
  posts: Type.Array(PostSchema),
  comments: Type.Array(CommentSchema),
  orders: Type.Array(OrderSchema),
  followers: Type.Array(FollowSchema),
  following: Type.Array(FollowSchema),
})

export type UserRelations = Static<typeof UserRelationsSchema>

export const ProfileRelationsSchema = Type.Object({
  ...ProfileSchema.properties,
  user: UserSchema,
})

export type ProfileRelations = Static<typeof ProfileRelationsSchema>

export const PostRelationsSchema = Type.Object({
  ...PostSchema.properties,
  author: UserSchema,
  tags: Type.Array(TagSchema),
  comments: Type.Array(CommentSchema),
})

export type PostRelations = Static<typeof PostRelationsSchema>

export const TagRelationsSchema = Type.Object({
  ...TagSchema.properties,
  posts: Type.Array(PostSchema),
})

export type TagRelations = Static<typeof TagRelationsSchema>

export const CommentRelationsSchema = Type.Object({
  ...CommentSchema.properties,
  post: PostSchema,
  author: UserSchema,
})

export type CommentRelations = Static<typeof CommentRelationsSchema>

export const FollowRelationsSchema = Type.Object({
  ...FollowSchema.properties,
  follower: UserSchema,
  following: UserSchema,
})

export type FollowRelations = Static<typeof FollowRelationsSchema>

export const CategoryRelationsSchema = Type.Object({
  ...CategorySchema.properties,
  parent: CategorySchema,
  children: Type.Array(CategorySchema),
})

export type CategoryRelations = Static<typeof CategoryRelationsSchema>

export const OrderRelationsSchema = Type.Object({
  ...OrderSchema.properties,
  user: UserSchema,
  items: Type.Array(OrderItemSchema),
})

export type OrderRelations = Static<typeof OrderRelationsSchema>

export const OrderItemRelationsSchema = Type.Object({
  ...OrderItemSchema.properties,
  order: OrderSchema,
})

export type OrderItemRelations = Static<typeof OrderItemRelationsSchema>

export const ActorRelationsSchema = Type.Object({
  ...ActorSchema.properties,
  films: Type.Array(FilmSchema),
})

export type ActorRelations = Static<typeof ActorRelationsSchema>

export const FilmRelationsSchema = Type.Object({
  ...FilmSchema.properties,
  actors: Type.Array(ActorSchema),
})

export type FilmRelations = Static<typeof FilmRelationsSchema>
