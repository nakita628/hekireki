import type { ColumnType } from 'kysely'

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>

export type Timestamp = ColumnType<Date, Date | string, Date | string>

export type Role = 'ADMIN' | 'EDITOR' | 'VIEWER'

export type Visibility = 'public' | 'private' | 'link_only'

export interface User {
  id: string
  email: string
  name: string
  role: Generated<Role>
  interests: Generated<string[]>
  created_at: Generated<Timestamp>
  updated_at: Timestamp
}

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

export interface Post {
  id: string
  title: string
  content: string | null
  visibility: Generated<Visibility>
  published: Generated<boolean>
  view_count: Generated<number>
  author_id: string
  created_at: Generated<Timestamp>
}

export interface Tag {
  id: Generated<number>
  label: string
}

export interface Comment {
  id: Generated<number>
  body: string
  post_id: string
  author_id: string | null
  created_at: Generated<Timestamp>
}

export interface Follow {
  follower_id: string
  following_id: string
  since: Generated<Timestamp>
}

export interface Category {
  id: Generated<number>
  name: string
  parent_id: number | null
}

export interface Order {
  id: Generated<bigint>
  user_id: string
  total: string
  placed_at: Generated<Timestamp>
}

export interface OrderItem {
  id: Generated<bigint>
  order_id: bigint
  sku: string
  qty: Generated<number>
  price: string
}

export interface AuditLog {
  id: Generated<string>
  action: string
  payload: Generated<unknown>
  signature: Buffer | null
  logged_at: Generated<Timestamp>
}

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
