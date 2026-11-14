import type { ColumnType } from 'kysely'

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>

export type Timestamp = ColumnType<Date, Date | string, Date | string>

/** User role. No @map: the value names are stored verbatim. */
export type Role = 'ADMIN' | 'EDITOR' | 'VIEWER'

/**
 * Enum with @map on every value and @@map on the enum itself:
 * the database stores the mapped values ("link_only"), while
 * generators receive the Prisma-level names ("LINK_ONLY").
 */
export type Visibility = 'public' | 'private' | 'link_only'

/**
 * Application user. Fully annotated for every validator generator,
 * with a UUIDv7 primary key, enum default, scalar list, @map columns,
 * @updatedAt, and relations of every cardinality.
 */
export interface User {
  /** Primary key (UUIDv7) */
  id: string
  /** Unique login email */
  email: string
  /** Display name */
  name: string
  role: Generated<Role>
  interests: Generated<string[]>
  created_at: Generated<Timestamp>
  updated_at: Timestamp
}

/**
 * One-to-one relation with native @db.* types, literal defaults,
 * and optional scalars of every flavour. ConfigDict passthrough: the
 * Pydantic model rejects unknown keys (extra='forbid').
 */
export interface Profile {
  id: string
  user_id: string
  bio: string | null
  nickname: Generated<string>
  age: number | null
  balance: Generated<string>
  verified: Generated<boolean>
  meta: unknown
  avatar: Buffer | null
  last_seen: Timestamp | null
}

/**
 * @@map + @map column names, FK with a referential action,
 * mapped-enum default, and an implicit many-to-many to Tag.
 */
export interface Post {
  /** Primary key */
  id: string
  /** Article title */
  title: string
  content: string | null
  visibility: Generated<Visibility>
  published: Generated<boolean>
  view_count: Generated<number>
  author_id: string
  created_at: Generated<Timestamp>
}

/** Implicit many-to-many partner of Post (join table `_PostToTag`). */
export interface Tag {
  id: Generated<number>
  label: string
}

/**
 * Two foreign keys with different referential actions
 * (Cascade vs SetNull) and a composite index.
 */
export interface Comment {
  id: Generated<number>
  body: string
  post_id: string
  author_id: string | null
  created_at: Generated<Timestamp>
}

/** Composite primary key + two named relations to the same model. */
export interface Follow {
  follower_id: string
  following_id: string
  since: Generated<Timestamp>
}

/** Self-relation (adjacency-list tree) with a composite unique. */
export interface Category {
  id: Generated<number>
  name: string
  parent_id: number | null
}

/** BigInt autoincrement primary key (bigserial) and money as Decimal. */
export interface Order {
  id: Generated<bigint>
  user_id: string
  total: string
  placed_at: Generated<Timestamp>
}

/** Child of Order with a composite unique constraint. */
export interface OrderItem {
  id: Generated<bigint>
  order_id: bigint
  sku: string
  qty: Generated<number>
  price: string
}

/** DB-side generated defaults (dbgenerated) plus Json / Bytes payloads. */
export interface AuditLog {
  id: Generated<string>
  action: string
  payload: Generated<unknown>
  signature: Buffer | null
  logged_at: Generated<Timestamp>
}

/**
 * Named implicit many-to-many: the join table is `_cast`,
 * not `_ActorToFilm`.
 */
export interface Actor {
  id: Generated<number>
  name: string
}

export interface Film {
  id: Generated<number>
  title: string
}

export interface PostToTag {
  A: string
  B: number
}

export interface Cast {
  A: number
  B: number
}

export interface DB {
  users: User
  Profile: Profile
  posts: Post
  Tag: Tag
  comments: Comment
  follows: Follow
  Category: Category
  orders: Order
  order_items: OrderItem
  audit_logs: AuditLog
  Actor: Actor
  Film: Film
  _PostToTag: PostToTag
  _cast: Cast
}
