import { type } from 'arktype'

/**
 * Application user. Fully annotated for every validator generator,
 * with a UUIDv7 primary key, enum default, scalar list, @map columns,
 * @updatedAt, and relations of every cardinality.
 */
export const UserSchema = type({
  /** Primary key (UUIDv7) */
  id: 'string.uuid',
  /** Unique login email */
  email: 'string.email',
  /** Display name */
  name: '1 <= string <= 50',
  role: "'ADMIN' | 'EDITOR' | 'VIEWER'",
  interests: 'string',
  createdAt: 'Date',
  updatedAt: 'Date',
})

export type User = typeof UserSchema.infer

/**
 * One-to-one relation with native @db.* types, literal defaults,
 * and optional scalars of every flavour. ConfigDict passthrough: the
 * Pydantic model rejects unknown keys (extra='forbid').
 */
export const ProfileSchema = type({
  id: 'string',
  userId: 'string',
  bio: 'string',
  nickname: 'string',
  age: 'number',
  balance: 'number',
  verified: 'boolean',
  meta: 'unknown',
  avatar: 'unknown',
  lastSeen: 'Date',
})

export type Profile = typeof ProfileSchema.infer

/**
 * @@map + @map column names, FK with a referential action,
 * mapped-enum default, and an implicit many-to-many to Tag.
 */
export const PostSchema = type({
  /** Primary key */
  id: 'string.uuid',
  /** Article title */
  title: '1 <= string <= 100',
  content: 'string',
  visibility: "'PUBLIC' | 'PRIVATE' | 'LINK_ONLY'",
  published: 'boolean',
  viewCount: 'number',
  authorId: 'string',
  createdAt: 'Date',
})

export type Post = typeof PostSchema.infer

/** Implicit many-to-many partner of Post (join table `_PostToTag`). */
export const TagSchema = type({
  id: 'number',
  label: 'string',
})

export type Tag = typeof TagSchema.infer

/**
 * Two foreign keys with different referential actions
 * (Cascade vs SetNull) and a composite index.
 */
export const CommentSchema = type({
  id: 'number',
  body: 'string',
  postId: 'string',
  authorId: 'string',
  createdAt: 'Date',
})

export type Comment = typeof CommentSchema.infer

/** Composite primary key + two named relations to the same model. */
export const FollowSchema = type({
  followerId: 'string',
  followingId: 'string',
  since: 'Date',
})

export type Follow = typeof FollowSchema.infer

/** Self-relation (adjacency-list tree) with a composite unique. */
export const CategorySchema = type({
  id: 'number',
  name: 'string',
  parentId: 'number',
})

export type Category = typeof CategorySchema.infer

/** BigInt autoincrement primary key (bigserial) and money as Decimal. */
export const OrderSchema = type({
  id: 'bigint',
  userId: 'string',
  total: 'number',
  placedAt: 'Date',
})

export type Order = typeof OrderSchema.infer

/** Child of Order with a composite unique constraint. */
export const OrderItemSchema = type({
  id: 'bigint',
  orderId: 'bigint',
  sku: 'string',
  qty: 'number',
  price: 'number',
})

export type OrderItem = typeof OrderItemSchema.infer

/** DB-side generated defaults (dbgenerated) plus Json / Bytes payloads. */
export const AuditLogSchema = type({
  id: 'string',
  action: 'string',
  payload: 'unknown',
  signature: 'unknown',
  loggedAt: 'Date',
})

export type AuditLog = typeof AuditLogSchema.infer

/**
 * Named implicit many-to-many: the join table is `_cast`,
 * not `_ActorToFilm`.
 */
export const ActorSchema = type({
  id: 'number',
  name: 'string',
})

export type Actor = typeof ActorSchema.infer

export const FilmSchema = type({
  id: 'number',
  title: 'string',
})

export type Film = typeof FilmSchema.infer

export const UserRelationsSchema = type({
  ...UserSchema.t,
  profile: ProfileSchema,
  posts: PostSchema.array(),
  comments: CommentSchema.array(),
  orders: OrderSchema.array(),
  followers: FollowSchema.array(),
  following: FollowSchema.array(),
})

export type UserRelations = typeof UserRelationsSchema.infer

export const ProfileRelationsSchema = type({ ...ProfileSchema.t, user: UserSchema })

export type ProfileRelations = typeof ProfileRelationsSchema.infer

export const PostRelationsSchema = type({
  ...PostSchema.t,
  author: UserSchema,
  tags: TagSchema.array(),
  comments: CommentSchema.array(),
})

export type PostRelations = typeof PostRelationsSchema.infer

export const TagRelationsSchema = type({ ...TagSchema.t, posts: PostSchema.array() })

export type TagRelations = typeof TagRelationsSchema.infer

export const CommentRelationsSchema = type({
  ...CommentSchema.t,
  post: PostSchema,
  author: UserSchema,
})

export type CommentRelations = typeof CommentRelationsSchema.infer

export const FollowRelationsSchema = type({
  ...FollowSchema.t,
  follower: UserSchema,
  following: UserSchema,
})

export type FollowRelations = typeof FollowRelationsSchema.infer

export const CategoryRelationsSchema = type({
  ...CategorySchema.t,
  parent: CategorySchema,
  children: CategorySchema.array(),
})

export type CategoryRelations = typeof CategoryRelationsSchema.infer

export const OrderRelationsSchema = type({
  ...OrderSchema.t,
  user: UserSchema,
  items: OrderItemSchema.array(),
})

export type OrderRelations = typeof OrderRelationsSchema.infer

export const OrderItemRelationsSchema = type({ ...OrderItemSchema.t, order: OrderSchema })

export type OrderItemRelations = typeof OrderItemRelationsSchema.infer

export const ActorRelationsSchema = type({ ...ActorSchema.t, films: FilmSchema.array() })

export type ActorRelations = typeof ActorRelationsSchema.infer

export const FilmRelationsSchema = type({ ...FilmSchema.t, actors: ActorSchema.array() })

export type FilmRelations = typeof FilmRelationsSchema.infer
