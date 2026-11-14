import type { ColumnType } from 'kysely'

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>

/** Who may do what. A value the database holds under another name is the name Kysely reads. */
export type Role = 'customer' | 'staff' | 'ADMIN'

/**
 * Values the database holds are not always identifiers: one has a hyphen, one an apostrophe,
 * which the generated union has to quote.
 */
export type Genre = "rock 'n' roll" | 'hip-hop' | 'jazz' | 'CLASSICAL'

export type Format = 'LP' | 'EP' | 'SINGLE' | 'CASSETTE'

/**
 * A customer, and the shop's own account (id 1), which an order passes to when its customer
 * goes: see `Order.customer`.
 */
export interface User {
  id: Generated<number>
  email: string
  /** Optional: `string | null` on select, and may be left out of an insert. */
  display_name: string | null
  role: Generated<Role>
  /** SQLite has no boolean; the column holds 0 or 1 and the driver answers with a number. */
  is_active: Generated<number>
  /** A database default: the insert may leave it out. */
  created_at: string
  /**
   * Prisma's client sets this on every write; the database knows nothing of it, so an insert
   * through Kysely has to give it.
   */
  updated_at: string
  /** A self relation: who brought this customer in. The customer stays when the referrer goes. */
  referrer_id: number | null
}

/**
 * One per user, destroyed with the user. A client-side key: Prisma makes the cuid, the database
 * has no default for it, so an insert through Kysely gives one.
 */
export interface Profile {
  id: string
  user_id: number
  bio: string | null
  /** Bytes: a BLOB, a Buffer in Node.js. */
  avatar: Buffer | null
}

/** An artist cannot be deleted while a record of theirs is in the catalogue. */
export interface Artist {
  id: Generated<number>
  name: string
}

/**
 * `Record` is a global type in TypeScript as well: the model's interface shadows it inside the
 * generated file, which does not use the global. Every scalar SQLite stores is here, each as the
 * driver hands it back.
 */
export interface Record {
  id: string
  title: string
  /**
   * BigInt: binds as a bigint, reads back as a number unless the connection asks for
   * safeIntegers, which would make every INTEGER column a bigint.
   */
  catalogue_no: ColumnType<number, number | bigint, number | bigint>
  /** Decimal: SQLite keeps it with numeric affinity, a REAL when it has a fraction. */
  price: ColumnType<number, number | string, number | string>
  /** Float, optional. */
  rating: number | null
  tracks: Generated<number>
  in_stock: Generated<number>
  /** DateTime, optional and without a default: text in, the same text out. */
  released_on: string | null
  /**
   * Json: SQLite keeps the text of it in a JSONB column, whose numeric affinity turns a
   * document that is a bare number into a number.
   */
  tracklist: ColumnType<string | number, string, string>
  cover: Buffer | null
  genre: Genre
  format: Generated<Format>
  artist_id: number
  created_at: string
  updated_at: string
}

export interface Tag {
  id: Generated<number>
  name: string
}

/** An order outlives its customer: it passes to the shop's own account, the default of the key. */
export interface Order {
  id: string
  customer_id: Generated<number>
  placed_at: string
  note: string | null
}

/**
 * A composite primary key: one line per record in an order. The lines go with the order; a
 * record that has been ordered stays in the catalogue (NoAction, checked when the statement
 * ends).
 */
export interface OrderItem {
  order_id: string
  record_id: string
  quantity: Generated<number>
  unit_price: ColumnType<number, number | string, number | string>
}

/**
 * One review per customer per record: a composite unique. The review goes with its record and
 * with its author.
 */
export interface Review {
  id: Generated<number>
  record_id: string
  author_id: number
  stars: number
  /** A literal default on a Float, and a String default. */
  weight: Generated<number>
  body: Generated<string>
}

/**
 * Columns named after words TypeScript reserves, and a table and a column whose database names
 * are not identifiers: the generated interface quotes those keys.
 */
export interface Setting {
  key: string
  type: string
  default: string | null
  delete: Generated<number>
  constructor: string | null
  'last-modified': string
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
