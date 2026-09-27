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
import { relations, sql } from 'drizzle-orm'
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

export const roleEnum = pgEnum('Role', ['ADMIN', 'EDITOR', 'VIEWER'])

export const visibilityEnum = pgEnum('visibility_level', ['public', 'private', 'link_only'])

export const users = pgTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    email: text('email').notNull(),
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

export const posts = pgTable(
  'posts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
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

export const tag = pgTable(
  'Tag',
  { id: serial('id').primaryKey(), label: text('label').notNull() },
  (table) => [uniqueIndex('Tag_label_key').on(table.label)],
)

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

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profile),
  posts: many(posts),
  comments: many(comments),
  orders: many(orders),
  followers: many(follows, { relationName: 'following' }),
  following: many(follows, { relationName: 'follower' }),
}))

export const profileRelations = relations(profile, ({ one }) => ({
  user: one(users, { fields: [profile.userId], references: [users.id] }),
}))

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  tags: many(postToTag),
  comments: many(comments),
}))

export const tagRelations = relations(tag, ({ many }) => ({ posts: many(postToTag) }))

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}))

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.followerId],
    references: [users.id],
    relationName: 'follower',
  }),
  following: one(users, {
    fields: [follows.followingId],
    references: [users.id],
    relationName: 'following',
  }),
}))

export const categoryRelations = relations(category, ({ one, many }) => ({
  parent: one(category, {
    fields: [category.parentId],
    references: [category.id],
    relationName: 'tree',
  }),
  children: many(category, { relationName: 'tree' }),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}))

export const actorRelations = relations(actor, ({ many }) => ({ films: many(cast) }))

export const filmRelations = relations(film, ({ many }) => ({ actors: many(cast) }))

export const postToTagRelations = relations(postToTag, ({ one }) => ({
  post: one(posts, { fields: [postToTag.A], references: [posts.id] }),
  tag: one(tag, { fields: [postToTag.B], references: [tag.id] }),
}))

export const castRelations = relations(cast, ({ one }) => ({
  actor: one(actor, { fields: [cast.A], references: [actor.id] }),
  film: one(film, { fields: [cast.B], references: [film.id] }),
}))
