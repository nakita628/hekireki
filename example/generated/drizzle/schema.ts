import {
  bigint,
  bigserial,
  boolean,
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
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { createId } from '@paralleldrive/cuid2'

export const roleEnum = pgEnum('Role', ['ADMIN', 'EDITOR', 'VIEWER'])

export const visibilityEnum = pgEnum('visibility_level', ['public', 'private', 'link_only'])

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull().default('VIEWER'),
  interests: text('interests').array().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const profile = pgTable('profile', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  bio: text('bio'),
  nickname: varchar('nickname', { length: 64 }).notNull().default('anonymous'),
  age: smallint('age'),
  balance: numeric('balance', { precision: 10, scale: 2 }).notNull().default('0'),
  verified: boolean('verified').notNull().default(false),
  meta: jsonb('meta'),
  avatar: text('avatar'),
  lastSeen: timestamp('last_seen', { withTimezone: true, precision: 6 }),
})

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
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('idx_posts_authorId').on(table.authorId)],
)

export const tag = pgTable('tag', {
  id: serial('id').primaryKey(),
  label: text('label').notNull().unique(),
})

export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    body: text('body').notNull(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('idx_comments_postId_createdAt').on(table.postId, table.createdAt)],
)

export const follows = pgTable(
  'follows',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: text('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    since: timestamp('since').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.followerId, table.followingId] })],
)

export const category = pgTable(
  'category',
  { id: serial('id').primaryKey(), name: text('name').notNull(), parentId: integer('parent_id') },
  (table) => [unique().on(table.parentId, table.name)],
)

export const orders = pgTable('orders', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  total: numeric('total', { precision: 12, scale: 2 }).notNull(),
  placedAt: timestamp('placed_at').notNull().defaultNow(),
})

export const orderItems = pgTable(
  'order_items',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    orderId: bigint('order_id', { mode: 'bigint' })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    sku: varchar('sku', { length: 32 }).notNull(),
    qty: integer('qty').notNull().default(1),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [unique().on(table.orderId, table.sku)],
)

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  action: text('action').notNull(),
  payload: jsonb('payload').notNull().default({}),
  signature: text('signature'),
  loggedAt: timestamp('logged_at')
    .notNull()
    .default(sql`now()`),
})

export const actor = pgTable('actor', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
})

export const film = pgTable('film', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
})

export const postToTag = pgTable(
  '_PostToTag',
  {
    A: text('A')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    B: integer('B')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.A, table.B] })],
)

export const cast = pgTable(
  '_cast',
  {
    A: integer('A')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    B: integer('B')
      .notNull()
      .references(() => film.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.A, table.B] })],
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
