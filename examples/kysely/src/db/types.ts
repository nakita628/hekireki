import type { ColumnType } from 'kysely'

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>

export type Role = 'customer' | 'staff' | 'ADMIN'

export type Genre = "rock 'n' roll" | 'hip-hop' | 'jazz' | 'CLASSICAL'

export type Format = 'LP' | 'EP' | 'SINGLE' | 'CASSETTE'

export interface User {
  id: Generated<number>
  email: string
  display_name: string | null
  role: Generated<Role>
  is_active: Generated<number>
  created_at: Generated<string>
  updated_at: string
  referrer_id: number | null
}

export interface Profile {
  id: string
  user_id: number
  bio: string | null
  avatar: Buffer | null
}

export interface Artist {
  id: Generated<number>
  name: string
}

export interface Record {
  id: string
  title: string
  catalogue_no: ColumnType<number, number | bigint, number | bigint>
  price: ColumnType<number, number | string, number | string>
  rating: number | null
  tracks: Generated<number>
  in_stock: Generated<number>
  released_on: string | null
  tracklist: ColumnType<string | number, string, string>
  cover: Buffer | null
  genre: Genre
  format: Generated<Format>
  artist_id: number
  created_at: Generated<string>
  updated_at: string
}

export interface Tag {
  id: Generated<number>
  name: string
}

export interface Order {
  id: string
  customer_id: Generated<number>
  placed_at: Generated<string>
  note: string | null
}

export interface OrderItem {
  order_id: string
  record_id: string
  quantity: Generated<number>
  unit_price: ColumnType<number, number | string, number | string>
}

export interface Review {
  id: Generated<number>
  record_id: string
  author_id: number
  stars: number
  weight: Generated<number>
  body: Generated<string>
}

export interface Setting {
  key: string
  type: string
  default: string | null
  delete: Generated<number>
  constructor: string | null
  'last-modified': Generated<string>
}

export interface Wishlist {
  A: string
  B: number
}

export interface RecordToTag {
  A: string
  B: number
}

export interface DB {
  users: User
  profiles: Profile
  artists: Artist
  records: Record
  tags: Tag
  orders: Order
  order_items: OrderItem
  reviews: Review
  'shop settings': Setting
  _Wishlist: Wishlist
  _RecordToTag: RecordToTag
}
