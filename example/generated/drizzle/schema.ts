import {
  bigint,
  bigserial,
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { defineRelations, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { createId } from '@paralleldrive/cuid2'

const bytea = customType<{ data: Uint8Array }>({
  dataType: () => 'bytea',
})

const utcNow = (() => {
  let now: Date | undefined
  return () => {
    if (now === undefined) {
      now = new Date()
      queueMicrotask(() => {
        now = undefined
      })
    }
    return now
  }
})()

/** User role. No @map: the value names are stored verbatim. */
export const roleEnum = pgEnum('Role', ['ADMIN', 'EDITOR', 'VIEWER'])

/**
 * Enum with @map on every value and @@map on the enum itself:
 * the database stores the mapped values ("link_only"), while
 * generators receive the Prisma-level names ("LINK_ONLY").
 */
export const visibilityEnum = pgEnum('visibility_level', ['public', 'private', 'link_only'])

/**
 * Application user. Fully annotated for every validator generator,
 * with a UUIDv7 primary key, enum default, scalar list, @map columns,
 * @updatedAt, and relations of every cardinality.
 */
export const users = pgTable(
  'users',
  {
    /** Primary key (UUIDv7) */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** Unique login email */
    email: text('email').notNull(),
    /** Display name */
    name: text('name').notNull(),
    role: roleEnum('role').notNull().default('VIEWER'),
    interests: text('interests').array().default([]),
    createdAt: timestamp('created_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$defaultFn(utcNow),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull().$onUpdate(utcNow),
  },
  (table) => [uniqueIndex('users_email_key').on(table.email)],
)

/**
 * One-to-one relation with native @db.* types, literal defaults,
 * and optional scalars of every flavour. ConfigDict passthrough: the
 * Pydantic model rejects unknown keys (extra='forbid').
 */
export const profile = pgTable(
  'Profile',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id').notNull(),
    bio: text('bio'),
    nickname: varchar('nickname', { length: 64 }).notNull().default('anonymous'),
    age: smallint('age'),
    balance: numeric('balance', { precision: 10, scale: 2 }).notNull().default('0'),
    verified: boolean('verified').notNull().default(false),
    meta: jsonb('meta'),
    avatar: bytea('avatar'),
    lastSeen: timestamp('last_seen', { withTimezone: true, precision: 6 }),
  },
  (table) => [
    uniqueIndex('Profile_user_id_key').on(table.userId),
    foreignKey({
      name: 'Profile_user_id_fkey',
      columns: [table.userId],
      foreignColumns: [users.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

/**
 * @@map + @map column names, FK with a referential action,
 * mapped-enum default, and an implicit many-to-many to Tag.
 */
export const posts = pgTable(
  'posts',
  {
    /** Primary key */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Article title */
    title: text('title').notNull(),
    content: text('content'),
    visibility: visibilityEnum('visibility').notNull().default('link_only'),
    published: boolean('published').notNull().default(false),
    viewCount: integer('view_count').notNull().default(0),
    authorId: text('author_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$defaultFn(utcNow),
  },
  (table) => [
    index('posts_author_id_idx').on(table.authorId),
    foreignKey({
      name: 'posts_author_id_fkey',
      columns: [table.authorId],
      foreignColumns: [users.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

/** Implicit many-to-many partner of Post (join table `_PostToTag`). */
export const tag = pgTable(
  'Tag',
  { id: serial('id').primaryKey(), label: text('label').notNull() },
  (table) => [uniqueIndex('Tag_label_key').on(table.label)],
)

/**
 * Two foreign keys with different referential actions
 * (Cascade vs SetNull) and a composite index.
 */
export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    body: text('body').notNull(),
    postId: text('post_id').notNull(),
    authorId: text('author_id'),
    createdAt: timestamp('created_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$defaultFn(utcNow),
  },
  (table) => [
    index('comments_post_id_created_at_idx').on(table.postId, table.createdAt),
    foreignKey({
      name: 'comments_post_id_fkey',
      columns: [table.postId],
      foreignColumns: [posts.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'comments_author_id_fkey',
      columns: [table.authorId],
      foreignColumns: [users.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  ],
)

/** Composite primary key + two named relations to the same model. */
export const follows = pgTable(
  'follows',
  {
    followerId: text('follower_id').notNull(),
    followingId: text('following_id').notNull(),
    since: timestamp('since', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$defaultFn(utcNow),
  },
  (table) => [
    primaryKey({ name: 'follows_pkey', columns: [table.followerId, table.followingId] }),
    foreignKey({
      name: 'follows_follower_id_fkey',
      columns: [table.followerId],
      foreignColumns: [users.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      name: 'follows_following_id_fkey',
      columns: [table.followingId],
      foreignColumns: [users.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

/** Self-relation (adjacency-list tree) with a composite unique. */
export const category = pgTable(
  'Category',
  { id: serial('id').primaryKey(), name: text('name').notNull(), parentId: integer('parent_id') },
  (table) => [
    uniqueIndex('Category_parent_id_name_key').on(table.parentId, table.name),
    foreignKey({
      name: 'Category_parent_id_fkey',
      columns: [table.parentId],
      foreignColumns: [table.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  ],
)

/** BigInt autoincrement primary key (bigserial) and money as Decimal. */
export const orders = pgTable(
  'orders',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: text('user_id').notNull(),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    placedAt: timestamp('placed_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$defaultFn(utcNow),
  },
  (table) => [
    foreignKey({ name: 'orders_user_id_fkey', columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)

/** Child of Order with a composite unique constraint. */
export const orderItems = pgTable(
  'order_items',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    orderId: bigint('order_id', { mode: 'bigint' }).notNull(),
    sku: varchar('sku', { length: 32 }).notNull(),
    qty: integer('qty').notNull().default(1),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [
    uniqueIndex('order_items_order_id_sku_key').on(table.orderId, table.sku),
    foreignKey({
      name: 'order_items_order_id_fkey',
      columns: [table.orderId],
      foreignColumns: [orders.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

/** DB-side generated defaults (dbgenerated) plus Json / Bytes payloads. */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  action: text('action').notNull(),
  payload: jsonb('payload').notNull().default({}),
  signature: bytea('signature'),
  loggedAt: timestamp('logged_at', { precision: 3 })
    .notNull()
    .default(sql`now()`),
})

/**
 * Named implicit many-to-many: the join table is `_cast`,
 * not `_ActorToFilm`.
 */
export const actor = pgTable('Actor', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
})

export const film = pgTable('Film', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
})

export const postToTag = pgTable(
  '_PostToTag',
  { A: text('A').notNull(), B: integer('B').notNull() },
  (table) => [
    primaryKey({ name: '_PostToTag_AB_pkey', columns: [table.A, table.B] }),
    index('_PostToTag_B_index').on(table.B),
    foreignKey({ name: '_PostToTag_A_fkey', columns: [table.A], foreignColumns: [posts.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({ name: '_PostToTag_B_fkey', columns: [table.B], foreignColumns: [tag.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const cast = pgTable(
  '_cast',
  { A: integer('A').notNull(), B: integer('B').notNull() },
  (table) => [
    primaryKey({ name: '_cast_AB_pkey', columns: [table.A, table.B] }),
    index('_cast_B_index').on(table.B),
    foreignKey({ name: '_cast_A_fkey', columns: [table.A], foreignColumns: [actor.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({ name: '_cast_B_fkey', columns: [table.B], foreignColumns: [film.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

export const relations = defineRelations(
  {
    users,
    profile,
    posts,
    tag,
    comments,
    follows,
    category,
    orders,
    orderItems,
    auditLogs,
    actor,
    film,
    postToTag,
    cast,
  },
  (r) => ({
    users: {
      profile: r.one.profile({ from: r.users.id, to: r.profile.userId }),
      posts: r.many.posts(),
      comments: r.many.comments(),
      orders: r.many.orders(),
      followers: r.many.follows({ alias: 'following' }),
      following: r.many.follows({ alias: 'follower' }),
    },
    profile: { user: r.one.users({ from: r.profile.userId, to: r.users.id, optional: false }) },
    posts: {
      author: r.one.users({ from: r.posts.authorId, to: r.users.id, optional: false }),
      tags: r.many.tag({
        from: r.posts.id.through(r.postToTag.A),
        to: r.tag.id.through(r.postToTag.B),
      }),
      comments: r.many.comments(),
    },
    tag: {
      posts: r.many.posts({
        from: r.tag.id.through(r.postToTag.B),
        to: r.posts.id.through(r.postToTag.A),
      }),
    },
    comments: {
      post: r.one.posts({ from: r.comments.postId, to: r.posts.id, optional: false }),
      author: r.one.users({ from: r.comments.authorId, to: r.users.id }),
    },
    follows: {
      follower: r.one.users({
        from: r.follows.followerId,
        to: r.users.id,
        optional: false,
        alias: 'follower',
      }),
      following: r.one.users({
        from: r.follows.followingId,
        to: r.users.id,
        optional: false,
        alias: 'following',
      }),
    },
    category: {
      parent: r.one.category({ from: r.category.parentId, to: r.category.id, alias: 'tree' }),
      children: r.many.category({ alias: 'tree' }),
    },
    orders: {
      user: r.one.users({ from: r.orders.userId, to: r.users.id, optional: false }),
      items: r.many.orderItems(),
    },
    orderItems: {
      order: r.one.orders({ from: r.orderItems.orderId, to: r.orders.id, optional: false }),
    },
    actor: {
      films: r.many.film({ from: r.actor.id.through(r.cast.A), to: r.film.id.through(r.cast.B) }),
    },
    film: {
      actors: r.many.actor({ from: r.film.id.through(r.cast.B), to: r.actor.id.through(r.cast.A) }),
    },
    postToTag: {
      post: r.one.posts({ from: r.postToTag.A, to: r.posts.id, optional: false }),
      tag: r.one.tag({ from: r.postToTag.B, to: r.tag.id, optional: false }),
    },
    cast: {
      actor: r.one.actor({ from: r.cast.A, to: r.actor.id, optional: false }),
      film: r.one.film({ from: r.cast.B, to: r.film.id, optional: false }),
    },
  }),
)
